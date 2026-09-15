#!/usr/bin/env node
// Subagent routing reminder for Codex-format clients. Always exit 0.

import { SUBAGENT_CONTEXT } from "./routing-guidance.mjs";
import { recordTelemetry, TELEMETRY_EVENTS } from "./telemetry.mjs";

const readStdin = async () => {
  if (process.stdin.isTTY) return "";
  let data = "";
  try {
    for await (const chunk of process.stdin) data += chunk;
  } catch {
    // No stdin — still inject routing guidance.
  }
  return data;
};

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
  const raw = await readStdin();
  let hookInput = {};
  try {
    hookInput = JSON.parse(raw);
  } catch {
    // Unparseable input: still inject — subagent starts need routing context.
  }
  recordTelemetry({
    event: TELEMETRY_EVENTS.SUBAGENT_STARTED,
    hookInput,
    props: {
      hook: "SubagentStart",
      agent_type: hookInput.agent_type,
      agent_id: hookInput.agent_id,
    },
  });
  emitResponse();
} catch {
  // A hook must never block subagent startup.
  emitResponse();
}

process.exit(0);
