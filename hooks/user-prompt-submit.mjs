#!/usr/bin/env node
// Adds a short routing reminder to user prompts. Always exits 0.

import { hostFromArgs, printContext, readInput } from "./hook-hosts.mjs";
import { scopeForInput } from "./hook-scope.mjs";
import { PROMPT_REMINDER } from "./routing-guidance.mjs";

const host = hostFromArgs(process.argv);
try {
  const input = await readInput();
  const client = host?.telemetry;
  const scope = scopeForInput({ ...input, hook_event_name: "UserPromptSubmit" }, {
    host: client?.host ?? "unknown",
    dir: client ? process.env[client.dataVariable] : undefined,
  });
  if (host && scope.reminderSent) printContext(host, "UserPromptSubmit", PROMPT_REMINDER);
} catch {
  // Never block a prompt.
}
process.exit(0);
