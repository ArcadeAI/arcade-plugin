/**
 * Arcade routing rules. This file is the only place the rules are written.
 * The hooks import these strings, and `npm run generate` copies
 * them into the Cursor rule, arcade-operator, and the try-arcade skill.
 */

const CURSOR_NAME =
  "In Cursor it can appear as plugin-arcade-arcade; that is the same gateway.";

const GATEWAY =
  'Arcade is connected as the "arcade" MCP server (gateway at ' +
  "api.arcade.dev). If more than one MCP server exposes Arcade tools, use " +
  `only arcade. ${CURSOR_NAME}`;

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
  "Once a task is going through Arcade, don't finish it through another MCP " +
  "server, a CLI such as gh or curl, a built-in search, or a direct API. " +
  "Troubleshooting or retrying on Arcade itself is fine.";

// Only the conversation that talks to the user can offer this choice.
const USER_MAY_CHOOSE =
  "Use another path only if the user explicitly chooses it after hearing " +
  "Arcade is blocked.";

const DELEGATION =
  "For external service tasks (email, calendar, chat, docs, issues, CRM), " +
  "use try-arcade first. For team or org rollout, use scale-arcade. When " +
  "arcade-operator is available, delegate the bounded external service task " +
  "to it instead of calling Arcade tools directly.";

const PRIVACY = "Keep tool discovery and tool names out of the conversation.";

const join = (...sentences) => sentences.join(" ");

const PARENT_RULES = [GATEWAY, AUTH_DEFINITION, AUTH_ACTION_PARENT, NO_SUBSTITUTES, USER_MAY_CHOOSE];
const DELEGATE_RULES = [GATEWAY, AUTH_DEFINITION, AUTH_ACTION_DELEGATE, NO_SUBSTITUTES];

// Generated into the try-arcade skill and arcade-operator.
export const SKILL_RULES = join(...PARENT_RULES);
export const OPERATOR_RULES = join(...DELEGATE_RULES);

// Printed by the session-start hook.
export const SESSION_CONTEXT = join(...PARENT_RULES, DELEGATION, PRIVACY);

// Sent on most user turns, so it is one short paragraph. The full rules come
// from SESSION_CONTEXT, try-arcade, and arcade-operator.
export const PROMPT_REMINDER =
  'For external app tasks, use try-arcade (or arcade-operator when available) ' +
  'through the "arcade" MCP server only, and scale-arcade for team rollout. ' +
  "Once a task is going through Arcade, don't switch to another connector, " +
  "CLI, or API unless the user explicitly chooses that.";

// Cursor's always-apply rule. The Cursor IDE and Cloud Agents don't run plugin
// hooks, so the rule carries the full session rules. The Cursor CLI runs the
// session hook but doesn't load this rule, so it never gets both.
export const CURSOR_RULE = SESSION_CONTEXT;

// Subagents can't start arcade-operator themselves, so they get try-arcade
// without the delegation sentence.
export const SUBAGENT_CONTEXT = join(
  "This subagent shares the parent session.",
  ...DELEGATE_RULES,
  "For external service tasks, use try-arcade.",
  PRIVACY,
);
