#!/usr/bin/env node
// Adds the Arcade routing rules at session start. Always exits 0.

import path from "node:path";
import { hostFromArgs, printContext, readInput } from "./hook-hosts.mjs";
import { scopeForInput } from "./hook-scope.mjs";
import { TELEMETRY_ENABLED } from "./telemetry-config.mjs";
import { loadTelemetryAdapter } from "./telemetry-adapter.mjs";
import { SESSION_CONTEXT } from "./routing-guidance.mjs";

const host = hostFromArgs(process.argv);
try {
  if (TELEMETRY_ENABLED && host?.telemetry) {
    try {
      const adapter = await loadTelemetryAdapter(host.telemetry);
      const dir = process.env[adapter.dataVariable];
      if (dir && path.isAbsolute(dir)) {
        const input = await readInput();
        scopeForInput(
          { ...adapter.normalize(input), hook_event_name: "SessionStart" },
          { host: adapter.host, requiresTurn: adapter.requiresTurn, dir },
        );
      }
    } catch {
      // Clearing local scope must not suppress the routing context.
    }
  }
  if (host) printContext(host, "SessionStart", SESSION_CONTEXT);
} catch {
  // Never block session startup.
}
process.exit(0);
