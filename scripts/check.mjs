#!/usr/bin/env node
// Repo-wide structural checks. No runtime dependencies beyond Node.
// Run with: node scripts/check.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTING_MARKERS } from "../hooks/routing-guidance.mjs";
import {
  CLAUDE_CODE_CLI_VERSION,
  CI_NODE_VERSION,
  ENDPOINT,
  INSTALL_SLUG,
  MCP_REMOTE_PACKAGE,
  MCP_SCHEMA,
  MCP_SERVER_NAME,
  MCPB_DOCUMENTATION_URL,
  PLUGINS_CLI_VERSION,
  PLUGIN_SCHEMA,
  VENDORED_SCHEMAS,
} from "./constants.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const errors = [];
const fail = (message) => errors.push(message);
const read = (path) => readFileSync(join(ROOT, path), "utf8");

const jsonFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === ".git" || entry === "node_modules") continue;
    const rel = join(dir, entry);
    const abs = join(ROOT, rel);
    if (statSync(abs).isDirectory()) walk(rel);
    else if (entry.endsWith(".json")) jsonFiles.push(rel);
  }
};
walk(".");

const json = {};
for (const file of jsonFiles) {
  try {
    json[file] = JSON.parse(read(file));
  } catch (parseError) {
    fail(`${file}: invalid JSON — ${parseError.message}`);
  }
}

for (const required of [
  "plugin.json",
  "mcp.json",
  "skills",
  "agents",
  "commands",
  "hooks/hooks.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
]) {
  if (!existsSync(join(ROOT, required))) {
    fail(`missing required path: ${required}`);
  }
}

for (const forbidden of ["rules", ".mcp.json", ".plugin"]) {
  if (existsSync(join(ROOT, forbidden))) {
    fail(`root ${forbidden} must live under clients/ and be declared explicitly`);
  }
}

const portable = json["plugin.json"];
if (portable) {
  if (portable.$schema !== PLUGIN_SCHEMA) {
    fail(`plugin.json: $schema must be ${PLUGIN_SCHEMA}`);
  }
  if (portable.repository !== "https://github.com/ArcadeAI/arcade-plugin") {
    fail('plugin.json: repository must be "https://github.com/ArcadeAI/arcade-plugin"');
  }
}

const portableMcp = json["mcp.json"];
if (portableMcp) {
  if (portableMcp.$schema !== MCP_SCHEMA) {
    fail(`mcp.json: $schema must be ${MCP_SCHEMA}`);
  }
  if (portableMcp.mcpServers?.arcade?.type !== "streamable-http") {
    fail('mcp.json: arcade server must use type "streamable-http"');
  }
}

for (const manifest of [".cursor-plugin/plugin.json", ".claude-plugin/plugin.json"]) {
  if (json[manifest]?.$schema !== undefined) {
    fail(`${manifest}: must not declare $schema`);
  }
}

for (const key of ["skills", "agents", "commands", "hooks"]) {
  if (key in (json[".claude-plugin/plugin.json"] ?? {})) {
    fail(
      `.claude-plugin/plugin.json: drop "${key}" — Claude discovers default locations automatically`,
    );
  }
}

const cursorManifest = json[".cursor-plugin/plugin.json"];
if (cursorManifest) {
  for (const key of [
    "skills",
    "agents",
    "commands",
    "rules",
    "hooks",
    "mcpServers",
  ]) {
    const value = cursorManifest[key];
    if (typeof value !== "string") {
      fail(`.cursor-plugin/plugin.json: missing string path for "${key}"`);
      continue;
    }
    const target = value.replace(/^\.\//, "");
    if (!existsSync(join(ROOT, target))) {
      fail(`.cursor-plugin/plugin.json: ${key} path does not exist: ${value}`);
    }
  }
}

if (json["clients/claude/mcp.json"]?.mcpServers?.arcade?.type !== "http") {
  fail('clients/claude/mcp.json: arcade server must use type "http"');
}

for (const file of [
  "mcp.json",
  "clients/cursor/mcp.json",
  "clients/claude/mcp.json",
  "clients/claude-desktop/claude_desktop_config.json",
  "clients/claude-desktop/mcpb/manifest.json",
  "README.md",
]) {
  if (!read(file).includes(ENDPOINT)) {
    fail(`${file}: must reference ${ENDPOINT}`);
  }
}

for (const file of ["mcp.json", "clients/cursor/mcp.json", "clients/claude/mcp.json"]) {
  if (!json[file]?.mcpServers?.arcade) {
    fail(`${file}: mcpServers must define the "arcade" server key`);
  }
  if (json[file]?.mcpServers?.[MCP_SERVER_NAME]?.url !== ENDPOINT) {
    fail(`${file}: mcpServers.${MCP_SERVER_NAME}.url must be ${ENDPOINT}`);
  }
}

for (const routingFile of [
  "skills/try-arcade/SKILL.md",
  "agents/arcade-operator.agent.md",
  "clients/cursor/rules/arcade.mdc",
]) {
  const content = read(routingFile);
  if (!content.includes(MCP_SERVER_NAME)) {
    fail(`${routingFile}: must reference MCP server name "${MCP_SERVER_NAME}"`);
  }
  if (!content.includes("api.bosslevel.dev")) {
    fail(`${routingFile}: must reference plugin gateway api.bosslevel.dev`);
  }
}

const cursorHooks = read("clients/cursor/hooks/hooks.json");
if (!cursorHooks.includes("${CURSOR_PLUGIN_ROOT}")) {
  fail("clients/cursor/hooks/hooks.json: must use ${CURSOR_PLUGIN_ROOT}");
}
if (cursorHooks.includes("node ./hooks/")) {
  fail("clients/cursor/hooks/hooks.json: must not use project-relative ./hooks/ paths");
}

for (const hooksFile of ["hooks/hooks.json"]) {
  const content = read(hooksFile);
  if (!content.includes("${CLAUDE_PLUGIN_ROOT}")) {
    fail(`${hooksFile}: must use ${"${CLAUDE_PLUGIN_ROOT}"}`);
  }
  if (!content.includes("hooks/session-start.mjs")) {
    fail(`${hooksFile}: must reference hooks/session-start.mjs`);
  }
  if (!content.includes("hooks/user-prompt-submit.mjs")) {
    fail(`${hooksFile}: must reference hooks/user-prompt-submit.mjs`);
  }
}

if (!existsSync(join(ROOT, "clients/claude-desktop/mcpb/manifest.json"))) {
  fail("missing clients/claude-desktop/mcpb/manifest.json");
}

const version = read("VERSION").trim();
const versionedManifests = [
  "plugin.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  "clients/claude-desktop/mcpb/manifest.json",
];
for (const manifestPath of versionedManifests) {
  const manifestVersion = json[manifestPath]?.version;
  if (manifestVersion && manifestVersion !== version) {
    fail(`${manifestPath} version ${manifestVersion} != VERSION ${version}`);
  }
}

const mcpRemoteSurfaces = [
  "clients/claude-desktop/claude_desktop_config.json",
  "clients/claude-desktop/mcpb/manifest.json",
];
for (const surface of mcpRemoteSurfaces) {
  if (!read(surface).includes(MCP_REMOTE_PACKAGE)) {
    fail(`${surface}: must pin ${MCP_REMOTE_PACKAGE}`);
  }
}

const buildScript = read("scripts/build-claude-desktop-mcpb.mjs");
if (
  !buildScript.includes('from "./constants.mjs"') ||
  !buildScript.includes("MCP_REMOTE_PACKAGE")
) {
  fail("scripts/build-claude-desktop-mcpb.mjs: must import MCP_REMOTE_PACKAGE from constants.mjs");
}

const mcpbManifest = json["clients/claude-desktop/mcpb/manifest.json"];
if (mcpbManifest?.documentation !== MCPB_DOCUMENTATION_URL) {
  fail(
    `clients/claude-desktop/mcpb/manifest.json: documentation must be ${MCPB_DOCUMENTATION_URL}`,
  );
}

const mcpbEntry = read("clients/claude-desktop/mcpb/server/index.js");
if (!mcpbEntry.includes("mcp_config") || !mcpbEntry.includes("process.exit(0)")) {
  fail(
    "clients/claude-desktop/mcpb/server/index.js: must document mcp_config bridge and exit safely",
  );
}

const cursorRule = read("clients/cursor/rules/arcade.mdc");
for (const marker of ROUTING_MARKERS) {
  if (!cursorRule.includes(marker)) {
    fail(`clients/cursor/rules/arcade.mdc: missing routing marker "${marker}"`);
  }
}

if (!read("README.md").includes("personal trial")) {
  fail("README.md: must describe the package as for personal trial use");
}

if (!read("README.md").includes(`npx plugins add ${INSTALL_SLUG}`)) {
  fail(`README.md: must document npx plugins add ${INSTALL_SLUG}`);
}

const packageJson = JSON.parse(read("package.json"));
const devDependencies = packageJson.devDependencies ?? {};
const ciPins = {
  plugins: PLUGINS_CLI_VERSION,
  "@anthropic-ai/claude-code": CLAUDE_CODE_CLI_VERSION,
  "@anthropic-ai/mcpb": MCPB_CLI_VERSION,
};
for (const [name, version] of Object.entries(ciPins)) {
  if (devDependencies[name] !== version) {
    fail(
      `package.json devDependencies.${name} must be exact "${version}", got "${devDependencies[name] ?? "missing"}"`,
    );
  }
}

for (const [schemaUrl, localPath] of Object.entries(VENDORED_SCHEMAS)) {
  if (!existsSync(join(ROOT, localPath))) {
    fail(`missing vendored schema for ${schemaUrl}: ${localPath}`);
  }
}

const verifyScripts = {
  "verify:discover": "plugins discover .",
  "verify:claude": "claude plugin validate .",
};
for (const [scriptName, expected] of Object.entries(verifyScripts)) {
  if (packageJson.scripts?.[scriptName] !== expected) {
    fail(`package.json scripts.${scriptName} must be "${expected}"`);
  }
}

for (const workflow of [".github/workflows/check.yml", ".github/workflows/release.yml"]) {
  const content = read(workflow);
  if (!content.includes(`node-version: "${CI_NODE_VERSION}"`)) {
    fail(`${workflow}: must pin node-version to "${CI_NODE_VERSION}"`);
  }
}

const installIndex = read("docs/install/README.md");
for (const page of readdirSync(join(ROOT, "docs/install"))) {
  if (page === "README.md" || !page.endsWith(".md")) continue;
  if (!installIndex.includes(`(${page})`)) {
    fail(`docs/install/${page}: not linked from docs/install/README.md`);
  }
}

let trackedArchives = [];
try {
  trackedArchives = execFileSync("git", ["ls-files", "*.zip", "*.mcpb", "*.dxt"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
} catch {
  // Outside a git checkout in some environments.
}
for (const archive of trackedArchives) {
  fail(
    `${archive}: archives must not be committed — attach to GitHub Releases instead`,
  );
}

if (errors.length > 0) {
  console.error(`check.mjs: ${errors.length} problem(s)\n`);
  for (const message of errors) console.error(`  ✗ ${message}`);
  process.exit(1);
}

console.log(
  `check.mjs: all checks passed (${jsonFiles.length} JSON files, endpoint ok)`,
);
