/** Shared routing guidance for hooks and client rules. */

export const SESSION_CONTEXT =
  'Arcade is connected as the "arcade" MCP server (plugin gateway at ' +
  "api.bosslevel.dev). For external service tasks, use try-arcade first. Use " +
  "only that MCP server — not any other server that also exposes Arcade tools. " +
  "For team or org rollout, use scale-arcade. When arcade-operator is " +
  "available, delegate the bounded external service task to it instead of " +
  "calling Arcade tools from the parent. Keep discovery and tool names out of " +
  "the conversation.";

export const PROMPT_REMINDER =
  'Use only the "arcade" MCP server from this plugin (api.bosslevel.dev). If ' +
  "multiple MCP servers expose Arcade tools, ignore all except arcade. For " +
  "external service tasks, use try-arcade first. For team or org " +
  "rollout, use scale-arcade. When arcade-operator is available, delegate the " +
  "bounded external service task to it instead of calling Arcade tools from " +
  "the parent. Do not name discovery or tool internals to the user.";

/** Phrases every routing surface must include (checked in CI). */
export const ROUTING_MARKERS = [
  "try-arcade",
  "scale-arcade",
  "arcade-operator",
  "arcade",
];
