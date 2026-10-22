// Installs this repo into a throwaway Copilot CLI home the way the public docs
// do (`plugin marketplace add` of the repository, then `plugin install`) and
// checks that Copilot loads every MCP server in mcp.json and every skill in
// skills/. The marketplace source is ./plugin; the installed directory must be
// that plugin root.
//
// Copilot CLI has no plugin validate command. `copilot plugin install` fails
// on a broken plugin.json but not on a broken mcp.json or skill, so this
// reads back what Copilot loaded. No sign-in is needed.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pluginRoot = join(root, "plugin");
const pluginName = JSON.parse(readFileSync(join(pluginRoot, "plugin.json"), "utf8")).name;
const marketplaceName = JSON.parse(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8")).name;
const servers = JSON.parse(readFileSync(join(pluginRoot, "mcp.json"), "utf8")).mcpServers;
const skills = readdirSync(join(pluginRoot, "skills")).filter((name) => existsSync(join(pluginRoot, "skills", name, "SKILL.md")));

const work = mkdtempSync(join(tmpdir(), "arcade-copilot-verify-"));
// Pass only PATH and the temp-folder, Windows system, and locale variables
// below. Do not copy the parent environment.
const env = { PATH: process.env.PATH ?? "", COPILOT_HOME: work };
for (const name of ["PATHEXT", "SystemRoot", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"]) {
  const value = process.env[name];
  if (value) env[name] = value;
}

function copilot(...args) {
  const result = spawnSync("copilot", args, { cwd: work, env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`copilot ${args.join(" ")} exited ${result.status}:\n${result.stdout}${result.stderr}`);
  }
  return result;
}

function copilotText(...args) {
  const result = copilot(...args);
  return `${result.stdout}${result.stderr}`;
}

function copilotJson(...args) {
  return JSON.parse(copilot(...args).stdout);
}

const problems = [];
function installedPluginDirs(dir, found = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  if (existsSync(join(dir, "skills", "try-arcade", "SKILL.md")) && existsSync(join(dir, "plugin.json"))) found.push(dir);
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "node_modules") installedPluginDirs(join(dir, entry.name), found);
  }
  return found;
}

try {
  // Public install: marketplace add of the repo, then arcade@arcade.
  // .claude-plugin/marketplace.json source is ./plugin. A local marketplace
  // is loaded live from that directory, so the install output names it.
  // A copied install has the plugin directory under COPILOT_HOME instead.
  copilotText("plugin", "marketplace", "add", root);
  const catalog = copilotJson("plugin", "marketplace", "browse", marketplaceName, "--json");
  const entries = Array.isArray(catalog) ? catalog : catalog.plugins ?? catalog.marketplace?.plugins ?? [];
  if (!entries.some((entry) => entry.name === pluginName)) {
    problems.push(`marketplace ${marketplaceName} has no ${pluginName} entry`);
  }
  const installOutput = copilotText("plugin", "install", `${pluginName}@${marketplaceName}`);
  const installedDirs = installedPluginDirs(work);
  const liveFromPlugin = installOutput.includes(pluginRoot);
  if (!liveFromPlugin && installedDirs.length === 0) {
    problems.push(`install did not resolve source ./plugin to ${pluginRoot}:\n${installOutput}`);
  }
  for (const dir of installedDirs) {
    if (existsSync(join(dir, "AGENTS.md")) || existsSync(join(dir, "dev"))) {
      problems.push(`${dir} is the repository root; source ./plugin should install the plugin directory`);
    }
  }

  const loaded = copilotJson("mcp", "list", "--json").mcpServers;
  for (const [name, server] of Object.entries(servers)) {
    const match = loaded[name];
    if (match?.sourcePlugin !== pluginName) problems.push(`MCP server "${name}" from mcp.json was not loaded from the plugin`);
    else if (match.url !== server.url) problems.push(`MCP server "${name}" has url ${match.url}, expected ${server.url}`);
  }

  const loadedSkills = copilotJson("skill", "list", "--json");
  for (const skill of skills) {
    if (!loadedSkills.some((entry) => entry.name === skill && entry.source === "plugin")) {
      problems.push(`skill "${skill}" was not loaded from the plugin`);
    }
  }
} catch (error) {
  problems.push(error.message);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`Copilot CLI check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Copilot CLI loaded ${Object.keys(servers).length} MCP server(s) and ${skills.length} skill(s) from the plugin.`);
