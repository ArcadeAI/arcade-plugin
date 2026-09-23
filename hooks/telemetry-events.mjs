/**
 * Turns Claude Code hook input into a telemetry event. Pure: no I/O.
 * Every property sent is listed in docs/telemetry.md.
 */

import { createHash } from "node:crypto";
import { isTaskNotification, shouldRemind } from "./prompt-filters.mjs";
import { isOperatorAgentType } from "./routing-guidance.mjs";
import {
  classifyPrompt,
  serviceForToolkit,
  serviceForToolName,
} from "./telemetry-classify.mjs";
import { PLUGIN_VERSION } from "./telemetry-config.mjs";

const ARCADE_TOOL_PREFIX = "mcp__plugin_arcade_arcade__";

// Tools every Arcade gateway exposes. Seeing one on another server means the
// model used a different Arcade connection than this plugin's.
const GATEWAY_TOOLS = [
  "Arcade_ListApps",
  "Arcade_SelectTools",
  "Arcade_UseTool",
  "System_ManageAuthorization",
];

const SESSION_SOURCES = ["startup", "resume", "clear", "compact", "fork"];
const OS_NAMES = ["darwin", "linux", "win32"];

// Matches the operator's report line, e.g. "status: needs_auth", with or
// without markdown around it.
const OPERATOR_STATUS =
  /^[^\w\n]*status[^\w\n]*(completed|needs_auth|needs_confirmation|needs_clarification|failed)\b/im;

const COMMON_PROPERTIES = [
  "session",
  "turn",
  "host",
  "plugin_version",
  "os",
  "$process_person_profile",
  "$geoip_disable",
  "$ip",
];

export const ALLOWED_PROPERTIES = {
  "Plugin session started": ["source"],
  "Plugin prompt submitted": ["could_use_arcade", "service_hints", "reminder_sent"],
  "Plugin tool called": ["server", "tool", "service"],
  "Plugin tool failed": ["server", "tool", "service"],
  "Plugin subagent stopped": ["agent", "status"],
};

const shortHash = (installId, id) =>
  createHash("sha256").update(`${installId}:${id}`).digest("hex").slice(0, 16);

const oneOf = (value, allowed, fallback) =>
  allowed.includes(value) ? value : fallback;

const withService = (properties, service) =>
  service ? { ...properties, service } : properties;

const arcadeToolProperties = (server, tool, toolInput) => {
  // Arcade_UseTool names the app tool in its input, e.g. "Gmail.ListEmails".
  const service =
    tool === "Arcade_UseTool"
      ? serviceForToolName(toolInput?.tool_name)
      : serviceForToolName(tool);
  // Custom toolkit names could be private, so only public names are sent.
  const isPublic = GATEWAY_TOOLS.includes(tool) || service !== null;
  return withService({ server, tool: isPublic ? tool : "other" }, service);
};

const toolProperties = (toolName, toolInput) => {
  if (typeof toolName !== "string" || !toolName.startsWith("mcp__")) {
    return null;
  }
  const splitAt = toolName.lastIndexOf("__");
  const tool = toolName.slice(splitAt + 2);
  if (toolName.startsWith(ARCADE_TOOL_PREFIX)) {
    return arcadeToolProperties("arcade", tool, toolInput);
  }
  if (GATEWAY_TOOLS.includes(tool)) {
    return arcadeToolProperties("other_arcade", tool, toolInput);
  }
  // Some connectors name the service in the server, not the tool, e.g.
  // mcp__claude_ai_Gmail__search_threads. Only the category is sent.
  const serverParts = toolName.slice("mcp__".length, splitAt).split(/[^A-Za-z0-9]+/);
  const service =
    serviceForToolName(tool) ?? serverParts.map(serviceForToolkit).find(Boolean);
  return withService({ server: "other" }, service);
};

const operatorStatus = (message) => {
  const match = typeof message === "string" && message.match(OPERATOR_STATUS);
  return match ? match[1].toLowerCase() : "unknown";
};

const promptProperties = (prompt) => {
  const { couldUseArcade, serviceHints } = classifyPrompt(prompt);
  return {
    could_use_arcade: couldUseArcade,
    service_hints: serviceHints,
    reminder_sent: shouldRemind(prompt),
  };
};

/** Returns [event name, extra properties], or null for untracked input. */
const eventFor = (input) => {
  switch (input.hook_event_name) {
    case "SessionStart":
      return [
        "Plugin session started",
        { source: oneOf(input.source, SESSION_SOURCES, "other") },
      ];
    case "UserPromptSubmit":
      if (isTaskNotification(input.prompt)) return null;
      return ["Plugin prompt submitted", promptProperties(input.prompt)];
    case "PostToolUse": {
      const extra = toolProperties(input.tool_name, input.tool_input);
      return extra && ["Plugin tool called", extra];
    }
    case "PostToolUseFailure": {
      const extra = toolProperties(input.tool_name, input.tool_input);
      return extra && ["Plugin tool failed", extra];
    }
    case "SubagentStop":
      if (!isOperatorAgentType(input.agent_type)) {
        return ["Plugin subagent stopped", { agent: "other" }];
      }
      return [
        "Plugin subagent stopped",
        {
          agent: "arcade-operator",
          status: operatorStatus(input.last_assistant_message),
        },
      ];
    default:
      return null;
  }
};

const keepAllowed = (event, properties) => {
  const kept = {};
  for (const key of [...COMMON_PROPERTIES, ...ALLOWED_PROPERTIES[event]]) {
    if (properties[key] !== undefined) kept[key] = properties[key];
  }
  return kept;
};

/**
 * Builds `{ event, distinct_id, properties }` from hook stdin, or returns null
 * when the input is not something docs/telemetry.md tracks.
 */
export const buildEvent = (input, { installId, os }) => {
  if (!input || typeof input !== "object") return null;
  const found = eventFor(input);
  if (!found) return null;
  const [event, extra] = found;

  const properties = {
    ...extra,
    host: "claude-code",
    plugin_version: PLUGIN_VERSION,
    os: oneOf(os, OS_NAMES, "other"),
    $process_person_profile: false,
    $geoip_disable: true,
    // PostHog stores the request's IP unless the event sets one. Null and ""
    // are replaced; a fixed placeholder is kept.
    $ip: "0.0.0.0",
  };
  if (typeof input.session_id === "string") {
    properties.session = shortHash(installId, input.session_id);
  }
  if (typeof input.prompt_id === "string" && event !== "Plugin session started") {
    properties.turn = shortHash(installId, input.prompt_id);
  }

  return {
    event,
    distinct_id: installId,
    properties: keepAllowed(event, properties),
  };
};
