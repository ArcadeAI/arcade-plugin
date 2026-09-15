#!/usr/bin/env node
// Subagent routing reminder for Codex-format clients. Always exit 0.

import { SUBAGENT_CONTEXT } from "./routing-guidance.mjs";

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
  await readStdin();
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: SUBAGENT_CONTEXT,
      },
    }),
  );
} catch {
  // A hook must never block subagent startup.
}

process.exit(0);
