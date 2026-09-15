#!/usr/bin/env node
// Shared session-start hook. Cursor and Claude send different stdin
// shapes; emit the one the caller understands. Always exit 0.

import { SESSION_CONTEXT } from "./routing-guidance.mjs";
import { detectHost, recordTelemetry, TELEMETRY_EVENTS } from "./telemetry.mjs";

const readStdin = async () => {
  if (process.stdin.isTTY) return "";
  let data = "";
  try {
    for await (const chunk of process.stdin) data += chunk;
  } catch {
    // No stdin — default platform below.
  }
  return data;
};

const parseInput = (rawInput) => {
  try {
    return JSON.parse(rawInput);
  } catch {
    return {};
  }
};

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
  const hookInput = parseInput(await readStdin());
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
  emitResponse(platform);
} catch {
  // A hook must never block session startup — emit Claude-safe default.
  emitResponse("claude");
}

process.exit(0);
