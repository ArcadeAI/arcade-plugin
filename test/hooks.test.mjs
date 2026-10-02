import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("every command in every generated hooks.json runs and prints what its client reads", () => {
  for (const [hostName, { manifest, rootVariable }] of Object.entries(HOSTS)) {
    for (const [event, entries] of Object.entries(JSON.parse(readRepoFile(manifest)).hooks)) {
      for (const { command } of entries.flatMap((entry) => entry.hooks ?? [entry])) {
        const label = `${hostName} ${event}`;
        const result = spawnSync(command.replaceAll(`\${${rootVariable}}`, ROOT), {
          shell: true,
          input: JSON.stringify({ prompt: "What's on my calendar?", agent_type: "Explore" }),
          encoding: "utf8",
        });
        assert.equal(result.status, 0, `${label}: ${result.stderr}`);
        const out = JSON.parse(result.stdout);
        const text = out.hookSpecificOutput?.additionalContext ?? out.additional_context;
        assert.ok(text, `${label}: no context in ${result.stdout}`);
        assert.deepEqual(out, EXPECTED_OUTPUT[hostName](event, text), label);
      }
    }
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
  // code.claude.com/docs/en/hooks: SessionStart, UserPromptSubmit, SubagentStart all support additionalContext
  "claude-code": ["SessionStart", "UserPromptSubmit", "SubagentStart"],
  // cursor.com/docs/hooks.md: sessionStart adds additional_context; beforeSubmitPrompt and subagentStart can't add context.
  // The CLI doesn't load the plugin's always-apply rule, so the session hook is the only way it gets the full rules.
  cursor: ["sessionStart"],
  // measured in Copilot CLI 1.0.88: SubagentStart runs and injects context; prompt hook output from config files is dropped
  // docs.github.com/en/copilot/reference/hooks-reference: SubagentStart input uses agentName
  copilot: ["SessionStart", "SubagentStart"],
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
const DELEGATE_NO_SWITCH = [
  /don't move any part of it to another MCP server, a CLI such as gh or curl, a built-in search, or a direct API/,
  /Troubleshooting or retrying on Arcade itself is fine/,
  /If Arcade can't do some of the task, say what is left in your result/,
];

const CORE_RULES = {
  PROMPT_REMINDER: [PROMPT_REMINDER, [/"arcade" MCP server/, /try-arcade/, /arcade-operator/]],
  CURSOR_RULE: [CURSOR_RULE, [/"arcade" MCP server/, /api\.arcade\.dev/, /try-arcade/, /scale-arcade/, /arcade-operator/, /stop and ask the user to authenticate/, /needsAuth/, /Keep tool discovery/, /plugin-arcade-arcade/]],
  SESSION_CONTEXT: [SESSION_CONTEXT, [/"arcade" MCP server/, /api\.arcade\.dev/, /try-arcade/, /scale-arcade/, /arcade-operator/, /stop and ask the user to authenticate/, /needsAuth/, /Keep tool discovery/]],
  SKILL_RULES: [SKILL_RULES, [/"arcade" MCP server/, /api\.arcade\.dev/, /Prefer arcade/, /stop and ask the user to authenticate/, /needsAuth/]],
  OPERATOR_RULES: [OPERATOR_RULES, [/"arcade" MCP server/, /api\.arcade\.dev/, /use only arcade/, /return needs_auth/, /return failed/, /needsAuth/, ...DELEGATE_NO_SWITCH]],
  SUBAGENT_CONTEXT: [SUBAGENT_CONTEXT, [/"arcade" MCP server/, /api\.arcade\.dev/, /use only arcade/, /try-arcade/, /return needs_auth/, /needsAuth/, /Keep tool discovery/, ...DELEGATE_NO_SWITCH]],
};

// The parent conversation tries Arcade first but may finish with other tools.
// BANS_OTHER_TOOLS matches exact phrases, so a reworded ban would pass.
const PARENT_LABELS = new Set(["PROMPT_REMINDER", "CURSOR_RULE", "SESSION_CONTEXT", "SKILL_RULES"]);
const BANS_OTHER_TOOLS = /gh or curl|don't move any part|explicitly chooses|MCP server only|use only arcade/;

test("every routing text keeps the core routing rules", () => {
  for (const [label, [text, phrases]] of Object.entries(CORE_RULES)) {
    for (const phrase of phrases) {
      assert.match(text, phrase, label);
    }
    if (PARENT_LABELS.has(label)) {
      assert.doesNotMatch(text, BANS_OTHER_TOOLS, label);
    }
  }
  // Subagents can't start arcade-operator, so their text must not send them to it.
  assert.doesNotMatch(SUBAGENT_CONTEXT, /arcade-operator/);
  // Delegates report back to a parent; they don't offer the user another path.
  assert.doesNotMatch(OPERATOR_RULES, /explicitly chooses/);
  assert.doesNotMatch(SUBAGENT_CONTEXT, /explicitly chooses/);
});

test("parent fallback requires existing authorization and the intended gateway destination", () => {
  for (const text of [CURSOR_RULE, SESSION_CONTEXT, SKILL_RULES]) {
    assert.match(text, /another already-authorized Arcade gateway or other available tools within the user's authorized task/);
    assert.match(text, /verify its account, org, and project match the intended destination/);
    assert.match(text, /Do not broaden authorization or copy secrets, credentials, or user sessions/);
    assert.match(text, /Do not switch gateways or tools to bypass authentication or permission denial/);
    assert.match(text, /For permission denial, stop and ask the user to resolve it/);
    assert.match(text, /A gateway switch does not repair missing configuration/);
  }
  for (const text of [OPERATOR_RULES, SUBAGENT_CONTEXT]) {
    assert.doesNotMatch(text, /Fallback:|parent may use another/);
    assert.match(text, /For permission denial or another failure, return failed with the actual error/);
  }
});

test("try-arcade error handling follows the parent fallback rules", () => {
  const skill = readRepoFile("skills/try-arcade/SKILL.md");
  assert.match(skill, /The parent may use the fallback rule for a\nfailure that does not require authentication or permissions/);
  assert.match(skill, /For another error, report the tool's message and follow the gateway\nrules above/);
  assert.doesNotMatch(skill, /For another error, report the tool's message and stop/);
});
