/** Shared routing guidance for hooks and client rules. */

export const SESSION_CONTEXT =
  'Arcade is connected as the "arcade" MCP server (plugin gateway at ' +
  "api.arcade.dev). For external service tasks, use try-arcade first. Use " +
  "only that MCP server — not any other server that also exposes Arcade tools. " +
  "If the gateway shows needsAuth or has zero tools, stop and tell the user to " +
  "authenticate the Arcade MCP connection in Cursor — do not substitute another " +
  "MCP server, CLI, or direct API. For team or org rollout, use scale-arcade. " +
  "When arcade-operator is available, delegate the bounded external service task " +
  "to it instead of calling Arcade tools from the parent. If the operator " +
  "returns needs_auth or failed, surface that blocker — do not complete the task " +
  "another way unless the user explicitly chooses a different path. Keep " +
  "discovery and tool names out of the conversation.";

export const PROMPT_REMINDER =
  'Use only the "arcade" MCP server from this plugin (api.arcade.dev). If ' +
  "multiple MCP servers expose Arcade tools, ignore all except arcade. If the " +
  "gateway is needsAuth or unavailable, prompt the user to authenticate it — " +
  "never fall back to another connector. For external service tasks, use " +
  "try-arcade first. For team or org rollout, use scale-arcade. When " +
  "arcade-operator is available, delegate the bounded external service task to " +
  "it instead of calling Arcade tools from the parent. Do not name discovery " +
  "or tool internals to the user.";

export const SUBAGENT_CONTEXT =
  'This subagent shares the parent session. Use only the "arcade" MCP server ' +
  "from this plugin (api.arcade.dev). If multiple MCP servers expose Arcade " +
  "tools, ignore all except arcade. For external service tasks, use " +
  "try-arcade first. For team or org rollout, use scale-arcade. When " +
  "arcade-operator is available, delegate the bounded external service task " +
  "to it instead of calling Arcade tools from the parent or subagent. " +
  "Do not name discovery or tool internals to the user.";

/** Phrases every routing surface must include (checked in CI). */
export const ROUTING_MARKERS = [
  "try-arcade",
  "scale-arcade",
  "arcade-operator",
  "arcade",
  "needsAuth",
];
