// @ts-check
/**
 * Turns Claude Code hook input into a telemetry event. Pure: no I/O.
 * What may be sent is defined in telemetry-contract.mjs.
 */

import { createHash } from "node:crypto";
import { isTaskNotification, shouldRemind } from "./prompt-filters.mjs";
import { isOperatorAgentType } from "./routing-guidance.mjs";
import {
  classifyPrompt,
  serviceForToolkit,
  serviceForToolName,
} from "./telemetry-classify.mjs";
import {
  allowedProperties,
  ARCADE_TOOL_PREFIX,
  GATEWAY_TOOLS,
  OPERATOR_STATUSES,
  OS_NAMES,
  SESSION_SOURCES,
} from "./telemetry-contract.mjs";
import { PLUGIN_VERSION } from "./telemetry-config.mjs";

/** @typedef {Record<string, any>} HookInput Claude Code hook stdin. */

// Matches the operator's report line, e.g. "status: needs_auth", with or
// without markdown around it. "unknown" is what we send when none matches.
const OPERATOR_STATUS = new RegExp(
  `^[^\\w\\n]*status[^\\w\\n]*(${OPERATOR_STATUSES.filter((s) => s !== "unknown").join("|")})\\b`,
  "im",
);

// Claude Code's session ID is random, new for each session, and never sent,
// so it works as the salt: nothing links one session's hashes to another's.
const shortHash = (/** @type {string} */ text) =>
  createHash("sha256").update(text).digest("hex").slice(0, 16);

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} fallback
 */
const oneOf = (value, allowed, fallback) =>
  typeof value === "string" && allowed.includes(value) ? value : fallback;

/**
 * @param {Record<string, string>} properties
 * @param {string | null | undefined} service
 */
const withService = (properties, service) =>
  service ? { ...properties, service } : properties;

/**
 * @param {string} server
 * @param {string} tool
 * @param {HookInput | undefined} toolInput
 */
const arcadeToolProperties = (server, tool, toolInput) => {
  // Arcade_UseTool names the app tool in its input, e.g. "Gmail.ListEmails".
  const service =
    tool === "Arcade_UseTool"
      ? serviceForToolName(toolInput?.tool_name)
      : serviceForToolName(tool);
  // Custom toolkit names could be private, so only public names are sent.
  const isPublic = /** @type {readonly string[]} */ (GATEWAY_TOOLS).includes(tool) || service !== null;
  return withService({ server, tool: isPublic ? tool : "other" }, service);
};

/**
 * @param {unknown} toolName
 * @param {HookInput | undefined} toolInput
 */
const toolProperties = (toolName, toolInput) => {
  if (typeof toolName !== "string" || !toolName.startsWith("mcp__")) {
    return null;
  }
  const splitAt = toolName.lastIndexOf("__");
  const tool = toolName.slice(splitAt + 2);
  if (toolName.startsWith(ARCADE_TOOL_PREFIX)) {
    return arcadeToolProperties("arcade", tool, toolInput);
  }
  if (/** @type {readonly string[]} */ (GATEWAY_TOOLS).includes(tool)) {
    return arcadeToolProperties("other_arcade", tool, toolInput);
  }
  // Some connectors name the service in the server, not the tool, e.g.
  // mcp__claude_ai_Gmail__search_threads. Only the category is sent.
  const serverParts = toolName.slice("mcp__".length, splitAt).split(/[^A-Za-z0-9]+/);
  const service =
    serviceForToolName(tool) ?? serverParts.map(serviceForToolkit).find(Boolean);
  return withService({ server: "other" }, service);
};

const operatorStatus = (/** @type {unknown} */ message) => {
  const match = typeof message === "string" && message.match(OPERATOR_STATUS);
  return match ? match[1].toLowerCase() : "unknown";
};

const promptProperties = (/** @type {unknown} */ prompt) => {
  const { couldUseArcade, serviceHints } = classifyPrompt(prompt);
  return {
    could_use_arcade: couldUseArcade,
    service_hints: serviceHints,
    reminder_sent: shouldRemind(prompt),
  };
};

/**
 * Returns [event name, extra properties], or null for untracked input.
 * @param {HookInput} input
 * @returns {[string, Record<string, unknown>] | null}
 */
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

/**
 * @param {string} event
 * @param {Record<string, unknown>} properties
 */
const keepAllowed = (event, properties) => {
  /** @type {Record<string, unknown>} */
  const kept = {};
  for (const key of allowedProperties(event)) {
    if (properties[key] !== undefined) kept[key] = properties[key];
  }
  return kept;
};

/**
 * Builds `{ event, distinct_id, properties }` from hook stdin, or returns null
 * when the input is not something the contract tracks.
 * @param {HookInput | null | undefined} input
 * @param {{ os: string, arcadeUsedBefore: boolean }} options
 */
export const buildEvent = (input, { os, arcadeUsedBefore }) => {
  if (!input || typeof input !== "object") return null;
  if (typeof input.session_id !== "string" || input.session_id === "") return null;
  const found = eventFor(input);
  if (!found) return null;
  const [event, extra] = found;

  /** @type {Record<string, unknown>} */
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
    arcade_used_before: arcadeUsedBefore === true,
  };
  const session = shortHash(input.session_id);
  properties.session = session;
  if (typeof input.prompt_id === "string") {
    properties.turn = shortHash(`${input.session_id}:${input.prompt_id}`);
  }

  return {
    event,
    distinct_id: session,
    properties: keepAllowed(event, properties),
  };
};

/**
 * True for a successful call to this plugin's Arcade gateway or another
 * Arcade connection.
 * @param {{ event: string, properties: Record<string, unknown> }} event
 */
export const isArcadeCall = ({ event, properties }) =>
  event === "Plugin tool called" && (properties.server === "arcade" || properties.server === "other_arcade");
