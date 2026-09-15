#!/usr/bin/env node
// Cursor beforeSubmitPrompt telemetry. Observe only; never block. Always exit 0.

import { isBareContinuation } from "./prompt-continuation.mjs";
import { bucketPromptLength, recordTelemetry, TELEMETRY_EVENTS } from "./telemetry.mjs";

const readStdin = async () => {
  if (process.stdin.isTTY) return "";
  let data = "";
  try {
    for await (const chunk of process.stdin) data += chunk;
  } catch {
    // Stay silent.
  }
  return data;
};

try {
  const raw = await readStdin();
  let hookInput = {};
  let prompt = "";
  try {
    hookInput = JSON.parse(raw);
    prompt = hookInput?.prompt ?? "";
  } catch {
    // Unparseable input: stay silent.
  }

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
  }
} catch {
  // A hook must never break a prompt.
}

process.exit(0);
