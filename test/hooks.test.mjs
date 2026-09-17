import assert from "node:assert/strict";
import { test } from "node:test";
import { runHook } from "./helpers.mjs";

const CONTEXT_PHRASES = [
  "try-arcade",
  "scale-arcade",
  "arcade-operator",
  "arcade",
  "needsAuth",
  "setup or connection failure",
];

test("routing guidance distinguishes auth from gateway failures", async () => {
  const { PROMPT_REMINDER, SESSION_CONTEXT, SUBAGENT_CONTEXT } =
    await import("../hooks/routing-guidance.mjs");

  for (const context of [SESSION_CONTEXT, PROMPT_REMINDER, SUBAGENT_CONTEXT]) {
    assert.match(context, /explicitly shows needsAuth/);
    assert.match(context, /namespace is present but has zero tools/);
    assert.match(context, /missing, unavailable, or failing gateway/);
    assert.match(context, /setup or connection failure/);
    assert.doesNotMatch(context, /needsAuth or unavailable/);
  }
});

test("session-start emits Cursor shape with shared guidance", () => {
  const result = runHook(
    "session-start.mjs",
    '{"session_id":"cursor-session","is_background_agent":false,"composer_mode":"agent"}',
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.ok(out.additional_context);
  for (const phrase of CONTEXT_PHRASES) {
    assert.match(out.additional_context, new RegExp(phrase));
  }
});

test("session-start does not treat a shared session_id as Cursor", () => {
  const result = runHook(
    "session-start.mjs",
    '{"session_id":"claude-or-codex-session"}',
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
});

test("session-start emits Claude shape with shared guidance", () => {
  const result = runHook("session-start.mjs", "{}");
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  for (const phrase of CONTEXT_PHRASES) {
    assert.match(out.hookSpecificOutput.additionalContext, new RegExp(phrase));
  }
});

test("session-start emits safe default when stdin is invalid", () => {
  const result = runHook("session-start.mjs", "not-json");
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /try-arcade/);
});

test("user-prompt-submit injects guidance for substantive prompts", () => {
  const result = runHook(
    "user-prompt-submit.mjs",
    '{"prompt":"What is on my calendar tomorrow?"}',
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  for (const phrase of CONTEXT_PHRASES) {
    assert.match(out.hookSpecificOutput.additionalContext, new RegExp(phrase));
  }
});

test("user-prompt-submit injects guidance for short action follow-ups", () => {
  const result = runHook("user-prompt-submit.mjs", '{"prompt":"fix it"}');
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(out.hookSpecificOutput.additionalContext, /try-arcade/);
});

test("user-prompt-submit injects guidance for go-ahead style prompts", () => {
  const result = runHook("user-prompt-submit.mjs", '{"prompt":"go ahead"}');
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.match(out.hookSpecificOutput.additionalContext, /try-arcade/);
});

test("user-prompt-submit suppresses bare continuations", () => {
  const result = runHook(
    "user-prompt-submit.mjs",
    '{"prompt":"yes thanks"}',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("user-prompt-submit suppresses one-word acknowledgements", () => {
  const result = runHook("user-prompt-submit.mjs", '{"prompt":"ok"}');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("subagent-start emits Codex shape with shared guidance", () => {
  const result = runHook(
    "subagent-start.mjs",
    '{"hook_event_name":"SubagentStart","agent_type":"review"}',
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "SubagentStart");
  for (const phrase of CONTEXT_PHRASES) {
    assert.match(out.hookSpecificOutput.additionalContext, new RegExp(phrase));
  }
});

test("subagent-start emits safe default when stdin is invalid", () => {
  const result = runHook("subagent-start.mjs", "not-json");
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "SubagentStart");
  assert.match(out.hookSpecificOutput.additionalContext, /try-arcade/);
});
