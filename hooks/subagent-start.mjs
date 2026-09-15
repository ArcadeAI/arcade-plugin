#!/usr/bin/env node
// Subagent routing reminder for Codex-format clients. Always exit 0.

import { SUBAGENT_CONTEXT } from "./routing-guidance.mjs";
import { readHookInput } from "./hook-input.mjs";
import { recordHookError, recordTelemetry, TELEMETRY_EVENTS } from "./telemetry.mjs";

const emitResponse = () => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: SUBAGENT_CONTEXT,
      },
    }),
  );
};

try {
  const hookInput = await readHookInput();
  recordTelemetry({
    event: TELEMETRY_EVENTS.SUBAGENT_STARTED,
    hookInput,
    props: {
      hook: "SubagentStart",
      agent_type: hookInput.agent_type,
    },
  });
  emitResponse();
} catch (error) {
  recordHookError({ hook: "SubagentStart", error });
  emitResponse();
}

process.exit(0);
