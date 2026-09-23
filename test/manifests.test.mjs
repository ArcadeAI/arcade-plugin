import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { SESSION_START_MATCHER } from "../scripts/constants.mjs";
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

test("Cursor hook command uses CURSOR_PLUGIN_ROOT and resolves to a real file", async () => {
  const hooks = await readRepoJson("clients/cursor/hooks/hooks.json");
  const command = hooks.hooks.sessionStart[0].command;
  assert.match(command, /\$\{CURSOR_PLUGIN_ROOT\}/);
  assert.doesNotMatch(command, /node \.\/hooks\//);

  const hookPath = resolvePluginPath(command, "CURSOR_PLUGIN_ROOT");
  assert.equal(await pathExists(hookPath), true, `missing ${hookPath}`);
});

test("Claude hook manifest wires only supported events", async () => {
  const hooks = await readRepoJson("hooks/hooks.json");
  assert.deepEqual(Object.keys(hooks.hooks).sort(), [
    "PostToolUse",
    "PostToolUseFailure",
    "PreToolUse",
    "SessionEnd",
    "SessionStart",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "UserPromptSubmit",
  ]);
});

test("Claude telemetry hook runs once on every event and no hook is async", async () => {
  const hooks = await readRepoJson("hooks/hooks.json");

  for (const [event, groups] of Object.entries(hooks.hooks)) {
    const telemetry = groups
      .flatMap((group) => group.hooks)
      .filter((hook) => hook.command.includes("hooks/telemetry.mjs"));
    assert.equal(telemetry.length, 1, `${event} telemetry hook`);
    assert.equal(
      telemetry[0].command,
      'node "${CLAUDE_PLUGIN_ROOT}/hooks/telemetry.mjs"',
    );
    assert.equal(telemetry[0].timeout, 5);
    for (const hook of groups.flatMap((group) => group.hooks)) {
      assert.equal(hook.async, undefined, `${event} hooks must not be async`);
    }
  }

  assert.equal(hooks.hooks.PreToolUse[0].matcher, "Skill");
  assert.equal(hooks.hooks.PostToolUse[0].matcher, "mcp__.*");
  assert.equal(hooks.hooks.PostToolUseFailure[0].matcher, "mcp__.*");
  assert.equal(hooks.hooks.SubagentStop[0].matcher, "*");
  assert.equal(hooks.hooks.Stop[0].matcher, undefined);
  assert.equal(hooks.hooks.SessionEnd[0].matcher, undefined);
});

test("Cursor hook manifest wires only supported events", async () => {
  const hooks = await readRepoJson("clients/cursor/hooks/hooks.json");
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ["sessionStart"]);
});

test("Claude hook commands use CLAUDE_PLUGIN_ROOT and resolve to real files", async () => {
  const hooks = await readRepoJson("hooks/hooks.json");

  for (const [event, groups] of Object.entries(hooks.hooks)) {
    for (const { command } of groups.flatMap((group) => group.hooks)) {
      assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}/, event);
      const hookPath = resolvePluginPath(command, "CLAUDE_PLUGIN_ROOT");
      assert.equal(await pathExists(hookPath), true, `missing ${hookPath}`);
    }
  }
  assert.equal(
    hooks.hooks.SessionStart[0].matcher,
    SESSION_START_MATCHER,
  );
  assert.equal(hooks.hooks.SubagentStart[0].matcher, "*");
});

test("portable manifest exposes Codex listing metadata", async () => {
  const portable = await readRepoJson("plugin.json");
  const fallback = await readRepoJson(".codex-plugin/plugin.json");

  assert.equal(portable.extensions?.["com.openai"]?.hooks, undefined);
  assert.equal(
    portable.extensions?.["com.openai"]?.interface?.displayName,
    "Arcade",
  );
  assert.deepEqual(fallback.interface, portable.extensions?.["com.openai"]?.interface);
  assert.equal(fallback.hooks, undefined);
  assert.equal(fallback.skills, undefined);
  assert.equal(fallback.mcpServers, "./mcp.json");
  assert.equal(await pathExists("skills/try-arcade/SKILL.md"), true);
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

test("Copilot agent projection matches the canonical operator", async () => {
  assert.equal(
    await readRepoFile("com.github.copilot/agents/arcade-operator.agent.md"),
    await readRepoFile("agents/arcade-operator.agent.md"),
  );
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

test("command files use arcade-* filenames and frontmatter names", async () => {
  const commands = [
    "arcade-apps.md",
    "arcade-connect.md",
    "arcade-status.md",
  ];
  for (const file of commands) {
    const content = await readRepoFile(`commands/${file}`);
    assert.match(content, /^name: arcade-/m);
  }
});
