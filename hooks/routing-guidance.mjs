/**
 * Arcade routing rules. This file is the only place the rules are written.
 * The hooks import these strings, and `npm run generate` copies
 * them into the Cursor rule, arcade-operator, and the try-arcade skill.
 */

const CURSOR_NAME =
  "In Cursor it can appear as plugin-arcade-arcade; that is the same gateway.";

const GATEWAY =
  'Arcade is connected as the "arcade" MCP server (gateway at ' +
  `api.arcade.dev). ${CURSOR_NAME} Prefer arcade when several servers expose Arcade tools.`;

const GATEWAY_CHECK =
  "Before using another gateway, verify its account, org, and project match the " +
  "intended destination. Do not broaden authorization or copy secrets, credentials, " +
  "or user sessions. Discover tools on the chosen gateway; do not reuse another " +
  "gateway's query IDs. A gateway switch does not repair missing configuration.";

const PARENT_FALLBACK =
  "If Arcade cannot complete the task, the parent may use another already-authorized " +
  "Arcade gateway or other available tools within the user's authorized task. " +
  GATEWAY_CHECK;

const DELEGATE_FALLBACK =
  "If arcade cannot complete the delegated task, you may use another already-authorized " +
  "Arcade gateway within that task. " + GATEWAY_CHECK;

const AUTH_DEFINITION =
  "If the gateway explicitly shows needsAuth, or its plugin namespace is " +
  "present but has zero tools, the Arcade connection needs authentication in " +
  "this host's MCP settings. A missing, unavailable, or failing gateway is a " +
  "setup or connection failure, not an authentication problem.";

// The parent conversation talks to the user. A subagent or arcade-operator
// reports back to the parent instead.
const AUTH_ACTION_PARENT =
  "For authentication, stop and ask the user to authenticate it; do not poll " +
  "or retry auth in a loop. For permission denial, stop and ask the user to " +
  "resolve it. Do not switch gateways or tools to bypass authentication or " +
  "permission denial. For other failures, report the actual error and apply " +
  "the fallback rule.";

const AUTH_ACTION_DELEGATE =
  "For authentication, return needs_auth. For permission denial, return failed " +
  "with the actual error. Do not switch gateways or tools to bypass authentication " +
  "or permission denial. For other failures, apply the fallback rule or return " +
  "failed with the actual error if no authorized gateway can complete the task.";

// arcade-operator and other subagents report to a parent that can use other
// tools, so they finish only through Arcade and hand back what Arcade couldn't do.
const NO_SUBSTITUTES =
  "Use Arcade gateways for delegated work. Do not substitute non-Arcade MCP " +
  "servers, CLIs, built-in search, or direct APIs. If no authorized gateway can " +
  "complete the task, say what is left in your result so the parent can finish it.";

const DELEGATION =
  "For external service tasks (email, calendar, chat, docs, issues, CRM), " +
  "use try-arcade first. For team or org rollout, use scale-arcade. When " +
  "arcade-operator is available, delegate the bounded external service task " +
  "to it instead of calling Arcade tools directly.";

const PRIVACY = "Keep tool discovery and tool names out of the conversation.";

const line = (label, text) => `${label}: ${text}`;

const PARENT_RULES = [
  line("Gateway", GATEWAY),
  line("Authentication", AUTH_DEFINITION),
  line("If blocked", AUTH_ACTION_PARENT),
  line("Fallback", PARENT_FALLBACK),
];
const DELEGATE_RULES = [
  line("Gateway", GATEWAY),
  line("Authentication", AUTH_DEFINITION),
  line("If blocked", AUTH_ACTION_DELEGATE),
  line("Fallback", DELEGATE_FALLBACK),
  line("Stay on Arcade", NO_SUBSTITUTES),
];

// One labeled line per rule, so a host that injects the whole set can scan it.
const join = (...parts) => parts.join("\n");

// Generated into the try-arcade skill and arcade-operator.
export const SKILL_RULES = join(...PARENT_RULES);
export const OPERATOR_RULES = join(...DELEGATE_RULES);

// Printed by the session-start hook.
export const SESSION_CONTEXT = join(...PARENT_RULES, line("Routing", DELEGATION), line("Privacy", PRIVACY));

// Sent on most user turns, so it is one short paragraph. The full rules come
// from SESSION_CONTEXT, try-arcade, and arcade-operator.
export const PROMPT_REMINDER =
  'For external app tasks, use try-arcade (or arcade-operator when available) ' +
  'first through the "arcade" MCP server, and scale-arcade for team rollout. ' +
  'The parent may finish blocked work under the try-arcade fallback rules.';

// Cursor's always-apply rule. The Cursor IDE and Cloud Agents don't run plugin
// hooks, so the rule carries the full session rules. The Cursor CLI runs the
// session hook but doesn't load this rule, so it never gets both.
export const CURSOR_RULE = SESSION_CONTEXT;

// Subagents can't start arcade-operator themselves, so they get try-arcade
// without the delegation sentence.
export const SUBAGENT_CONTEXT = join(
  line("Session", "This subagent shares the parent session."),
  ...DELEGATE_RULES,
  line("Routing", "For external service tasks, use try-arcade."),
  line("Privacy", PRIVACY),
);
