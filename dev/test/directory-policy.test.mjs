// Checks the plugin against the rules the Claude plugin directory's developer
// portal uses to block a version or hold it for a reviewer. The portal's own
// checks only run inside the portal; these rules come from
// https://claude.com/docs/plugins/pre-submission-checklist

import assert from "node:assert/strict";
import { defaultMcpUrl } from "../scripts/claude-directory-policy.mjs";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = join(REPO, "clients/claude");

const KIB = 1024;
const MIB = 1024 * KIB;
const PLUGIN_MANIFEST = ".claude-plugin/plugin.json";

const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb"];
const SYSTEM_FILE_NAMES = [".ds_store", "thumbs.db", "desktop.ini", "__macosx"];
const DEVICE_NAMES = ["con", "prn", "aux", "nul"];
for (let n = 1; n <= 9; n++) DEVICE_NAMES.push(`com${n}`, `lpt${n}`);
const REWRITING_ATTRIBUTES = ["export-ignore", "export-subst", "filter", "ident", "working-tree-encoding"];
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const REMOTE_MCP_TYPES = ["http", "sse", "ws"];
const MEDIA_SIGNATURES = {
  png: (bytes) => startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (bytes) => startsWith(bytes, 0, [0xff, 0xd8, 0xff]),
  jpeg: (bytes) => startsWith(bytes, 0, [0xff, 0xd8, 0xff]),
  gif: (bytes) => startsWith(bytes, 0, "GIF87a") || startsWith(bytes, 0, "GIF89a"),
  webp: (bytes) => startsWith(bytes, 0, "RIFF") && startsWith(bytes, 8, "WEBP"),
  ttf: (bytes) => startsWith(bytes, 0, [0x00, 0x01, 0x00, 0x00]) || startsWith(bytes, 0, "true"),
  otf: (bytes) => startsWith(bytes, 0, "OTTO"),
  woff: (bytes) => startsWith(bytes, 0, "wOFF"),
  woff2: (bytes) => startsWith(bytes, 0, "wOF2"),
};
// The lookbehind lets a match start only at the beginning of a run of path
// characters. Without it, a long line with no match takes quadratic time.
const MEDIA_PATH = new RegExp(`(?<![\\w./@:~-])[\\w./@:~-]+\\.(?:${Object.keys(MEDIA_SIGNATURES).join("|")})\\b`, "gi");
const INLINE_CODE = /`[^`]*`/g;
// Markdown that Claude Code runs as instructions. In other Markdown, such as the
// README and changelog, only paths in backticks or code blocks count.
const COMPONENT_FOLDERS = ["agents/", "commands/", "skills/"];

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * MIB });
}

function statOf(file) {
  return lstatSync(join(ROOT, file), { throwIfNoEntry: false });
}

function listFiles() {
  const listed = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    // git lists an untracked nested repository as "name/".
    .map((file) => file.replace(/\/$/, ""));
  return [...new Set(listed)].filter((file) => statOf(file));
}

const FILES = listFiles();
const REGULAR_FILES = FILES.filter((file) => statOf(file).isFile());
const REPO_FILES = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: REPO, encoding: "utf8",
}).split("\0").filter((file) => file && lstatSync(join(REPO, file), { throwIfNoEntry: false }));

function read(file) {
  return readFileSync(join(ROOT, file));
}

function readJson(file) {
  return JSON.parse(read(file).toString("utf8"));
}

function startsWith(bytes, offset, expected) {
  const wanted = Buffer.from(expected);
  return bytes.subarray(offset, offset + wanted.length).equals(wanted);
}

function isBinary(bytes) {
  return bytes.subarray(0, 8000).includes(0);
}

function extensionOf(file) {
  return posix.extname(file).slice(1).toLowerCase();
}

function isMedia(file) {
  return extensionOf(file) in MEDIA_SIGNATURES;
}

function assertNone(offenders, rule) {
  assert.deepEqual(offenders, [], `${rule}\nOffending files:\n  ${offenders.join("\n  ")}`);
}

/** Every file and folder path, so a folder name is checked once. */
function allPaths(files) {
  const paths = new Set();
  for (const file of files) {
    const segments = file.split("/");
    for (let i = 1; i <= segments.length; i++) paths.add(segments.slice(0, i).join("/"));
  }
  return paths;
}

function fileNameProblems(files) {
  const problems = [];
  const spellings = new Map();
  for (const path of allPaths(files)) {
    const name = posix.basename(path);
    if (name.includes(":")) problems.push(`${path}: contains a colon`);
    if (/[. ]$/.test(name)) problems.push(`${path}: ends with a dot or space`);
    if (DEVICE_NAMES.includes(name.split(".")[0].toLowerCase())) problems.push(`${path}: is a Windows device name`);
    const key = path.toLowerCase();
    if (!spellings.has(key)) spellings.set(key, []);
    spellings.get(key).push(path);
  }
  for (const paths of spellings.values()) {
    if (paths.length > 1) problems.push(`${paths.join(", ")}: differ only by case`);
  }
  return problems;
}

function isProseMarkdown(file) {
  return file.endsWith(".md") && !COMPONENT_FOLDERS.some((folder) => file.startsWith(folder));
}

/** Image and font paths named in a text file. In prose Markdown, only paths in backticks or code blocks. */
function mediaPathMentions(file, text) {
  const mentions = [];
  let inFence = false;
  text.split("\n").forEach((line, index) => {
    let searchable = line;
    if (isProseMarkdown(file)) {
      if (/^\s{0,3}(```|~~~)/.test(line)) {
        inFence = !inFence;
        return;
      }
      if (!inFence) searchable = (line.match(INLINE_CODE) ?? []).join(" ");
    }
    for (const [path] of searchable.matchAll(MEDIA_PATH)) {
      if (!path.includes("://")) mentions.push({ line: index + 1, path });
    }
  });
  return mentions;
}

function proseWordCount(markdown) {
  let inFence = false;
  let count = 0;
  for (const line of markdown.split("\n")) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      count += line.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
    }
  }
  return count;
}

function mcpServerSources() {
  const sources = [];
  const declared = readJson(PLUGIN_MANIFEST).mcpServers;
  if (typeof declared === "string" || Array.isArray(declared)) {
    for (const path of Array.isArray(declared) ? declared : [declared]) {
      const file = posix.normalize(path);
      sources.push({ file, servers: readJson(file).mcpServers ?? {} });
    }
  } else if (declared) {
    sources.push({ file: PLUGIN_MANIFEST, servers: declared });
  }
  if (FILES.includes(".mcp.json") && !sources.some((source) => source.file === ".mcp.json")) {
    sources.push({ file: ".mcp.json", servers: readJson(".mcp.json").mcpServers ?? {} });
  }
  return sources;
}

test("the plugin folder contains .claude-plugin/plugin.json", () => {
  assert.ok(FILES.includes(PLUGIN_MANIFEST), `Rule: submit a folder that contains ${PLUGIN_MANIFEST} (blocks). It is missing.`);
});

test("package.json does not sit beside a lockfile at the plugin root", () => {
  const lockfiles = LOCKFILES.filter((file) => FILES.includes(file));
  const offenders = FILES.includes("package.json") && lockfiles.length > 0 ? ["package.json", ...lockfiles] : [];
  assertNone(
    offenders,
    "Rule: package.json beside a lockfile at the plugin root is held for a reviewer (Dependencies install from a lockfile), because Claude Code installs those packages when a user installs the plugin.",
  );
});

test("no macOS or Windows system files", () => {
  const offenders = FILES.filter((file) => file.split("/").some((name) => SYSTEM_FILE_NAMES.includes(name.toLowerCase())));
  assertNone(offenders, "Rule: remove .DS_Store, Thumbs.db, desktop.ini, and __MACOSX entries (blocks).");
});

test("no symbolic links or submodules", () => {
  const offenders = new Map();
  for (const entry of git(["ls-files", "-s", "-z"]).split("\0").filter(Boolean)) {
    const [info, file] = entry.split("\t");
    const mode = info.split(" ")[0];
    if (mode === "120000") offenders.set(file, `${file} (symbolic link)`);
    if (mode === "160000") offenders.set(file, `${file} (submodule)`);
  }
  for (const file of FILES) {
    const stat = statOf(file);
    if (stat.isSymbolicLink() && !offenders.has(file)) offenders.set(file, `${file} (symbolic link)`);
    if (stat.isDirectory() && !offenders.has(file)) offenders.set(file, `${file} (nested repository or submodule)`);
  }
  assertNone([...offenders.values()], "Rule: commit regular files and folders, not symbolic links or Git submodules (blocks where the plugin loads the entry).");
});

test("file and folder names are valid on Windows and macOS", () => {
  assertNone(
    fileNameProblems(REPO_FILES),
    "Rule: no colon, no trailing dot or space, no Windows device name, and no two names that differ only by case (validation stops).",
  );
});

test("no .gitattributes sets export-ignore, export-subst, or filter", () => {
  const offenders = [];
  for (const file of REPO_FILES.filter((name) => posix.basename(name) === ".gitattributes")) {
    readFileSync(join(REPO, file))
      .toString("utf8")
      .split("\n")
      .forEach((line, index) => {
        const words = line.trim().split(/\s+/);
        if (words[0] === "" || words[0].startsWith("#")) return;
        for (const attribute of words.slice(1)) {
          const name = attribute.replace(/^[-!]/, "").split("=")[0];
          if (REWRITING_ATTRIBUTES.includes(name)) offenders.push(`${file}:${index + 1}: ${attribute}`);
        }
      });
  }
  assertNone(offenders, "Rule: keep export-ignore, export-subst, and filter out of every .gitattributes file (validation stops).");
});

test("file count and file sizes are within the limits", () => {
  const offenders = [];
  const pathCount = allPaths(FILES).size;
  if (pathCount >= 10000) offenders.push(`${pathCount} files and folders; the limit is fewer than 10,000 (validation stops)`);
  if (FILES.length > 512) offenders.push(`${FILES.length} files; the limit is 512 (held for a reviewer)`);
  for (const file of REGULAR_FILES) {
    const size = statOf(file).size;
    if (size >= 5 * MIB) {
      offenders.push(`${file}: ${size} bytes; every file must be under 5 MiB (validation stops)`);
    } else if (!isMedia(file) && size >= 256 * KIB) {
      offenders.push(`${file}: ${size} bytes; files that are not images or fonts must be under 256 KiB (held for a reviewer)`);
    }
  }
  assertNone(offenders, "Rule: fewer than 10,000 files and folders, at most 512 files, every file under 5 MiB, and every non-image, non-font file under 256 KiB.");
});

test("only text files, PNG, JPEG, GIF, WebP images, and fonts", () => {
  const offenders = [];
  for (const file of REGULAR_FILES) {
    const bytes = read(file);
    const signature = MEDIA_SIGNATURES[extensionOf(file)];
    if (signature && !signature(bytes)) {
      offenders.push(`${file}: content does not match its ${extensionOf(file)} extension`);
    } else if (!signature && isBinary(bytes)) {
      offenders.push(`${file}: binary file that is not a PNG, JPEG, GIF, or WebP image or a font`);
    }
  }
  assertNone(offenders, "Rule: include only text files, PNG, JPEG, GIF, and WebP images, and font files; any other binary file is held for a reviewer.");
});

test("plugin name, displayName, and author.name are valid", () => {
  const manifest = readJson(PLUGIN_MANIFEST);
  const offenders = [];
  if (typeof manifest.name !== "string" || !NAME_PATTERN.test(manifest.name)) {
    offenders.push(`${PLUGIN_MANIFEST}: name ${JSON.stringify(manifest.name)} must be lowercase letters, digits, and hyphens, up to 64 characters, starting and ending with a letter or digit`);
  }
  if (manifest.displayName !== undefined && !(typeof manifest.displayName === "string" && PRINTABLE_ASCII.test(manifest.displayName))) {
    offenders.push(`${PLUGIN_MANIFEST}: displayName ${JSON.stringify(manifest.displayName)} must be printable ASCII`);
  }
  const authorName = manifest.author?.name;
  if (!(typeof authorName === "string" && PRINTABLE_ASCII.test(authorName))) {
    offenders.push(`${PLUGIN_MANIFEST}: author.name ${JSON.stringify(authorName)} must be set and printable ASCII`);
  }
  assertNone(offenders, "Rule: name matches the directory's pattern; displayName and author.name use one writing system with no look-alike or invisible characters (blocks).");
});

test("README has at least 40 words and the plugin has a license", () => {
  const offenders = [];
  if (!FILES.includes("README.md")) {
    offenders.push("README.md is missing");
  } else {
    const words = proseWordCount(read("README.md").toString("utf8"));
    if (words < 40) offenders.push(`README.md has ${words} words outside code blocks; it needs at least 40`);
  }
  const hasLicenseFile = FILES.some((file) => /^licen[cs]e(\.[a-z]+)?$/i.test(file));
  const license = readJson(PLUGIN_MANIFEST).license;
  if (!hasLicenseFile && !(typeof license === "string" && license.trim() !== "")) {
    offenders.push(`no LICENSE file and no license in ${PLUGIN_MANIFEST}`);
  }
  assertNone(offenders, "Rule: a README of at least 40 words outside code blocks, and a LICENSE file or license in plugin.json (blocks).");
});

test("remote MCP servers use http, sse, or ws over https or wss", () => {
  const offenders = [];
  for (const { file, servers } of mcpServerSources()) {
    for (const [name, server] of Object.entries(servers)) {
      if ("command" in server) continue;
      if (!REMOTE_MCP_TYPES.includes(server.type)) offenders.push(`${file}: server ${name} has type ${JSON.stringify(server.type)}`);
      const url = String(defaultMcpUrl(readJson(PLUGIN_MANIFEST), server.url) ?? "");
      if (!url.startsWith("https://") && !url.startsWith("wss://")) offenders.push(`${file}: server ${name} has url ${JSON.stringify(server.url)}`);
    }
  }
  assertNone(offenders, "Rule: each remote MCP server needs type http, sse, or ws and an https:// or wss:// url (blocks).");
});

test("no text file names a bundled image or font path", () => {
  const offenders = [];
  for (const file of REGULAR_FILES) {
    const bytes = read(file);
    if (isBinary(bytes)) continue;
    for (const { line, path } of mediaPathMentions(file, bytes.toString("utf8"))) {
      offenders.push(`${file}:${line}: ${path}`);
    }
  }
  assertNone(
    offenders,
    "Rule: don't name a bundled image or font path in commands, hooks, scripts, manifests, backticks, or code blocks; Markdown image syntax in a README is fine (held for a reviewer).",
  );
});

const ENV_READ_FILE = "hooks/telemetry-run.mjs";
const ENV_READ_ALLOWLIST = [
  "ARCADE_PLUGIN_TELEMETRY",
  "CLAUDE_PLUGIN_DATA",
  "COPILOT_PLUGIN_DATA",
];
const CHILD_PROCESS = /\bchild_process\b|\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\(/;
const OTHER_RUNTIME_ENV = /\bDeno\.env\b|\bBun\.env\b|\bimport\.meta\.env\b/;
// Indirect ways to reach the environment object: process["env"], process?.env,
// or destructuring `env` out of process.
const INDIRECT_ENV = /\bprocess\s*(?:\?\.)?\s*\[|\bprocess\s*\?\.\s*env\b|\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\.)?process\b/;

/**
 * Lists the lines of one plugin script that download code, start a child
 * process, or read the process environment outside the allowlist.
 * @param {string} file Path relative to plugin/.
 * @param {string} text
 */
const scriptOffenders = (file, text) => {
  const offenders = [];
  text.split("\n").forEach((line, index) => {
    const at = `${file}:${index + 1}`;
    if (/\bfetch\(/.test(line)) offenders.push(`${at}: fetch(`);
    const child = line.match(CHILD_PROCESS);
    if (child) offenders.push(`${at}: ${child[0]}`);
    const other = line.match(OTHER_RUNTIME_ENV);
    if (other) offenders.push(`${at}: ${other[0]}`);
    if (INDIRECT_ENV.test(line)) offenders.push(`${at}: indirect process.env access`);
    for (const match of line.matchAll(/\bprocess\s*\.\s*env\b(?:\s*\.\s*([A-Za-z_$][\w$]*))?/g)) {
      const name = match[1];
      const allowed = file === ENV_READ_FILE && name !== undefined && ENV_READ_ALLOWLIST.includes(name);
      if (!allowed) offenders.push(`${at}: ${match[0]}`);
    }
  });
  return offenders;
};

// Scripts in the plugin directory. dev/ sits outside it.
test("no script downloads code, starts a child process, or reads the environment outside the opt-out allowlist", () => {
  const offenders = [];
  for (const file of REPO_FILES.filter((path) => path.startsWith("plugin/")).map((path) => path.slice("plugin/".length))) {
    if (!/\.(?:mjs|cjs|js|ts|sh)$/.test(file)) continue;
    offenders.push(...scriptOffenders(file, readFileSync(join(REPO, "plugin", file), "utf8")));
  }
  assertNone(
    offenders,
    `Keep network downloads and child processes out of plugin scripts. Read the process environment only by name, for ${ENV_READ_ALLOWLIST.join(", ")}, inside readOptOutEnv in ${ENV_READ_FILE}.`,
  );
});

test("the environment check catches disallowed reads and child processes", () => {
  const disallowed = [
    [ENV_READ_FILE, "const { spawn } = await import(\"node:child_process\");"],
    [ENV_READ_FILE, "spawn(process.execPath, [SENDER]);"],
    [ENV_READ_FILE, "fork(\"./send.mjs\");"],
    [ENV_READ_FILE, "const env = process.env;"],
    [ENV_READ_FILE, "const childEnv = { ...process.env };"],
    [ENV_READ_FILE, "Object.keys(process.env);"],
    [ENV_READ_FILE, "Object.entries(process.env).forEach(send);"],
    [ENV_READ_FILE, "const token = process.env.GITHUB_TOKEN;"],
    [ENV_READ_FILE, "const home = process.env[\"HOME\"];"],
    [ENV_READ_FILE, "const value = process.env[name];"],
    [ENV_READ_FILE, "const { env } = process;"],
    [ENV_READ_FILE, "const path = process?.env?.PATH;"],
    [ENV_READ_FILE, "Deno.env.get(\"HOME\");"],
    [ENV_READ_FILE, "Bun.env.HOME;"],
    [ENV_READ_FILE, "import.meta.env.MODE;"],
    [ENV_READ_FILE, "const off = process.env.DO_NOT_TRACK;"],
    ["hooks/session-start.mjs", "const off = process.env.ARCADE_PLUGIN_TELEMETRY;"],
  ];
  for (const [file, line] of disallowed) {
    assert.notDeepEqual(scriptOffenders(file, line), [], `expected an offender for ${file}: ${line}`);
  }
  for (const name of ENV_READ_ALLOWLIST) {
    assert.deepEqual(scriptOffenders(ENV_READ_FILE, `  ${name}: process.env.${name},`), []);
  }
});
