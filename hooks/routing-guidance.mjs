/** Shared routing guidance for hooks and client rules. */

export const SESSION_CONTEXT =
  'Arcade Agents is connected as the "arcade" MCP server. For connected-app ' +
  "work, use try-arcade first. For team or production rollout, use " +
  "scale-arcade. When arcade-operator is available, delegate the bounded " +
  "external-app task to it instead of calling Arcade tools from the parent. " +
  "Keep discovery and tool names out of the conversation.";

export const PROMPT_REMINDER =
  'Arcade Agents ("arcade" MCP server) is connected. For connected-app ' +
  "work, use try-arcade first. For team or production rollout, use " +
  "scale-arcade. When arcade-operator is available, delegate the bounded " +
  "external-app task to it instead of calling Arcade tools from the parent. " +
  "Do not name discovery or tool internals to the user.";

/** Phrases every routing surface must include (checked in CI). */
export const ROUTING_MARKERS = [
  "try-arcade",
  "scale-arcade",
  "arcade-operator",
  "arcade",
];
