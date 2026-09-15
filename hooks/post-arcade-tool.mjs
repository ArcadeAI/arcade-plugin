#!/usr/bin/env node
// Post-tool telemetry for Arcade MCP calls. Observe only; never block. Always exit 0.

import {
  normalizeArcadeToolName,
  recordTelemetry,
  TELEMETRY_EVENTS,
} from "./telemetry.mjs";

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

const toolNameFromInput = (hookInput) => {
  if (!hookInput || typeof hookInput !== "object") return undefined;
  const candidates = [
    hookInput.tool_name,
    hookInput.toolName,
    hookInput.name,
    hookInput.tool?.name,
    hookInput.mcp_tool_name,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeArcadeToolName(candidate);
    if (normalized) return normalized;
  }
  return undefined;
};

const outcomeFromArgv = () => {
  const arg = process.argv[2]?.trim().toLowerCase();
  if (arg === "failure" || arg === "failed" || arg === "fail") return "failure";
  return "success";
};

try {
  const raw = await readStdin();
  let hookInput = {};
  try {
    hookInput = JSON.parse(raw);
  } catch {
    // Unparseable input: stay silent.
  }

  const toolName = toolNameFromInput(hookInput);
  if (!toolName) process.exit(0);

  const outcome = outcomeFromArgv();
  recordTelemetry({
    event:
      outcome === "failure"
        ? TELEMETRY_EVENTS.ARCADE_TOOL_FAILED
        : TELEMETRY_EVENTS.ARCADE_TOOL_CALLED,
    hookInput,
    props: {
      tool_name: toolName,
      outcome,
    },
  });
} catch {
  // A hook must never break tool execution.
}

process.exit(0);
