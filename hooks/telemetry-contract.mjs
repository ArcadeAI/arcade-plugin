// @ts-check
/**
 * Every telemetry event the plugin sends, every property on it, and the values
 * each property may take. telemetry-events.mjs sends nothing that isn't listed
 * here, `npm run generate` writes the tables in docs/telemetry.md from it, and
 * the tests check every built event against eventSchema().
 */

export const SERVICE_CATEGORIES = /** @type {const} */ ([
  "email",
  "calendar",
  "chat",
  "issues",
  "docs",
  "meetings",
  "crm",
  "code_hosting",
  "analytics",
  "storage",
]);

export const TELEMETRY_HOSTS = /** @type {const} */ (["claude-code"]);
export const SESSION_SOURCES = /** @type {const} */ (["startup", "resume", "clear", "compact", "fork", "other"]);
export const OS_NAMES = /** @type {const} */ (["darwin", "linux", "win32", "other"]);
export const SERVERS = /** @type {const} */ (["arcade", "other_arcade", "other"]);
export const AGENTS = /** @type {const} */ (["arcade-operator", "other"]);
export const OPERATOR_STATUSES = /** @type {const} */ ([
  "completed",
  "needs_auth",
  "needs_confirmation",
  "needs_clarification",
  "failed",
  "unknown",
]);

/** Tool name prefix for this plugin's own gateway: plugin "arcade", MCP server "arcade". */
export const ARCADE_TOOL_PREFIX = "mcp__plugin_arcade_arcade__";

// Tools every Arcade gateway exposes. Seeing one on another server means the
// model used a different Arcade connection than this plugin's.
export const GATEWAY_TOOLS = /** @type {const} */ ([
  "Arcade_ListApps",
  "Arcade_SelectTools",
  "Arcade_UseTool",
  "System_ManageAuthorization",
]);

// Arcade toolkit name (the part of a tool name before "_" or ".", lowercased)
// to its service category. Tool names from these toolkits are public.
/** @type {Record<string, typeof SERVICE_CATEGORIES[number]>} */
export const TOOLKIT_SERVICES = {
  gmail: "email", outlookmail: "email",
  googlecalendar: "calendar", outlookcalendar: "calendar", microsoftoutlookcalendar: "calendar", calendly: "calendar",
  slack: "chat", discord: "chat", discordbot: "chat", microsoftteams: "chat",
  linear: "issues", jira: "issues", asana: "issues", clickup: "issues", trello: "issues",
  notion: "docs", googledocs: "docs", confluence: "docs",
  googlesheets: "docs", microsoftword: "docs", microsoftexcel: "docs",
  granola: "meetings", zoom: "meetings", fireflies: "meetings",
  hubspot: "crm", salesforce: "crm", attio: "crm",
  github: "code_hosting", gitlab: "code_hosting", bitbucket: "code_hosting",
  posthog: "analytics",
  googledrive: "storage", dropbox: "storage", sharepoint: "storage", onedrive: "storage",
};

/**
 * @typedef {object} Property
 * @property {object} schema JSON Schema for the value.
 * @property {string} doc What the value is, for docs/telemetry.md.
 */

const HASH = { type: "string", pattern: "^[0-9a-f]{16}$" };
// VERSION, or "unknown" when it can't be read.
const PLUGIN_VERSION_PATTERN = "^(unknown|[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z.-]+)?)$";
const enumOf = (/** @type {readonly string[]} */ values) => ({ enum: [...values] });
const list = (/** @type {readonly string[]} */ values) => values.map((value) => `\`${value}\``).join(" \\| ");

/** Properties every event may carry. @type {Record<string, Property>} */
export const COMMON_PROPERTIES = {
  session: {
    schema: HASH,
    doc: "`sha256(session_id)`, first 16 hex characters, where `session_id` is Claude Code's random ID for the session",
  },
  turn: {
    schema: HASH,
    doc: '`sha256(session_id + ":" + prompt_id)`, first 16 hex characters (not on `Plugin session started`)',
  },
  arcade_used_before: {
    schema: { type: "boolean" },
    doc: "whether an Arcade tool call had succeeded on this machine before this event (from the `arcade-used` file)",
  },
  host: { schema: enumOf(TELEMETRY_HOSTS), doc: list(TELEMETRY_HOSTS) },
  plugin_version: { schema: { type: "string", pattern: PLUGIN_VERSION_PATTERN }, doc: "from `VERSION`" },
  os: { schema: enumOf(OS_NAMES), doc: list(OS_NAMES) },
  $process_person_profile: { schema: { const: false }, doc: "`false`" },
  $geoip_disable: { schema: { const: true }, doc: "`true`" },
  $ip: { schema: { const: "0.0.0.0" }, doc: "`0.0.0.0`, so PostHog stores this instead of your real IP address" },
};

/** Common properties present on every event. */
const ALWAYS_SENT = ["session", "arcade_used_before", "host", "plugin_version", "os", "$process_person_profile", "$geoip_disable", "$ip"];

// JSON Schema patterns have no case-insensitive flag, and the builder matches
// toolkit names in any case, so each letter becomes a two-case class.
const anyCase = (/** @type {string} */ word) =>
  [...word].map((char) => (/[a-z]/.test(char) ? `[${char}${char.toUpperCase()}]` : char)).join("");

// "other", a gateway tool, or a tool from a toolkit in TOOLKIT_SERVICES.
const PUBLIC_TOOL = {
  anyOf: [
    enumOf(["other", ...GATEWAY_TOOLS]),
    { type: "string", pattern: `^(${Object.keys(TOOLKIT_SERVICES).map(anyCase).join("|")})[_.]` },
  ],
};

const TOOL_PROPERTIES = {
  server: {
    schema: enumOf(SERVERS),
    doc: "`arcade` (this plugin's gateway) \\| `other_arcade` (another connection exposing Arcade's gateway tools) \\| `other`",
  },
  tool: {
    schema: PUBLIC_TOOL,
    doc: "only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`",
  },
  service: {
    schema: enumOf(SERVICE_CATEGORIES),
    doc: "the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one",
  },
};

// A tool name is sent for Arcade's own gateways, and only for them.
const TOOL_RULES = [
  { if: { properties: { server: { const: "other" } } }, then: { not: { required: ["tool"] } } },
  { if: { properties: { server: enumOf(["arcade", "other_arcade"]) } }, then: { required: ["tool"] } },
];

/**
 * @typedef {object} EventSpec
 * @property {string} hook The Claude Code hook that sends it.
 * @property {boolean} [mcpToolsOnly] Runs only on MCP tools, using each client's `mcpToolMatcher`.
 * @property {string} when Extra conditions, for docs/telemetry.md.
 * @property {Record<string, Property>} properties Properties beyond COMMON_PROPERTIES.
 * @property {string[]} required
 * @property {object[]} [rules] Extra JSON Schema rules for this event.
 * @property {string[]} [excludes] Common properties this event never carries.
 */

/** @type {Record<string, EventSpec>} */
export const EVENTS = {
  "Plugin session started": {
    hook: "SessionStart",
    when: "",
    properties: { source: { schema: enumOf(SESSION_SOURCES), doc: list(SESSION_SOURCES) } },
    required: ["source"],
    excludes: ["turn"],
  },
  "Plugin prompt submitted": {
    hook: "UserPromptSubmit",
    when: "except background task results that Claude Code passes through the same hook",
    properties: {
      could_use_arcade: { schema: { type: "boolean" }, doc: "boolean, a local keyword guess (see below)" },
      service_hints: {
        schema: { type: "array", items: enumOf(SERVICE_CATEGORIES), uniqueItems: true },
        doc: "service categories the prompt mentions",
      },
      reminder_sent: { schema: { type: "boolean" }, doc: "boolean, whether the routing reminder was added" },
    },
    required: ["could_use_arcade", "service_hints", "reminder_sent"],
  },
  "Plugin tool called": {
    hook: "PostToolUse",
    mcpToolsOnly: true,
    when: "on MCP tools",
    properties: TOOL_PROPERTIES,
    required: ["server"],
    rules: TOOL_RULES,
  },
  "Plugin tool failed": {
    hook: "PostToolUseFailure",
    mcpToolsOnly: true,
    when: "on MCP tools",
    properties: TOOL_PROPERTIES,
    required: ["server"],
    rules: TOOL_RULES,
  },
  "Plugin subagent stopped": {
    hook: "SubagentStop",
    when: "",
    properties: {
      agent: { schema: enumOf(AGENTS), doc: list(AGENTS) },
      status: {
        schema: enumOf(OPERATOR_STATUSES),
        doc: `only for \`arcade-operator\`: the status line of its final report, ${list(OPERATOR_STATUSES)}`,
      },
    },
    required: ["agent"],
    // Only the operator's status is read, and it is always sent.
    rules: [
      { if: { properties: { agent: { const: "other" } } }, then: { not: { required: ["status"] } } },
      { if: { properties: { agent: { const: "arcade-operator" } } }, then: { required: ["status"] } },
    ],
  },
};

/** Property names an event may carry, common ones included. */
export const allowedProperties = (/** @type {string} */ eventName) => [
  ...Object.keys(COMMON_PROPERTIES).filter((key) => !EVENTS[eventName].excludes?.includes(key)),
  ...Object.keys(EVENTS[eventName].properties),
];

/** JSON Schema (2020-12) for one event as sent to PostHog: `{ event, distinct_id, properties }`. */
export const eventSchema = () => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  oneOf: Object.entries(EVENTS).map(([name, spec]) => ({
    type: "object",
    additionalProperties: false,
    required: ["event", "distinct_id", "properties"],
    properties: {
      event: { const: name },
      distinct_id: HASH,
      properties: {
        type: "object",
        additionalProperties: false,
        required: [...ALWAYS_SENT, ...spec.required],
        properties: Object.fromEntries(
          allowedProperties(name).map((key) => [key, { ...COMMON_PROPERTIES, ...spec.properties }[key].schema]),
        ),
        ...(spec.rules ? { allOf: spec.rules } : {}),
      },
    },
  })),
});
