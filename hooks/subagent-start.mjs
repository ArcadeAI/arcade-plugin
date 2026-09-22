#!/usr/bin/env node
// Claude Code SubagentStart hook: routing reminder for subagents other than
// arcade-operator. Always exit 0.

import { SUBAGENT_CONTEXT } from "./routing-guidance.mjs";

const OPERATOR_AGENT = "arcade-operator";

const readStdin = async () => {
  if (process.stdin.isTTY) return "";
  let data = "";
  try {
    for await (const chunk of process.stdin) data += chunk;
  } catch {
    // No stdin.
  }
  return data;
};

const isArcadeOperator = (rawInput) => {
  try {
    const input = JSON.parse(rawInput);
    const agentType = input.agent_type;
    if (typeof agentType !== "string") return false;
    return (
      agentType === OPERATOR_AGENT || agentType.endsWith(`:${OPERATOR_AGENT}`)
    );
  } catch {
    return false;
  }
};

const emitResponse = () => {
  try {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SubagentStart",
          additionalContext: SUBAGENT_CONTEXT,
        },
      }),
    );
  } catch {
    // Never block subagent startup on stdout failures.
  }
};

try {
  const rawInput = await readStdin();
  if (!isArcadeOperator(rawInput)) {
    emitResponse();
  }
} catch {
  emitResponse();
}

process.exit(0);
