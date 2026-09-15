import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { readRepoFile, readRepoJson, ROOT } from "./helpers.mjs";

const pathExists = async (relativePath) => {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
};

const resolvePluginPath = (command, token) => {
  const match = command.match(new RegExp(`\\$\\{${token}\\}(/[^"\\s]+)`));
  assert.ok(match, `expected \${${token}} path in: ${command}`);
  return match[1].replace(/^\//, "");
};

test("Cursor hook commands use CURSOR_PLUGIN_ROOT and resolve to real files", async () => {
  const hooks = await readRepoJson("clients/cursor/hooks/hooks.json");

  for (const event of [
    "sessionStart",
    "beforeSubmitPrompt",
    "afterMCPExecution",
    "postToolUseFailure",
  ]) {
    const command = hooks.hooks[event][0].command;
    assert.match(command, /\$\{CURSOR_PLUGIN_ROOT\}/);
    assert.doesNotMatch(command, /node \.\/hooks\//);
    const hookPath = resolvePluginPath(command, "CURSOR_PLUGIN_ROOT");
    assert.equal(await pathExists(hookPath), true, `missing ${hookPath}`);
  }
  assert.match(hooks.hooks.afterMCPExecution[0].matcher, /arcade/);
  assert.match(
    hooks.hooks.postToolUseFailure[0].matcher,
    /mcp__plugin_arcade_arcade__\.\*|mcp__arcade__\.\*/,
  );
});

test("Claude hook commands use CLAUDE_PLUGIN_ROOT and resolve to real files", async () => {
  const hooks = await readRepoJson("hooks/hooks.json");

  for (const event of ["SessionStart", "UserPromptSubmit", "PostToolUse", "PostToolUseFailure"]) {
    const command = hooks.hooks[event][0].hooks[0].command;
    assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}/);
    const hookPath = resolvePluginPath(command, "CLAUDE_PLUGIN_ROOT");
    assert.equal(await pathExists(hookPath), true, `missing ${hookPath}`);
  }
  for (const event of ["PostToolUse", "PostToolUseFailure"]) {
    const command = hooks.hooks[event][0].hooks[0].command;
    assert.match(command, /post-arcade-tool\.mjs/);
  }
  assert.equal(hooks.hooks.SessionStart[0].matcher, "startup|resume|clear");
  assert.equal(hooks.hooks.SubagentStart, undefined);
  assert.match(
    hooks.hooks.PostToolUse[0].matcher,
    /mcp__plugin_arcade_arcade__\.\*|mcp__arcade__\.\*/,
  );
});

test("Codex extension hook manifest wires SubagentStart only", async () => {
  const hooks = await readRepoJson("com.openai/hooks/hooks.json");
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ["SubagentStart"]);
  assert.equal(hooks.hooks.SubagentStart[0].matcher, ".*");
  const command = hooks.hooks.SubagentStart[0].hooks[0].command;
  assert.match(command, /\$\{PLUGIN_ROOT\}/);
  const hookPath = resolvePluginPath(command, "PLUGIN_ROOT");
  assert.equal(await pathExists(hookPath), true, `missing ${hookPath}`);
});

test("Codex manifest wires skills, hooks, and MCP adapter paths", async () => {
  const manifest = await readRepoJson(".codex-plugin/plugin.json");
  assert.equal(manifest.skills, "./skills");
  assert.deepEqual(manifest.hooks, [
    "./hooks/hooks.json",
    "./com.openai/hooks/hooks.json",
  ]);
  assert.equal(manifest.mcpServers, "./mcp.json");
  assert.equal(await pathExists("skills/try-arcade/SKILL.md"), true);
  assert.equal(await pathExists("hooks/hooks.json"), true);
  assert.equal(await pathExists("mcp.json"), true);
});

test(".cursor-plugin manifest paths exist", async () => {
  const manifest = await readRepoJson(".cursor-plugin/plugin.json");
  for (const key of ["skills", "agents", "commands", "rules", "hooks", "mcpServers"]) {
    assert.equal(await pathExists(manifest[key]), true, `missing ${manifest[key]}`);
  }
});

test(".claude-plugin MCP adapter path exists", async () => {
  const manifest = await readRepoJson(".claude-plugin/plugin.json");
  const mcpPath = manifest.mcpServers.replace(/^\.\//, "");
  assert.equal(await pathExists(mcpPath), true, `missing ${mcpPath}`);
});

test("skill directories include SKILL.md", async () => {
  for (const skill of ["try-arcade", "scale-arcade"]) {
    assert.equal(
      await pathExists(`skills/${skill}/SKILL.md`),
      true,
      `missing skills/${skill}/SKILL.md`,
    );
  }
});

test("Claude marketplace lists this plugin at the repo root", async () => {
  const marketplace = await readRepoJson(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, "arcade");
  assert.equal(marketplace.plugins?.length, 1);
  assert.equal(marketplace.plugins[0].name, "arcade");
  assert.equal(marketplace.plugins[0].source, "./");
});

test("commands use arcade-* names", async () => {
  const commands = ["apps.md", "connect.md", "status.md"];
  for (const file of commands) {
    const content = await readRepoFile(`commands/${file}`);
    assert.match(content, /^name: arcade-/m);
  }
});
