import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { HOSTS } from "../hooks/hook-hosts.mjs";
import { shouldRemind } from "../hooks/prompt-filters.mjs";
import {
  CURSOR_RULE,
  OPERATOR_RULES,
  PROMPT_REMINDER,
  SESSION_CONTEXT,
  SKILL_RULES,
  SUBAGENT_CONTEXT,
} from "../hooks/routing-guidance.mjs";
import { readRepoFile, ROOT, runHook } from "./helpers.mjs";

// This is a second copy of each client's hook output format, kept here on
// purpose so that changing a client's format in the hooks also requires
// changing this test. Each entry names its source.
const EXPECTED_OUTPUT = {
  // cursor.com/docs/hooks.md: sessionStart adds additional_context
  cursor: (_event, text) => ({ additional_context: text }),
  // code.claude.com/docs/en/hooks: hookSpecificOutput.additionalContext for SessionStart, UserPromptSubmit, SubagentStart
  "claude-code": (event, text) => ({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }),
  // measured in Copilot CLI 1.0.88: outputs both top-level additionalContext and hookSpecificOutput.additionalContext
  copilot: (event, text) => ({
    additionalContext: text,
    hookSpecificOutput: { hookEventName: event, additionalContext: text },
  }),
};

test("every client in the hook table has an expected output format", () => {
  assert.deepEqual(Object.keys(EXPECTED_OUTPUT).sort(), Object.keys(HOSTS).sort());
});

const HOOK_INPUT = JSON.stringify({ prompt: "What's on my calendar?", agent_type: "Explore" });

const assertPrintsContext = (hostName, event, result, label) => {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
  const out = JSON.parse(result.stdout);
  const text = out.hookSpecificOutput?.additionalContext ?? out.additional_context;
  assert.ok(text, `${label}: no context in ${result.stdout}`);
  assert.deepEqual(out, EXPECTED_OUTPUT[hostName](event, text), label);
};

test("every command in every generated hooks.json runs and prints what its client reads", () => {
  for (const [hostName, { manifest, rootVariable }] of Object.entries(HOSTS)) {
    for (const [event, entries] of Object.entries(JSON.parse(readRepoFile(manifest)).hooks)) {
      for (const { command } of entries.flatMap((entry) => entry.hooks ?? [entry])) {
        // Telemetry prints nothing; test/telemetry.test.mjs runs its commands.
        if (command.includes("/hooks/telemetry.mjs")) continue;
        const result = spawnSync(command.replaceAll(`\${${rootVariable}}`, ROOT), {
          shell: true,
          input: HOOK_INPUT,
          encoding: "utf8",
        });
        assertPrintsContext(hostName, event, result, `${hostName} ${event}`);
      }
    }
  }
});

// VS Code reads com.github.copilot/hooks/hooks.json but runs each command as
// written, through `spawn(command, { shell: true })` from the workspace root,
// without setting or replacing PLUGIN_ROOT (microsoft/vscode main, 2026-09:
// pluginParsers.ts, hookExecutor.ts). Copilot CLI replaces ${PLUGIN_ROOT} in
// the command and also sets it in the environment.
const copilotEntries = () =>
  Object.entries(JSON.parse(readRepoFile(HOSTS.copilot.manifest)).hooks).flatMap(([event, entries]) =>
    entries.map((entry) => ({ event, ...entry })),
  );

const PLUGIN_VARIABLES = ["PLUGIN_ROOT", "COPILOT_PLUGIN_DATA", "CLAUDE_PLUGIN_DATA"];

/** process.env without the variables a client sets for plugin hooks, plus `extra`. */
const hookEnv = (extra = {}) => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !PLUGIN_VARIABLES.includes(name))),
  // Keeps a telemetry hook from sending anything if it does run.
  ARCADE_PLUGIN_TELEMETRY: "0",
  ...extra,
});

const VSCODE_INPUT = JSON.stringify({
  hook_event_name: "SessionStart",
  session_id: "vscode-session",
  cwd: "/workspace",
  prompt: "What's on my calendar?",
  agent_type: "Explore",
});

// The `command` field is the macOS and Linux form; cmd.exe can't run it.
const skipOnWindows = { skip: process.platform === "win32" && "the command field is for macOS and Linux" };

test("in VS Code every Copilot hook command exits 0 without output", skipOnWindows, () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "arcade-vscode-"));
  for (const extra of [{}, { PLUGIN_ROOT: "/nonexistent" }]) {
    for (const { event, command } of copilotEntries()) {
      const label = `${event} ${command} ${JSON.stringify(extra)}`;
      const result = spawnSync(command, { shell: true, cwd, env: hookEnv(extra), input: VSCODE_INPUT, encoding: "utf8" });
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      assert.equal(result.stdout, "", label);
      assert.equal(result.stderr, "", label);
    }
  }
});

/** Checks the output of a Copilot hook run with PLUGIN_ROOT set to the repo. */
const assertCopilotHookRan = (event, command, result, label) => {
  if (command.includes("/hooks/telemetry.mjs")) {
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    assert.equal(result.stdout, "", label);
    return;
  }
  assertPrintsContext("copilot", event, result, label);
};

test("in Copilot CLI every Copilot hook command runs with PLUGIN_ROOT set only in the environment", skipOnWindows, () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "arcade-copilot-"));
  for (const { event, command } of copilotEntries()) {
    const result = spawnSync(command, {
      shell: true,
      cwd,
      env: hookEnv({ PLUGIN_ROOT: ROOT }),
      input: HOOK_INPUT,
      encoding: "utf8",
    });
    assertCopilotHookRan(event, command, result, `${event} ${command}`);
  }
});

// GitHub's ubuntu-latest image includes pwsh.
const POWERSHELL = (process.platform === "win32" ? ["pwsh", "powershell.exe"] : ["pwsh"]).find(
  (exe) => !spawnSync(exe, ["-NoProfile", "-NonInteractive", "-Command", "exit 0"]).error,
);

test("every Copilot hook's powershell command skips without PLUGIN_ROOT and runs with it", { skip: !POWERSHELL && "pwsh not found" }, () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "arcade-powershell-"));
  const runPowerShell = (script, env) =>
    spawnSync(String(POWERSHELL), ["-NoProfile", "-NonInteractive", "-Command", script], {
      cwd,
      env,
      input: HOOK_INPUT,
      encoding: "utf8",
    });
  for (const { event, command, powershell } of copilotEntries()) {
    assert.ok(powershell, `${event} ${command}: no powershell command`);
    const skipped = runPowerShell(powershell, hookEnv());
    assert.equal(skipped.status, 0, `${powershell}: ${skipped.stderr}`);
    assert.equal(skipped.stdout, "", powershell);
    assert.equal(skipped.stderr, "", powershell);
    assertCopilotHookRan(event, powershell, runPowerShell(powershell, hookEnv({ PLUGIN_ROOT: ROOT })), powershell);
  }
});

test("shouldRemind skips acknowledgements and background task results", () => {
  for (const prompt of ["What's on my calendar?", "fix it", "go ahead and send it"]) {
    assert.equal(shouldRemind(prompt), true, prompt);
  }
  for (const prompt of ["", "ok", "yes thanks", "<task-notification>\n<task-id>a</task-id>", undefined]) {
    assert.equal(shouldRemind(prompt), false, String(prompt));
  }
});

test("subagent-start skips arcade-operator in every client's input format", () => {
  for (const input of [
    { agent_type: "arcade-operator" },
    { agent_type: "arcade:arcade-operator" },
    // Copilot CLI 1.0.88's SubagentStart input.
    { agentName: "arcade:arcade-operator", agentDisplayName: "arcade-operator" },
  ]) {
    for (const host of Object.keys(HOSTS)) {
      const result = runHook("subagent-start.mjs", input, ["--host", host]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", `${host} ${JSON.stringify(input)}`);
    }
  }
  assert.notEqual(runHook("subagent-start.mjs", { agent_type: "Explore" }, ["--host", "claude-code"]).stdout, "");
  assert.notEqual(runHook("subagent-start.mjs", { agentName: "general-purpose" }, ["--host", "copilot"]).stdout, "");
});

test("hooks exit 0 and print nothing without a known --host", () => {
  for (const script of ["session-start.mjs", "user-prompt-submit.mjs", "subagent-start.mjs"]) {
    for (const args of [[], ["--host", "nope"]]) {
      const result = runHook(script, { prompt: "What's on my calendar?" }, args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", `${script} ${args.join(" ")}`);
    }
  }
});

// Which hooks each client runs. Change this only with new evidence from the
// client. Each entry names its source.
const EXPECTED_EVENTS = {
  // code.claude.com/docs/en/hooks: SessionStart, UserPromptSubmit, SubagentStart all support additionalContext.
  // PostToolUse, PostToolUseFailure, and SubagentStop run only the telemetry hook (docs/telemetry.md).
  "claude-code": ["SessionStart", "UserPromptSubmit", "SubagentStart", "PostToolUse", "PostToolUseFailure", "SubagentStop"],
  // cursor.com/docs/hooks.md: sessionStart adds additional_context; beforeSubmitPrompt and subagentStart can't add context.
  // The CLI doesn't load the plugin's always-apply rule, so the session hook is the only way it gets the full rules.
  cursor: ["sessionStart"],
  // measured in Copilot CLI 1.0.88: SubagentStart runs and injects context; prompt hook output from config files is dropped
  // docs.github.com/en/copilot/reference/hooks-reference: SubagentStart input uses agentName
  // UserPromptSubmit, PostToolUse, PostToolUseFailure, and SubagentStop run only the telemetry hook (docs/telemetry.md).
  copilot: ["SessionStart", "SubagentStart", "UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "SubagentStop"],
};

test("each client runs exactly the hooks it can use", () => {
  assert.deepEqual(Object.keys(EXPECTED_EVENTS).sort(), Object.keys(HOSTS).sort());
  for (const [hostName, { manifest }] of Object.entries(HOSTS)) {
    const events = Object.keys(JSON.parse(readRepoFile(manifest)).hooks);
    assert.deepEqual(events.sort(), [...EXPECTED_EVENTS[hostName]].sort(), hostName);
  }
});

// Each client gets its routing rules from one of these texts, and some get
// only one: Cowork's main conversation gets only the per-prompt reminder and the skill, and
// the Cursor IDE gets only the rule and the skill. Keep the core rules in each.
// The whole no-switch rule, for every text that carries it.
const NO_SWITCH = [/don't move any part of it to another MCP server, a CLI such as gh or curl, a built-in search, or a direct API/, /Troubleshooting or retrying on Arcade itself is fine/];

const CORE_RULES = {
  PROMPT_REMINDER: [PROMPT_REMINDER, [/"arcade" MCP server only/, /try-arcade/, /arcade-operator/, /don't move any part of it to another connector/, /explicitly chooses/]],
  CURSOR_RULE: [CURSOR_RULE, [/"arcade" MCP server/, /api\.arcade\.dev/, /try-arcade/, /scale-arcade/, /arcade-operator/, /stop and ask the user to authenticate/, ...NO_SWITCH, /needsAuth/, /Keep tool discovery/, /plugin-arcade-arcade/, /explicitly chooses/]],
  SESSION_CONTEXT: [SESSION_CONTEXT, [/"arcade" MCP server/, /api\.arcade\.dev/, /try-arcade/, /scale-arcade/, /arcade-operator/, /stop and ask the user to authenticate/, ...NO_SWITCH, /needsAuth/, /Keep tool discovery/, /explicitly chooses/]],
  SKILL_RULES: [SKILL_RULES, [/"arcade" MCP server/, /api\.arcade\.dev/, /use only arcade/, /stop and ask the user to authenticate/, ...NO_SWITCH, /explicitly chooses/, /needsAuth/]],
  OPERATOR_RULES: [OPERATOR_RULES, [/"arcade" MCP server/, /api\.arcade\.dev/, /return needs_auth/, /return failed/, ...NO_SWITCH, /needsAuth/]],
  SUBAGENT_CONTEXT: [SUBAGENT_CONTEXT, [/"arcade" MCP server/, /api\.arcade\.dev/, /try-arcade/, /return needs_auth/, ...NO_SWITCH, /needsAuth/, /Keep tool discovery/]],
};

test("every routing text keeps the core routing rules", () => {
  for (const [label, [text, phrases]] of Object.entries(CORE_RULES)) {
    for (const phrase of phrases) {
      assert.match(text, phrase, label);
    }
  }
  // Subagents can't start arcade-operator, so their text must not send them to it.
  assert.doesNotMatch(SUBAGENT_CONTEXT, /arcade-operator/);
  // Operator and subagent texts report back to a parent; they don't offer the user a choice.
  assert.doesNotMatch(OPERATOR_RULES, /explicitly chooses/);
  assert.doesNotMatch(SUBAGENT_CONTEXT, /explicitly chooses/);
});
