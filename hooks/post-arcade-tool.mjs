#!/usr/bin/env node
// Link Arcade_SelectTools query_id to the host session for server-side joins. Always exit 0.

import {
  queryIdFromSelectToolsResponse,
  recordTelemetry,
  TELEMETRY_EVENTS,
} from "./telemetry.mjs";
import { readHookInput } from "./hook-input.mjs";

try {
  const hookInput = await readHookInput();
  const queryId = queryIdFromSelectToolsResponse(hookInput);
  if (!queryId) process.exit(0);

  recordTelemetry({
    event: TELEMETRY_EVENTS.DISCOVERY_LINKED,
    hookInput,
    props: {
      hook: "post_tool",
      query_id: queryId,
    },
  });
} catch {
  // A hook must never break tool execution.
}

process.exit(0);
