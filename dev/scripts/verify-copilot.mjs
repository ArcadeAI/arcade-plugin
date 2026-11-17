// Installs the full plugin into a throwaway Copilot home and checks its
// MCP servers, skills, routing hooks, and operator files.
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
  copilotText("plugin", "install", pluginRoot);
  const installedDirs = installedPluginDirs(work);
  if (installedDirs.length === 0) problems.push("installed Copilot plugin directory was not found");
  for (const dir of installedDirs) {
    for (const file of ["com.github.copilot/hooks/hooks.json", "com.github.copilot/agents/arcade-operator.agent.md"]) {
      if (!existsSync(join(dir, file))) problems.push(`installed Copilot plugin is missing ${file}`);
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
