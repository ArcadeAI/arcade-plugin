import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { BASH_CLIS } from "../hooks/telemetry-contract.mjs";
import { HOSTS } from "../hooks/hook-hosts.mjs";
import { readRepoFile, ROOT } from "./helpers.mjs";

const claudeHooks = () => JSON.parse(readRepoFile(HOSTS["claude-code"].manifest)).hooks;

test("PostToolUse and PostToolUseFailure have the expected telemetry groups", () => {
  const hooks = claudeHooks();
  for (const event of ["PostToolUse", "PostToolUseFailure"]) {
    const groups = hooks[event];
    assert.equal(groups.length, 2, `${event}: expected 2 groups`);

    const mainGroup = groups[0];
    assert.equal(mainGroup.matcher, "mcp__.*|WebFetch|WebSearch", `${event} main group matcher`);
    assert.equal(mainGroup.hooks.length, 1, `${event} main group should have 1 hook`);
    assert.ok(mainGroup.hooks[0].command.includes("/hooks/telemetry.mjs"), `${event} main hook is telemetry.mjs`);
    assert.ok(!mainGroup.hooks[0].if, `${event} main hook must not have if`);

    const bashGroup = groups[1];
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

test("routing scripts are on their hooks", () => {
  const hooks = claudeHooks();
  const allEntries = (event) =>
    (hooks[event] ?? []).flatMap((g) => (g.hooks ? g.hooks : [g]));
  const hasScript = (event, name) =>
    allEntries(event).some((h) => h.command?.includes(`/hooks/${name}`));
  assert.ok(hasScript("SessionStart", "session-start.mjs"), "session-start.mjs on SessionStart");
  assert.ok(hasScript("UserPromptSubmit", "user-prompt-submit.mjs"), "user-prompt-submit.mjs on UserPromptSubmit");
  assert.ok(hasScript("SubagentStart", "subagent-start.mjs"), "subagent-start.mjs on SubagentStart");
});

test("Cursor and Copilot manifests have no telemetry entries", () => {
  for (const hostName of ["cursor", "copilot"]) {
    const text = readRepoFile(HOSTS[hostName].manifest);
    assert.ok(!text.includes("telemetry.mjs"), `${hostName}: manifest must not reference telemetry.mjs`);
  }
});

// Moved from test/telemetry.test.mjs. Runs every telemetry command from the
// generated manifest with telemetry off and verifies exit 0 and no output.
test("every generated telemetry command runs and exits quietly with telemetry off", () => {
  const { manifest, rootVariable } = HOSTS["claude-code"];
  const commands = Object.values(JSON.parse(readRepoFile(manifest)).hooks)
    .flatMap((groups) => groups.flatMap((group) => group.hooks))
    .map((hook) => hook.command)
    .filter((command) => command.includes("/hooks/telemetry.mjs"));
  // 5 non-Bash events × 1 command + 2 hook events × BASH_CLIS.length CLI commands
  assert.equal(commands.length, 5 + BASH_CLIS.length * 2);
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
