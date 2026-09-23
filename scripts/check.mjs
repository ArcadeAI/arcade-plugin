#!/usr/bin/env node
// Repo-wide structural checks. No runtime dependencies beyond Node.
// Run with: node scripts/check.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLAUDE_CODE_CLI_VERSION,
  CI_NODE_VERSION,
  ENDPOINT,
  GATEWAY_HOST,
  HOOK_COMMAND_TIMEOUT_SEC,
  INSTALL_SLUG,
  MCP_REMOTE_PACKAGE,
  MCP_SCHEMA,
  MCP_SERVER_NAME,
  PLUGINS_CLI_VERSION,
  PLUGIN_DISPLAY_NAME,
  PLUGIN_SCHEMA,
  SESSION_START_MATCHER,
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
  "schemas/host-adapters/claude-hooks.schema.json",
  "schemas/host-adapters/cursor-hooks.schema.json",
  "schemas/host-adapters/cursor-plugin.schema.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  "com.github.copilot/agents/arcade-operator.agent.md",
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
  const openAiInterface = portable.extensions?.["com.openai"]?.interface;
  if (!openAiInterface?.shortDescription) {
    fail("plugin.json: extensions.com.openai.interface.shortDescription is required");
  }
  if (openAiInterface?.developerName !== "Arcade.dev") {
    fail('plugin.json: extensions.com.openai.interface.developerName must be "Arcade.dev"');
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
  if (cursorManifest.displayName !== PLUGIN_DISPLAY_NAME) {
    fail(
      `.cursor-plugin/plugin.json: displayName must be "${PLUGIN_DISPLAY_NAME}"`,
    );
  }
  const cursorAllowed = new Set([
    "name",
    "description",
    "author",
    "homepage",
    "license",
    "keywords",
    "version",
    "displayName",
    "repository",
    "skills",
    "agents",
    "commands",
    "rules",
    "hooks",
    "mcpServers",
  ]);
  for (const key of Object.keys(cursorManifest)) {
    if (!cursorAllowed.has(key)) {
      fail(`.cursor-plugin/plugin.json: unexpected field "${key}"`);
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
  "com.github.copilot/agents/arcade-operator.agent.md",
  "clients/cursor/rules/arcade.mdc",
]) {
  const content = read(routingFile);
  if (!content.includes(MCP_SERVER_NAME)) {
    fail(`${routingFile}: must reference MCP server name "${MCP_SERVER_NAME}"`);
  }
  if (!content.includes(GATEWAY_HOST)) {
    fail(`${routingFile}: must reference plugin gateway ${GATEWAY_HOST}`);
  }
}

const cursorHooks = read("clients/cursor/hooks/hooks.json");
if (!cursorHooks.includes("${CURSOR_PLUGIN_ROOT}")) {
  fail("clients/cursor/hooks/hooks.json: must use ${CURSOR_PLUGIN_ROOT}");
}
if (cursorHooks.includes("node ./hooks/")) {
  fail("clients/cursor/hooks/hooks.json: must not use project-relative ./hooks/ paths");
}

const claudeHooks = read("hooks/hooks.json");
if (!claudeHooks.includes("${CLAUDE_PLUGIN_ROOT}")) {
  fail('hooks/hooks.json: must use ${CLAUDE_PLUGIN_ROOT}');
}
if (!claudeHooks.includes("hooks/session-start.mjs")) {
  fail("hooks/hooks.json: must reference hooks/session-start.mjs");
}
if (!claudeHooks.includes("hooks/user-prompt-submit.mjs")) {
  fail("hooks/hooks.json: must reference hooks/user-prompt-submit.mjs");
}
if (!claudeHooks.includes(`"matcher": "${SESSION_START_MATCHER}"`)) {
  fail(
    `hooks/hooks.json: SessionStart must match ${SESSION_START_MATCHER.replaceAll("|", ", ")}`,
  );
}
if (!claudeHooks.includes("hooks/subagent-start.mjs")) {
  fail("hooks/hooks.json: must reference hooks/subagent-start.mjs");
}
if (!claudeHooks.includes('"matcher": "*"')) {
  fail('hooks/hooks.json: SubagentStart must use matcher "*"');
}

const marketplace = json[".claude-plugin/marketplace.json"];
if (marketplace) {
  if (marketplace.name !== "arcade") {
    fail('.claude-plugin/marketplace.json: name must be "arcade"');
  }
  const listed = marketplace.plugins?.[0];
  if (!listed || listed.name !== "arcade" || listed.source !== "./") {
    fail('.claude-plugin/marketplace.json: must list plugin "arcade" at source "./"');
  }
  if (listed.displayName !== PLUGIN_DISPLAY_NAME) {
    fail(
      `.claude-plugin/marketplace.json: plugin displayName must be "${PLUGIN_DISPLAY_NAME}"`,
    );
  }
}

if (!read("docs/install/claude-desktop.md").includes(`claude plugin marketplace add ${INSTALL_SLUG}`)) {
  fail(`docs/install/claude-desktop.md: must document claude plugin marketplace add ${INSTALL_SLUG}`);
}

if (!read("clients/claude-desktop/claude_desktop_config.json").includes(MCP_REMOTE_PACKAGE)) {
  fail(`clients/claude-desktop/claude_desktop_config.json: must pin ${MCP_REMOTE_PACKAGE}`);
}

if (!read("README.md").includes(`npx plugins add ${INSTALL_SLUG}`)) {
  fail(`README.md: must document npx plugins add ${INSTALL_SLUG}`);
}

const packageJson = JSON.parse(read("package.json"));
const devDependencies = packageJson.devDependencies ?? {};
const ciPins = {
  plugins: PLUGINS_CLI_VERSION,
  "@anthropic-ai/claude-code": CLAUDE_CODE_CLI_VERSION,
};
for (const [name, version] of Object.entries(ciPins)) {
  if (devDependencies[name] !== version) {
    fail(
      `package.json devDependencies.${name} must be exact "${version}", got "${devDependencies[name] ?? "missing"}"`,
    );
  }
}

if (packageJson.engines?.node !== CI_NODE_VERSION) {
  fail(
    `package.json engines.node must be exact "${CI_NODE_VERSION}", got "${packageJson.engines?.node ?? "missing"}"`,
  );
}

for (const [schemaUrl, localPath] of Object.entries(VENDORED_SCHEMAS)) {
  if (!existsSync(join(ROOT, localPath))) {
    fail(`missing vendored schema for ${schemaUrl}: ${localPath}`);
  }
}

const verifyScripts = {
  "verify:discover": "plugins discover .",
  "verify:claude": "claude plugin validate . --strict",
};
if (!packageJson.scripts?.verify?.includes("npm test")) {
  fail("package.json scripts.verify must include npm test");
}
for (const [scriptName, expected] of Object.entries(verifyScripts)) {
  if (packageJson.scripts?.[scriptName] !== expected) {
    fail(`package.json scripts.${scriptName} must be "${expected}"`);
  }
}

const workflow = read(".github/workflows/check.yml");
if (!workflow.includes(`node-version: "${CI_NODE_VERSION}"`)) {
  fail(`.github/workflows/check.yml: must pin node-version to "${CI_NODE_VERSION}"`);
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
