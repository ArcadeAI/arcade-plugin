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

/**
 * @typedef {object} Property
 * @property {object} schema JSON Schema for the value.
 * @property {string} doc What the value is, for docs/telemetry.md.
 */

const HASH = { type: "string", pattern: "^[0-9a-f]{16}$" };
// The install ID, from crypto.randomUUID().
const UUID = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const oneOf = (/** @type {readonly string[]} */ values) => ({ enum: [...values] });
const list = (/** @type {readonly string[]} */ values) => values.map((value) => `\`${value}\``).join(" \\| ");

/** Properties every event may carry. @type {Record<string, Property>} */
export const COMMON_PROPERTIES = {
  session: { schema: HASH, doc: '`sha256(install_id + ":" + session_id)`, first 16 hex characters' },
  turn: {
    schema: HASH,
    doc: '`sha256(install_id + ":" + prompt_id)`, first 16 hex characters (not on `Plugin session started`)',
  },
  host: { schema: oneOf(TELEMETRY_HOSTS), doc: list(TELEMETRY_HOSTS) },
  plugin_version: { schema: { type: "string", minLength: 1 }, doc: "from `VERSION`" },
  os: { schema: oneOf(OS_NAMES), doc: list(OS_NAMES) },
  $process_person_profile: { schema: { const: false }, doc: "`false`" },
  $geoip_disable: { schema: { const: true }, doc: "`true`" },
  $ip: { schema: { const: "0.0.0.0" }, doc: "`0.0.0.0`, so PostHog stores this instead of your real IP address" },
};

/** Common properties present on every event. */
const ALWAYS_SENT = ["host", "plugin_version", "os", "$process_person_profile", "$geoip_disable", "$ip"];

const TOOL_PROPERTIES = {
  server: {
    schema: oneOf(SERVERS),
    doc: "`arcade` (this plugin's gateway) \\| `other_arcade` (another connection exposing Arcade's gateway tools) \\| `other`",
  },
  tool: {
    schema: { type: "string", pattern: "^(other|[A-Za-z]+_[A-Za-z0-9]+)$" },
    doc: "only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`",
  },
  service: {
    schema: oneOf(SERVICE_CATEGORIES),
    doc: "the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one",
  },
};

// A tool name is only sent for Arcade's own gateways.
const TOOL_RULES = [
  { if: { properties: { server: { const: "other" } } }, then: { not: { required: ["tool"] } } },
];

/**
 * @typedef {object} EventSpec
 * @property {string} hook The Claude Code hook that sends it.
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
    properties: { source: { schema: oneOf(SESSION_SOURCES), doc: list(SESSION_SOURCES) } },
    required: ["source"],
    excludes: ["turn"],
  },
  "Plugin prompt submitted": {
    hook: "UserPromptSubmit",
    when: "except background task results that Claude Code passes through the same hook",
    properties: {
      could_use_arcade: { schema: { type: "boolean" }, doc: "boolean, a local keyword guess (see below)" },
      service_hints: {
        schema: { type: "array", items: oneOf(SERVICE_CATEGORIES), uniqueItems: true },
        doc: "service categories the prompt mentions",
      },
      reminder_sent: { schema: { type: "boolean" }, doc: "boolean, whether the routing reminder was added" },
    },
    required: ["could_use_arcade", "service_hints", "reminder_sent"],
  },
  "Plugin tool called": {
    hook: "PostToolUse",
    when: "on MCP tools",
    properties: TOOL_PROPERTIES,
    required: ["server"],
    rules: TOOL_RULES,
  },
  "Plugin tool failed": {
    hook: "PostToolUseFailure",
    when: "on MCP tools",
    properties: TOOL_PROPERTIES,
    required: ["server"],
    rules: TOOL_RULES,
  },
  "Plugin subagent stopped": {
    hook: "SubagentStop",
    when: "",
    properties: {
      agent: { schema: oneOf(AGENTS), doc: list(AGENTS) },
      status: {
        schema: oneOf(OPERATOR_STATUSES),
        doc: `only for \`arcade-operator\`: the status line of its final report, ${list(OPERATOR_STATUSES)}`,
      },
    },
    required: ["agent"],
    // Only the operator's status is read.
    rules: [{ if: { properties: { agent: { const: "other" } } }, then: { not: { required: ["status"] } } }],
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
      distinct_id: { type: "string", pattern: UUID },
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
