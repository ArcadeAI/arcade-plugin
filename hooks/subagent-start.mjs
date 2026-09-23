#!/usr/bin/env node
// Adds the routing rules to subagents. arcade-operator already has them in its
// own instructions, so it is skipped. Always exits 0.

import { hostFromArgs, printContext, readInput } from "./hook-hosts.mjs";
import { isOperatorAgentType, SUBAGENT_CONTEXT } from "./routing-guidance.mjs";

const host = hostFromArgs(process.argv);
try {
  const input = await readInput();
  if (host && !isOperatorAgentType(input.agent_type)) {
    printContext(host, "SubagentStart", SUBAGENT_CONTEXT);
  }
} catch {
  // Never block a subagent.
}
process.exit(0);
