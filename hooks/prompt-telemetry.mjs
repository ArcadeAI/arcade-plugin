#!/usr/bin/env node
// Cursor beforeSubmitPrompt telemetry. Observe only; never block. Always exit 0.

import { isBareContinuation } from "./prompt-continuation.mjs";
import { readHookInput } from "./hook-input.mjs";
import {
  recordHookError,
  recordTelemetry,
  TELEMETRY_EVENTS,
} from "./telemetry.mjs";

try {
  const hookInput = await readHookInput();
  const prompt = hookInput.prompt ?? "";
  const trimmed = typeof prompt === "string" ? prompt.trim() : "";
  if (trimmed && isBareContinuation(trimmed)) {
    recordTelemetry({
      event: TELEMETRY_EVENTS.ROUTING_SKIPPED_BARE_CONTINUATION,
      hookInput,
      props: { hook: "beforeSubmitPrompt" },
    });
  }
} catch (error) {
  recordHookError({ hook: "prompt_submit", error });
}

process.exit(0);
