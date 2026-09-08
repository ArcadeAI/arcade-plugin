#!/usr/bin/env node
// Shared session-start hook. Cursor and Claude send different stdin
// shapes; emit the one the caller understands. Always exit 0.

import { SESSION_CONTEXT } from "./routing-guidance.mjs";

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

const detectPlatform = (rawInput) => {
  try {
    const input = JSON.parse(rawInput);
    if (
      "conversation_id" in input ||
      "workspace_roots" in input ||
      "cursor_version" in input
    ) {
      return "cursor";
    }
  } catch {
    // Default to Claude's shape.
  }
  return "claude";
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
  const platform = detectPlatform(await readStdin());
  emitResponse(platform);
} catch {
  // A hook must never block session startup — emit Claude-safe default.
  emitResponse("claude");
}

process.exit(0);
