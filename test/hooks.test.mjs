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

// Exactly what each client should receive, from its hook docs. Every client in
// HOSTS needs an entry here.
const EXPECTED_OUTPUT = {
  cursor: (_event, text) => ({ additional_context: text }),
  "claude-code": (event, text) => ({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }),
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

// Which hooks each client runs, and why, from real runs and client source.
// Change this only with new evidence from the client.
const EXPECTED_EVENTS = {
  "claude-code": ["SessionStart", "UserPromptSubmit", "SubagentStart"],
  // Cursor's CLI doesn't load the plugin's always-apply rule, so the session
  // hook is the only way it gets the full rules. Its prompt and subagent hooks
  // can't add context.
  cursor: ["sessionStart"],
  // Copilot CLI drops prompt-hook output from config files.
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
// only one: Cowork's main conversation gets only the per-prompt reminder, and
// the Cursor IDE gets only the rule and the skill. Keep the core rules in each.
const CORE_RULES = {
  PROMPT_REMINDER: [PROMPT_REMINDER, [/"arcade" MCP server only/, /try-arcade/, /arcade-operator/, /Don't fall back to another connector/]],
  CURSOR_RULE: [CURSOR_RULE, [/"arcade" MCP server only/, /try-arcade/, /arcade-operator/, /Don't fall back to another connector/, /plugin-arcade-arcade/]],
  SESSION_CONTEXT: [SESSION_CONTEXT, [/"arcade" MCP server/, /api\.arcade\.dev/, /try-arcade/, /scale-arcade/, /arcade-operator/, /stop and ask the user to authenticate/, /Never fall back to another connector/]],
  SKILL_RULES: [SKILL_RULES, [/"arcade" MCP server/, /api\.arcade\.dev/, /use only arcade/, /stop and ask the user to authenticate/, /Never fall back to another connector/, /explicitly chooses/]],
  OPERATOR_RULES: [OPERATOR_RULES, [/"arcade" MCP server/, /api\.arcade\.dev/, /return needs_auth/, /return failed/, /Never fall back to another connector/]],
  SUBAGENT_CONTEXT: [SUBAGENT_CONTEXT, [/"arcade" MCP server/, /api\.arcade\.dev/, /try-arcade/, /return needs_auth/, /Never fall back to another connector/]],
};

test("every routing text keeps the core routing rules", () => {
  for (const [label, [text, phrases]] of Object.entries(CORE_RULES)) {
    for (const phrase of phrases) {
      assert.match(text, phrase, label);
    }
  }
  // Subagents can't start arcade-operator, so their text must not send them to it.
  assert.doesNotMatch(SUBAGENT_CONTEXT, /arcade-operator/);
});
