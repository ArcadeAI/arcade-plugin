#!/usr/bin/env node
// Subagent routing reminder for Codex-format clients. Always exit 0.

import { SUBAGENT_CONTEXT } from "./routing-guidance.mjs";

const readStdin = async () => {
  if (process.stdin.isTTY) return;
  try {
    for await (const chunk of process.stdin) {
      // Drain hook input so the host can close stdin cleanly.
    }
  } catch {
    // No stdin — still inject routing guidance.
  }
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
  await readStdin();
  emitResponse();
} catch {
  // A hook must never block subagent startup.
  emitResponse();
}

process.exit(0);
