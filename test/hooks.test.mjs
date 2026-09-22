import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { runHook, ROOT } from "./helpers.mjs";

const loadSchema = (relativePath) =>
  JSON.parse(
    readFileSync(path.join(ROOT, relativePath), "utf8"),
  );

const ajv = new Ajv2020({ allErrors: true, strict: false });
const cursorOutputSchema = ajv.compile(
  loadSchema("schemas/host-adapters/cursor-hook-output.schema.json"),
);
const claudeOutputSchema = ajv.compile(
  loadSchema("schemas/host-adapters/claude-hook-output.schema.json"),
);

const assertValidOutput = (validate, stdout, label) => {
  const trimmed = stdout.trim();
  if (!trimmed) return;
  const out = JSON.parse(trimmed);
  assert.equal(
    validate(out),
    true,
    `${label}: ${JSON.stringify(validate.errors)}`,
  );
};

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
  assertValidOutput(cursorOutputSchema, result.stdout, "cursor-minimal");
  for (const phrase of CONTEXT_PHRASES) {
    assert.match(out.additional_context, new RegExp(phrase));
  }
});

test("session-start emits Cursor shape for schema-conformant stdin", () => {
  const result = runHook(
    "session-start.mjs",
    JSON.stringify({
      hook_event_name: "sessionStart",
      conversation_id: "conv-1",
      cursor_version: "1.0.0",
      workspace_roots: ["/repo"],
      session_id: "s1",
      is_background_agent: false,
      composer_mode: "agent",
    }),
  );
  assert.equal(result.status, 0, result.stderr);
  assertValidOutput(cursorOutputSchema, result.stdout, "cursor-full");
});

test("session-start uses hook_event_name to detect Cursor", () => {
  const result = runHook(
    "session-start.mjs",
    '{"hook_event_name":"sessionStart","session_id":"s1"}',
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.ok(out.additional_context);
  assert.equal(out.hookSpecificOutput, undefined);
});

test("session-start does not treat a shared session_id as Cursor", () => {
  const result = runHook(
    "session-start.mjs",
    '{"session_id":"claude-session"}',
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
  assertValidOutput(claudeOutputSchema, result.stdout, "claude-empty");
  for (const phrase of CONTEXT_PHRASES) {
    assert.match(out.hookSpecificOutput.additionalContext, new RegExp(phrase));
  }
});

test("session-start emits Claude shape for a forked session", () => {
  const result = runHook(
    "session-start.mjs",
    '{"hook_event_name":"SessionStart","session_id":"claude-fork-1","source":"fork"}',
  );
  assert.equal(result.status, 0, result.stderr);
  assertValidOutput(claudeOutputSchema, result.stdout, "claude-fork");
  const out = JSON.parse(result.stdout.trim());
  assert.match(out.hookSpecificOutput.additionalContext, /try-arcade/);
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
  assertValidOutput(claudeOutputSchema, result.stdout, "user-prompt");
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

test("subagent-start emits Claude shape with shared guidance", () => {
  const result = runHook(
    "subagent-start.mjs",
    '{"hook_event_name":"SubagentStart","agent_type":"review"}',
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "SubagentStart");
  assertValidOutput(claudeOutputSchema, result.stdout, "subagent-start");
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

test("subagent-start skips routing guidance for arcade-operator", () => {
  for (const agentType of ["arcade-operator", "arcade:arcade-operator"]) {
    const result = runHook(
      "subagent-start.mjs",
      JSON.stringify({
        hook_event_name: "SubagentStart",
        agent_type: agentType,
      }),
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "", agentType);
  }
});
