/** Shared routing guidance for hooks and client rules. */

export const SESSION_CONTEXT =
  'Arcade is connected as the "arcade" MCP server (plugin gateway at ' +
  "api.arcade.dev). For external service tasks, use try-arcade first. Use " +
  "only that MCP server — not any other server that also exposes Arcade tools. " +
  "If it explicitly shows needsAuth, or its plugin namespace is present but has " +
  "zero tools, stop and ask the user to authenticate it in this host's MCP " +
  "settings. Treat a missing, unavailable, or failing gateway as a setup or " +
  "connection failure instead, and ask the user to check the plugin and MCP " +
  "settings. Do not substitute another MCP server, CLI, or direct API. For team " +
  "or org rollout, use scale-arcade. When arcade-operator is available, delegate " +
  "the bounded external service task to it instead of calling Arcade tools from " +
  "the parent. Surface needs_auth as authentication and failed with its actual " +
  "error; keep any troubleshooting or retry on Arcade. Keep discovery and tool " +
  "names out of the conversation.";

// Sent on most user turns, so it stays short. The auth and failure rules come
// from SESSION_CONTEXT, the try-arcade skill, and arcade-operator instead.
export const PROMPT_REMINDER =
  'Use only the "arcade" MCP server from this plugin (api.arcade.dev). If ' +
  "multiple MCP servers expose Arcade tools, ignore all except arcade. Never " +
  "fall back to another connector, CLI, or API. For external service tasks, " +
  "use try-arcade first. For team or org rollout, use scale-arcade. When " +
  "arcade-operator is available, delegate the bounded external service task " +
  "to it instead of calling Arcade tools from the parent. Do not name " +
  "discovery or tool internals to the user.";

export const SUBAGENT_CONTEXT =
  'This subagent shares the parent session. Use only the "arcade" MCP server ' +
  "from this plugin (api.arcade.dev). If multiple MCP servers expose Arcade " +
  "tools, ignore all except arcade. If it explicitly shows needsAuth, or its " +
  "plugin namespace is present but has zero tools, return needs_auth and ask the " +
  "user to authenticate it in this host's MCP settings. Treat a missing, " +
  "unavailable, or failing gateway as a setup or connection failure and return " +
  "failed with the actual error. Do not substitute another MCP server, CLI, or " +
  "direct API. For external service tasks, use try-arcade first. For team or org " +
  "rollout, use scale-arcade. When arcade-operator is available, delegate the " +
  "bounded external service task to it instead of calling Arcade tools from the " +
  "parent or subagent. Keep troubleshooting or retry on Arcade. Do not name " +
  "discovery or tool internals to the user.";

/** Phrases every routing surface must include (checked in CI). */
export const ROUTING_MARKERS = [
  "try-arcade",
  "scale-arcade",
  "arcade-operator",
  "arcade",
];

/**
 * Auth and failure phrases required on every surface except PROMPT_REMINDER
 * (checked in CI).
 */
export const AUTH_MARKERS = ["needsAuth", "setup or connection failure"];

const OPERATOR_AGENT = "arcade-operator";

/** True for arcade-operator, bare or plugin-scoped (e.g. "arcade:arcade-operator"). */
export const isOperatorAgentType = (agentType) =>
  typeof agentType === "string" &&
  (agentType === OPERATOR_AGENT || agentType.endsWith(`:${OPERATOR_AGENT}`));
