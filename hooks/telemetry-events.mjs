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
import { commandUsesCli } from "./telemetry-commands.mjs";
import {
  allowedProperties,
  ARCADE_TOOL_PREFIX,
  BASH_CLIS,
  CLI_SERVICES,
  GATEWAY_TOOLS,
  OPERATOR_STATUSES,
  OS_NAMES,
  SESSION_SOURCES,
} from "./telemetry-contract.mjs";
import { PLUGIN_VERSION } from "./telemetry-config.mjs";
import { authNeeded, failureKind } from "./telemetry-failures.mjs";

/** @typedef {Record<string, any>} HookInput Claude Code hook stdin. */

// Matches the operator's report line, e.g. "status: needs_auth", with or
// without markdown around it. "unknown" is what we send when none matches.
const OPERATOR_STATUS = new RegExp(
  `^[^\\w\\n]*status[^\\w\\n]*(${OPERATOR_STATUSES.filter((s) => s !== "unknown").join("|")})\\b`,
  "im",
);

/**
 * @param {string} installId
 * @param {string} id
 */
const shortHash = (installId, id) =>
  createHash("sha256").update(`${installId}:${id}`).digest("hex").slice(0, 16);

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

/**
 * Properties for a WebFetch, WebSearch, or listed-CLI Bash call, or null to
 * send nothing. Only the tool name and the CLI name are read into the event;
 * the command, its description, URLs, and queries never are.
 * @param {unknown} toolName
 * @param {HookInput | undefined} toolInput
 * @param {string | undefined} cli
 */
const builtinToolProperties = (toolName, toolInput, cli) => {
  if (toolName === "WebFetch" || toolName === "WebSearch") return { tool: toolName };
  if (toolName !== "Bash" || typeof cli !== "string") return null;
  if (!(/** @type {readonly string[]} */ (BASH_CLIS).includes(cli))) return null;
  // `cli` comes from the hook entry's `if` condition. Checking the command as
  // well keeps a client that ignores `if` from reporting every CLI on every
  // Bash call.
  if (!commandUsesCli(toolInput?.command, cli)) return null;
  return withService({ tool: "Bash", cli }, CLI_SERVICES[cli]);
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
 * @param {string | undefined} cli
 * @returns {[string, Record<string, unknown>] | null}
 */
const eventFor = (input, cli) => {
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
      const builtin = builtinToolProperties(input.tool_name, input.tool_input, cli);
      if (builtin) return ["Plugin built-in tool called", builtin];
      const extra = toolProperties(input.tool_name, input.tool_input);
      if (!extra) return null;
      if (extra.tool === "System_ManageAuthorization") {
        return ["Plugin tool called", { ...extra, auth_needed: authNeeded(input.tool_response) }];
      }
      return ["Plugin tool called", extra];
    }
    case "PostToolUseFailure": {
      const builtin = builtinToolProperties(input.tool_name, input.tool_input, cli);
      if (builtin) return ["Plugin built-in tool failed", builtin];
      const extra = toolProperties(input.tool_name, input.tool_input);
      if (!extra) return null;
      return ["Plugin tool failed", { ...extra, failure_kind: failureKind(input.error, input.is_interrupt) }];
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
 * @param {{ installId: string, os: string, cli?: string }} options `cli` is the
 *   hook command's `--cli` argument, set only on Bash entries.
 */
export const buildEvent = (input, { installId, os, cli }) => {
  if (!input || typeof input !== "object") return null;
  const found = eventFor(input, cli);
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
  };
  if (typeof input.session_id === "string") {
    properties.session = shortHash(installId, input.session_id);
  }
  if (typeof input.prompt_id === "string") {
    properties.turn = shortHash(installId, input.prompt_id);
  }

  return {
    event,
    distinct_id: installId,
    properties: keepAllowed(event, properties),
  };
};
