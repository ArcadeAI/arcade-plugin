import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { BASH_CLIS } from "../hooks/telemetry-contract.mjs";
import { HOOKS, HOSTS } from "../hooks/hook-hosts.mjs";
import { buildHookManifest } from "../scripts/generate-manifests.mjs";
import { readRepoFile, ROOT } from "./helpers.mjs";

const claudeHooks = () => JSON.parse(readRepoFile(HOSTS["claude-code"].manifest)).hooks;

test("PostToolUse and PostToolUseFailure have the expected telemetry groups", () => {
  const hooks = claudeHooks();
  for (const event of ["PostToolUse", "PostToolUseFailure"]) {
    const groups = hooks[event];
    assert.equal(groups.length, 3, `${event}: expected 3 groups`);

    const [mcpGroup, builtinGroup, bashGroup] = groups;

    assert.equal(mcpGroup.matcher, "mcp__.*", `${event} mcp group matcher`);
    assert.equal(mcpGroup.hooks.length, 1, `${event} mcp group should have 1 hook`);
    assert.ok(mcpGroup.hooks[0].command.includes("/hooks/telemetry.mjs"), `${event} mcp hook is telemetry.mjs`);
    assert.ok(!mcpGroup.hooks[0].if, `${event} mcp hook must not have if`);

    assert.equal(builtinGroup.matcher, "WebFetch|WebSearch", `${event} builtin group matcher`);
    assert.equal(builtinGroup.hooks.length, 1, `${event} builtin group should have 1 hook`);
    assert.ok(builtinGroup.hooks[0].command.includes("/hooks/telemetry.mjs"), `${event} builtin hook is telemetry.mjs`);
    assert.ok(!builtinGroup.hooks[0].if, `${event} builtin hook must not have if`);

    assert.equal(bashGroup.matcher, "Bash", `${event} bash group matcher`);
    assert.equal(bashGroup.hooks.length, BASH_CLIS.length, `${event} bash group has one entry per CLI`);
  }
});

test("every telemetry entry in a Bash group has an if condition", () => {
  const hooks = claudeHooks();
  for (const [eventName, groups] of Object.entries(hooks)) {
    for (const group of groups) {
      if (group.matcher !== "Bash") continue;
      for (const hook of group.hooks) {
        if (!hook.command.includes("/hooks/telemetry.mjs")) continue;
        assert.ok(hook.if, `${eventName}: Bash group telemetry entry missing if: ${hook.command}`);
      }
    }
  }
});

test("each Bash telemetry entry has if Bash(<cli> *) and command ending --cli <cli>", () => {
  const hooks = claudeHooks();
  for (const [eventName, groups] of Object.entries(hooks)) {
    for (const group of groups) {
      if (group.matcher !== "Bash") continue;
      for (const hook of group.hooks) {
        if (!hook.command.includes("/hooks/telemetry.mjs")) continue;
        const ifMatch = hook.if?.match(/^Bash\((\w+) \*\)$/);
        assert.ok(ifMatch, `${eventName}: unexpected if format: ${hook.if}`);
        const cli = ifMatch[1];
        assert.ok(BASH_CLIS.includes(cli), `${eventName}: unknown CLI in if: ${cli}`);
        assert.ok(hook.command.endsWith(`--cli ${cli}`), `${eventName}: command should end with --cli ${cli}: ${hook.command}`);
      }
    }
  }
});

// Runs every telemetry command from the generated manifest with telemetry off
// and verifies exit 0 and no output.
test("every generated telemetry command runs and exits quietly with telemetry off", () => {
  const { manifest, rootVariable } = HOSTS["claude-code"];
  const commands = Object.values(JSON.parse(readRepoFile(manifest)).hooks)
    .flatMap((groups) => groups.flatMap((group) => group.hooks))
    .map((hook) => hook.command)
    .filter((command) => command.includes("/hooks/telemetry.mjs"));
  const expectedCount = HOOKS.filter((h) => h.script === "telemetry.mjs").length;
  assert.equal(commands.length, expectedCount);
  for (const command of commands) {
    const result = spawnSync(command.replaceAll(`\${${rootVariable}}`, ROOT), {
      shell: true,
      input: JSON.stringify({ hook_event_name: "SessionStart" }),
      encoding: "utf8",
      env: { ...process.env, ARCADE_PLUGIN_TELEMETRY: "0" },
    });
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.equal(result.stdout, "", command);
  }
});

test("a flat-format client can't get an entry with if or extra args", () => {
  const row = { script: "telemetry.mjs", event: "SessionStart", if: "Bash(gh *)", extraArgs: ["--cli", "gh"] };
  assert.throws(() => buildHookManifest("copilot", [row]), /telemetry\.mjs entry for copilot has if or extra args/);
});
