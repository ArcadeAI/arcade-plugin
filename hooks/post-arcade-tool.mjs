#!/usr/bin/env node
// Post-tool telemetry for Arcade MCP calls. Observe only; never block. Always exit 0.

import {
  arcadeToolNameFromInput,
  arcadeToolOutcomeFromInput,
  recordTelemetry,
  TELEMETRY_EVENTS,
} from "./telemetry.mjs";
import { readHookInput } from "./hook-input.mjs";

const outcomeHintFromArgv = () => {
  const arg = process.argv[2]?.trim().toLowerCase();
  if (arg === "failure" || arg === "failed" || arg === "fail") return "failure";
  return "success";
};

try {
  const hookInput = await readHookInput();

  const toolName = arcadeToolNameFromInput(hookInput);
  if (!toolName) process.exit(0);

  const outcome = arcadeToolOutcomeFromInput(hookInput, outcomeHintFromArgv());
  recordTelemetry({
    event:
      outcome === "failure"
        ? TELEMETRY_EVENTS.ARCADE_TOOL_FAILED
        : TELEMETRY_EVENTS.ARCADE_TOOL_CALLED,
    hookInput,
    props: {
      tool_name: toolName,
      outcome,
    },
  });
} catch {
  // A hook must never break tool execution.
}

process.exit(0);
