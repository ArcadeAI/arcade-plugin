#!/usr/bin/env node
// Adds the Arcade routing rules at session start. Always exit 0.

import { hostFromArgs } from "./hook-hosts.mjs";
import { SESSION_CONTEXT } from "./routing-guidance.mjs";

const host = hostFromArgs(process.argv);

try {
  if (host) {
    process.stdout.write(
      JSON.stringify(host.contextOutput("SessionStart", SESSION_CONTEXT)),
    );
  }
} catch {
  // Never block session startup on stdout failures.
}

process.exit(0);
