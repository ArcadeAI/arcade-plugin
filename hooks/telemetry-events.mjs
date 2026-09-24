// @ts-check
/**
 * Turns Claude Code or Copilot CLI hook input into a telemetry event. Pure: no I/O.
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
  COPILOT_ARCADE_SERVER,
  GATEWAY_TOOLS,
  OPERATOR_STATUSES,
  OS_NAMES,
  SESSION_SOURCES,
} from "./telemetry-contract.mjs";
import { PLUGIN_VERSION } from "./telemetry-config.mjs";
import { authNeeded, failureKind } from "./telemetry-failures.mjs";

/** @typedef {Record<string, any>} HookInput Hook stdin. */

// Matches the operator's report line, e.g. "status: needs_auth", with or
// without markdown around it. "unknown" is what we send when none matches.
const OPERATOR_STATUS = new RegExp(
  `^[^\\w\\n]*status[^\\w\\n]*(${OPERATOR_STATUSES.filter((s) => s !== "unknown").join("|")})\\b`,
  "im",
);

// The client's session ID is random, new for each session, and never sent,
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
const claudeToolProperties = (toolName, toolInput) => {
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

/**
 * @param {unknown} toolName
 * @param {HookInput | undefined} toolInput
 */
const copilotToolProperties = (toolName, toolInput) => {
  if (typeof toolName !== "string") return null;
  // Arcade tool names never contain "-", so the last one ends the server name.
  const splitAt = toolName.lastIndexOf("-");
  // Built-in tools (Bash, Agent) have no server prefix.
  if (splitAt <= 0 || splitAt === toolName.length - 1) return null;
  const server = toolName.slice(0, splitAt);
  const tool = toolName.slice(splitAt + 1);
  if (server === COPILOT_ARCADE_SERVER) {
    return arcadeToolProperties("arcade", tool, toolInput);
  }
  if (/** @type {readonly string[]} */ (GATEWAY_TOOLS).includes(tool)) {
    return arcadeToolProperties("other_arcade", tool, toolInput);
  }
  const serverParts = server.split(/[^A-Za-z0-9]+/);
  const service =
    serviceForToolName(tool) ?? serverParts.map(serviceForToolkit).find(Boolean);
  return withService({ server: "other" }, service);
};

/**
 * @typedef {object} HostInput
 * @property {(toolName: unknown, toolInput: HookInput | undefined) => Record<string, string> | null} toolProperties
 * @property {(input: HookInput) => unknown} toolResponse The tool's result, read only by authNeeded.
 * @property {boolean} builtinTools Whether WebFetch, WebSearch, and Bash calls send built-in tool events.
 * @property {boolean} promptReminder Whether the client runs user-prompt-submit.mjs.
 * @property {boolean} subagentSession Whether to include subagent_session on SubagentStop events.
 */

/** How each TELEMETRY_HOSTS value's hook input is read. @type {Record<string, HostInput>} */
export const HOST_INPUT = {
  "claude-code": {
    toolProperties: claudeToolProperties,
    toolResponse: (input) => input.tool_response,
    builtinTools: true,
    promptReminder: true,
    subagentSession: false,
  },
  // Copilot CLI drops prompt-hook output, so it has no reminder hook. No
  // built-in tool hooks are generated for it.
  "copilot-cli": {
    toolProperties: copilotToolProperties,
    toolResponse: (input) => input.tool_result?.text_result_for_llm,
    builtinTools: false,
    promptReminder: false,
    subagentSession: true,
  },
};

const operatorStatus = (/** @type {unknown} */ message) => {
  const match = typeof message === "string" && message.match(OPERATOR_STATUS);
  return match ? match[1].toLowerCase() : "unknown";
};

/**
 * @param {unknown} prompt
 * @param {HostInput} hostInput
 */
const promptProperties = (prompt, hostInput) => {
  const { couldUseArcade, serviceHints } = classifyPrompt(prompt);
  return {
    could_use_arcade: couldUseArcade,
    service_hints: serviceHints,
    reminder_sent: hostInput.promptReminder && shouldRemind(prompt),
  };
};

// The parent's SubagentStop names the subagent's session ID as agent_id.
const subagentSession = (/** @type {unknown} */ agentId) =>
  typeof agentId === "string" && agentId !== "" ? { subagent_session: shortHash(agentId) } : {};

/**
 * Returns [event name, extra properties], or null for untracked input.
 * @param {HookInput} input
 * @param {HostInput} hostInput
 * @param {string | undefined} cli
 * @returns {[string, Record<string, unknown>] | null}
 */
const eventFor = (input, hostInput, cli) => {
  switch (input.hook_event_name) {
    case "SessionStart":
      return [
        "Plugin session started",
        { source: oneOf(input.source, SESSION_SOURCES, "other") },
      ];
    case "UserPromptSubmit":
      if (isTaskNotification(input.prompt)) return null;
      return ["Plugin prompt submitted", promptProperties(input.prompt, hostInput)];
    case "PostToolUse": {
      const builtin = hostInput.builtinTools && builtinToolProperties(input.tool_name, input.tool_input, cli);
      if (builtin) return ["Plugin built-in tool called", builtin];
      const extra = hostInput.toolProperties(input.tool_name, input.tool_input);
      if (!extra) return null;
      if (extra.tool === "System_ManageAuthorization") {
        return ["Plugin tool called", { ...extra, auth_needed: authNeeded(hostInput.toolResponse(input)) }];
      }
      return ["Plugin tool called", extra];
    }
    case "PostToolUseFailure": {
      const builtin = hostInput.builtinTools && builtinToolProperties(input.tool_name, input.tool_input, cli);
      if (builtin) return ["Plugin built-in tool failed", builtin];
      const extra = hostInput.toolProperties(input.tool_name, input.tool_input);
      if (!extra) return null;
      return ["Plugin tool failed", { ...extra, failure_kind: failureKind(input.error, input.is_interrupt) }];
    }
    case "SubagentStop": {
      const session = hostInput.subagentSession ? subagentSession(input.agent_id) : {};
      if (!isOperatorAgentType(input.agent_type)) {
        return ["Plugin subagent stopped", { agent: "other", ...session }];
      }
      return [
        "Plugin subagent stopped",
        {
          agent: "arcade-operator",
          status: operatorStatus(input.last_assistant_message),
          ...session,
        },
      ];
    }
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
 * when the input is not something the contract tracks or the host is unknown.
 * @param {HookInput | null | undefined} input
 * @param {{ host: string, os: string, arcadeUsedBefore: boolean, cli?: string }} options
 *   `cli` is the hook command's `--cli` argument, set only on Bash entries.
 */
export const buildEvent = (input, { host, os, arcadeUsedBefore, cli }) => {
  if (!Object.hasOwn(HOST_INPUT, host)) return null;
  const hostInput = HOST_INPUT[host];
  if (!input || typeof input !== "object") return null;
  if (typeof input.session_id !== "string" || input.session_id === "") return null;
  const found = eventFor(input, hostInput, cli);
  if (!found) return null;
  const [event, extra] = found;

  /** @type {Record<string, unknown>} */
  const properties = {
    ...extra,
    host,
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
