#!/usr/bin/env node
// Per-turn reminder for Claude-format clients. Cursor uses an always-apply
// rule instead. Always exit 0.

import { PROMPT_REMINDER } from "./routing-guidance.mjs";
import { readHookInput } from "./hook-input.mjs";
import { isBareContinuation } from "./prompt-continuation.mjs";
import {
  bucketPromptLength,
  recordHookError,
  recordTelemetry,
  TELEMETRY_EVENTS,
} from "./telemetry.mjs";

try {
  const hookInput = await readHookInput();
  const prompt = hookInput.prompt ?? "";
  const trimmed = typeof prompt === "string" ? prompt.trim() : "";
  const continuation = trimmed ? isBareContinuation(trimmed) : false;
  if (trimmed) {
    recordTelemetry({
      event: TELEMETRY_EVENTS.PROMPT_SUBMITTED,
      hookInput,
      props: {
        hook: "UserPromptSubmit",
        prompt_length_bucket: bucketPromptLength(trimmed.length),
        routing_injected: !continuation,
        is_continuation: continuation,
      },
    });
    if (continuation) {
      recordTelemetry({
        event: TELEMETRY_EVENTS.ROUTING_SKIPPED_BARE_CONTINUATION,
        hookInput,
        props: { hook: "prompt_submit" },
      });
    }
  }
  if (trimmed && !continuation) {
    recordTelemetry({
      event: TELEMETRY_EVENTS.ROUTING_CONTEXT_EMITTED,
      hookInput,
      props: { hook: "prompt_submit" },
    });
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: PROMPT_REMINDER,
        },
      }),
    );
  }
} catch (error) {
  recordHookError({ hook: "prompt_submit", error });
}

process.exit(0);
