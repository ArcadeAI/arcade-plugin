import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".text", ".json", ".yaml", ".yml"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico"]);
const TEXT_NAMES = /^(?:readme|licen[cs]e|notice|\.gitignore)$/i;
const PACKAGE_CONFIG = /^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|bunfig\.toml|uv\.toml|pyproject\.toml|pip\.(?:conf|ini)|\.npmrc|\.yarnrc(?:\.yml)?|\.pnpmfile\..+|deno\.jsonc?|composer\.json|environment\.ya?ml|requirements(?:-[\w.-]+)?\.txt)$/i;
const PACKAGE_SOURCE = [
  /--(?:registry|extra-index-url|index-url|find-links|trusted-host|proxy)\b/i,
  /\b(?:UV|PIP)_(?:EXTRA_)?INDEX_URL\s*=/i,
  /\bpip3?\s+install\b.*(?:^|\s)-i(?:\s|=)/i,
  /(?:^|[\s{,])["']?(?:@[\w.-]+:)?(?:npm_config_)?(?:registry|index-url|extra-index-url|find-links|trusted-host|proxy|https-proxy|http-proxy|npmRegistryServer|npmScopes|npmRegistries|packageExtensions|yarnPath)["']?\s*[:=]/i,
  /\b(?:npm|pnpm|yarn|bun|pip)\s+config\s+set\b.*\b(?:registry|index-url|proxy)\b/i,
];

/** Restrictions in the directory rejection for an unverified organization. */
export function restrictedFileProblems(file, bytes) {
  const problems = [];
  const name = basename(file);
  const extension = extname(name).toLowerCase();
  if (/[\x00-\x1f\x7f<>:"|?*\\]/.test(file)) problems.push("unsupported character in path");
  if (PACKAGE_CONFIG.test(name)) problems.push("package-manager configuration");
  if (/(?:^|\/)\.claude\/skills(?:\/|$)/.test(file)) problems.push("repository-local Claude skills");
  if (/(?:^|\/)\.claude-plugin\//.test(file) && !file.startsWith(".claude-plugin/")) problems.push("another plugin folder");
  if (file.startsWith(".claude-plugin/") && file !== ".claude-plugin/plugin.json" && !IMAGE_EXTENSIONS.has(extension)) {
    problems.push("unexpected file in .claude-plugin");
  }
  if (/^egress\.(?:json|ya?ml)$/i.test(name) || (file.split("/").includes("egress") && [".json", ".yaml", ".yml"].includes(extension))) problems.push("egress configuration");
  if (/^(?:hooks|mcp|lsp|monitors)\.json$/i.test(name)) problems.push("configuration Claude does not read in this package");
  if (file.startsWith("output-styles/")) problems.push("undeclared output style");
  if (/^(?:agents|commands)\//.test(file) && extension !== ".md") problems.push("agents and commands must be Markdown");
  if (IMAGE_EXTENSIONS.has(extension)) return problems;
  if (!TEXT_EXTENSIONS.has(extension) && !TEXT_NAMES.test(name)) problems.push("file type requires a verified organization");
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (bytes.includes(0)) problems.push("NUL byte in text");
    if (text.startsWith("#!")) problems.push("executable shebang");
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    if (/^(?:skills|agents|commands)\//.test(file) && frontmatter && /(?:^|[\s{,])["']?hooks["']?\s*:/m.test(frontmatter)) problems.push("component frontmatter hooks");
    if (text.split(/\r?\n/).some((line) => PACKAGE_SOURCE.some((pattern) => pattern.test(line)))) problems.push("package-source configuration in text");
  } catch {
    problems.push("invalid UTF-8 text");
  }
  return problems;
}

/** Read every file, including untracked and hidden files, in the submitted folder. */
export function validateClaudeDirectory(root) {
  const problems = [];
  function visit(dir = "") {
    for (const name of readdirSync(join(root, dir))) {
      const file = dir ? `${dir}/${name}` : name;
      const stat = lstatSync(join(root, file));
      if (stat.isDirectory()) visit(file);
      else if (!stat.isFile()) problems.push(`${file}: not a regular file`);
      else for (const problem of restrictedFileProblems(file, readFileSync(join(root, file)))) problems.push(`${file}: ${problem}`);
    }
  }
  visit();
  const manifest = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"));
  if (manifest.hooks !== undefined) problems.push("plugin.json: hooks require a verified organization");
  for (const field of ["lspServers", "monitors", "outputStyles"]) {
    if (manifest[field] !== undefined) problems.push(`plugin.json: ${field} is not part of the Claude directory package`);
  }
  if (typeof manifest.mcpServers !== "object" || !manifest.mcpServers || Array.isArray(manifest.mcpServers)) {
    problems.push("plugin.json: declare remote MCP servers inline");
  } else for (const [name, server] of Object.entries(manifest.mcpServers)) {
    if (server?.type !== "http" || !/^https:\/\//.test(server.url) || server.command !== undefined) problems.push(`plugin.json: ${name} must be a remote HTTPS MCP server`);
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? "../plugin");
  const problems = validateClaudeDirectory(root);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else console.log(`PASS: ${root} meets the unverified-organization file and hook restrictions`);
}
