#!/usr/bin/env node
// Subagent routing reminder for Claude/Codex-format clients. Always exit 0.

import { SUBAGENT_CONTEXT } from "./routing-guidance.mjs";

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
  try {
    JSON.parse(raw);
  } catch {
    // Unparseable input: still inject — subagent starts need routing context.
  }
  emitResponse();
} catch {
  // A hook must never block subagent startup.
  emitResponse();
}

process.exit(0);
