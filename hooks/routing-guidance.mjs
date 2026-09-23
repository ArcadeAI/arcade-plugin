/**
 * Arcade routing rules. This file is the only place the rules are written.
 * The hooks import these strings at runtime, and `npm run generate` copies
 * them into the Cursor rule, arcade-operator, and the try-arcade skill.
 */

const GATEWAY =
  'Arcade is connected as the "arcade" MCP server (gateway at ' +
  "api.arcade.dev). If more than one MCP server exposes Arcade tools, use " +
  "only arcade. In Cursor it can appear as plugin-arcade-arcade; that is the " +
  "same gateway.";

const AUTH_DEFINITION =
  "If the gateway explicitly shows needsAuth, or its plugin namespace is " +
  "present but has zero tools, the Arcade connection needs authentication in " +
  "this host's MCP settings. A missing, unavailable, or failing gateway is a " +
  "setup or connection failure, not an authentication problem.";

// The parent conversation talks to the user. A subagent or arcade-operator
// reports back to the parent instead.
const AUTH_ACTION_PARENT =
  "For authentication, stop and ask the user to authenticate it; do not poll " +
  "or retry auth in a loop. For a setup or connection failure, report the " +
  "actual error and ask the user to check the plugin and MCP settings.";

const AUTH_ACTION_DELEGATE =
  "For authentication, return needs_auth. For a setup or connection failure, " +
  "return failed with the actual error.";

const NO_SUBSTITUTES =
  "Never fall back to another connector: do not finish the task through " +
  "another MCP server, a CLI such as gh or curl, a built-in search, or a " +
  "direct API, unless the user explicitly chooses that after hearing Arcade " +
  "is blocked. Troubleshooting or retrying on Arcade itself is fine.";

const DELEGATION =
  "For external service tasks, use try-arcade first. For team or org " +
  "rollout, use scale-arcade. When arcade-operator is available, delegate the " +
  "bounded external service task to it instead of calling Arcade tools " +
  "directly.";

const PRIVACY = "Keep tool discovery and tool names out of the conversation.";

const join = (...sentences) => sentences.join(" ");

/** Rules for a conversation that talks to the user. */
export const GATEWAY_RULES_PARENT = join(
  GATEWAY,
  AUTH_DEFINITION,
  AUTH_ACTION_PARENT,
  NO_SUBSTITUTES,
);

/** Rules for an agent that reports to a parent instead of the user. */
export const GATEWAY_RULES_DELEGATE = join(
  GATEWAY,
  AUTH_DEFINITION,
  AUTH_ACTION_DELEGATE,
  NO_SUBSTITUTES,
);

export const SESSION_CONTEXT = join(GATEWAY_RULES_PARENT, DELEGATION, PRIVACY);

// Sent on most user turns, so it leaves out the authentication rules. Those
// come from SESSION_CONTEXT, try-arcade, and arcade-operator.
export const PROMPT_REMINDER = join(GATEWAY, NO_SUBSTITUTES, DELEGATION, PRIVACY);

export const SUBAGENT_CONTEXT = join(
  "This subagent shares the parent session.",
  GATEWAY_RULES_DELEGATE,
  DELEGATION,
  PRIVACY,
);
