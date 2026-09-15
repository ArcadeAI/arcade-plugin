#!/usr/bin/env node
// Cursor beforeSubmitPrompt telemetry. Observe only; never block. Always exit 0.

import { isBareContinuation } from "./prompt-continuation.mjs";
import { readHookInput } from "./hook-input.mjs";
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
  if (trimmed) {
    const continuation = isBareContinuation(trimmed);
    recordTelemetry({
      event: TELEMETRY_EVENTS.PROMPT_SUBMITTED,
      hookInput,
      props: {
        hook: "beforeSubmitPrompt",
        prompt_length_bucket: bucketPromptLength(trimmed.length),
        routing_injected: false,
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
} catch (error) {
  recordHookError({ hook: "prompt_submit", error });
}

process.exit(0);
