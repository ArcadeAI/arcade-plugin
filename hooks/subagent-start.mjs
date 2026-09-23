#!/usr/bin/env node
// Claude Code SubagentStart hook: routing reminder for subagents other than
// arcade-operator. Always exit 0.

import { hostFromArgs } from "./hook-hosts.mjs";
import { isOperatorAgentType, SUBAGENT_CONTEXT } from "./routing-guidance.mjs";

const host = hostFromArgs(process.argv);

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
    return isOperatorAgentType(JSON.parse(rawInput).agent_type);
  } catch {
    return false;
  }
};

const emitResponse = () => {
  if (!host) return;
  try {
    process.stdout.write(
      JSON.stringify(host.contextOutput("SubagentStart", SUBAGENT_CONTEXT)),
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
