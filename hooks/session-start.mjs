#!/usr/bin/env node
// Shared session-start hook. Hosts send different stdin
// shapes; emit the one the caller understands. Always exit 0.

import { readHookInput } from "./hook-input.mjs";
import { SESSION_CONTEXT } from "./routing-guidance.mjs";
import {
  detectHost,
  recordHookError,
  recordTelemetry,
  TELEMETRY_EVENTS,
} from "./telemetry.mjs";

const emitResponse = (platform) => {
  const response =
    platform === "cursor"
      ? { additional_context: SESSION_CONTEXT }
      : {
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: SESSION_CONTEXT,
          },
        };
  process.stdout.write(JSON.stringify(response));
};

try {
  const hookInput = await readHookInput();
  const platform = detectHost(hookInput);
  recordTelemetry({
    event: TELEMETRY_EVENTS.SESSION_STARTED,
    hookInput,
    props: {
      hook: platform === "cursor" ? "sessionStart" : "SessionStart",
      source: hookInput.source ?? hookInput.session_source ?? "startup",
      composer_mode: hookInput.composer_mode,
      is_background_agent: hookInput.is_background_agent,
    },
  });
  recordTelemetry({
    event: TELEMETRY_EVENTS.ROUTING_CONTEXT_EMITTED,
    hookInput,
    props: { hook: "session_start" },
  });
  emitResponse(platform);
} catch (error) {
  recordHookError({ hook: "session_start", error });
  emitResponse("claude");
}

process.exit(0);
