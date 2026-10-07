// @ts-check
/** Aggregate exported PostHog plugin telemetry rows into count-only reports. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import { EVENTS, eventSchema } from "../hooks/telemetry-contract.mjs";

const Ajv2020 = /** @type {new (options?: object) => import("ajv").default} */ (
  /** @type {any} */ (Ajv2020Module).default ?? Ajv2020Module
);

const KNOWN_EVENTS = new Set(Object.keys(EVENTS));

const DISCOVERY_TOOLS = new Set(["Arcade_ListApps", "Arcade_SelectTools"]);
const MCP_EVENTS = new Set(["Plugin tool attempted", "Plugin tool called", "Plugin tool failed"]);
const OUTCOME_EVENTS = new Set(["Plugin tool called", "Plugin tool failed"]);
const APP_ACTION_TOOLS = new Set(["Arcade_UseTool", "app_tool"]);

const validateRow = new Ajv2020({ allErrors: true }).compile(eventSchema());

/** @param {unknown} row */
const isValidRow = (row) => validateRow(row) === true;

/** @param {unknown} row */
const isLegacyRow = (row) => {
  if (!row || typeof row !== "object") return false;
  const record = /** @type {{ event?: string, properties?: Record<string, unknown> }} */ (row);
  return (
    typeof record.event === "string" &&
    KNOWN_EVENTS.has(record.event) &&
    record.properties &&
    typeof record.properties === "object" &&
    record.properties.telemetry_version === undefined
  );
};

/**
 * @param {Record<string, unknown>} properties
 * @returns {{ host: string, plugin_version: string, telemetry_version: number | "legacy" }}
 */
const groupKey = (properties) => ({
  host: String(properties.host),
  plugin_version: String(properties.plugin_version),
  telemetry_version:
    properties.telemetry_version === undefined ? "legacy" : Number(properties.telemetry_version),
});

/** @param {string} server */
const isArcadeServer = (server) => server === "arcade" || server === "other_arcade";

/**
 * @param {{ event: string, properties: Record<string, unknown> }} row
 */
const isArcadeMcpRow = (row) =>
  MCP_EVENTS.has(row.event) && isArcadeServer(String(row.properties.server ?? ""));

/**
 * @param {{ event: string, properties: Record<string, unknown> }} row
 */
const toolName = (row) => (typeof row.properties.tool === "string" ? row.properties.tool : "");

/**
 * @param {{ event: string, properties: Record<string, unknown> }} row
 */
const isDiscoveryRow = (row) =>
  OUTCOME_EVENTS.has(row.event) && DISCOVERY_TOOLS.has(toolName(row));

/**
 * @param {{ event: string, properties: Record<string, unknown> }} row
 */
const isAuthRow = (row) =>
  OUTCOME_EVENTS.has(row.event) && toolName(row) === "System_ManageAuthorization";

/**
 * @param {{ event: string, properties: Record<string, unknown> }} row
 */
const isAppActionCalledRow = (row) =>
  row.event === "Plugin tool called" && APP_ACTION_TOOLS.has(toolName(row));

/**
 * @param {{ event: string, properties: Record<string, unknown> }} row
 */
const isAppActionFailedRow = (row) =>
  row.event === "Plugin tool failed" && APP_ACTION_TOOLS.has(toolName(row));

/**
 * @param {Set<string>} turnIds
 * @param {Map<string, { event: string, properties: Record<string, unknown> }[]>} byTurn
 */
const countTurnStages = (turnIds, byTurn) => {
  let gateway = 0;
  let authNeededTrue = 0;
  let authNeededFalse = 0;
  let appCalled = 0;
  let appFailed = 0;
  let attemptOutcomeUnknown = 0;
  let noCallObserved = 0;

  for (const turn of turnIds) {
    const rows = byTurn.get(turn) ?? [];
    const arcadeRows = rows.filter(isArcadeMcpRow);
    if (gatewayRow(rows)) gateway += 1;
    if (authRow(rows, true)) authNeededTrue += 1;
    if (authRow(rows, false)) authNeededFalse += 1;
    if (rows.some(isAppActionCalledRow)) appCalled += 1;
    if (rows.some(isAppActionFailedRow)) appFailed += 1;
    if (attemptWithoutOutcome(arcadeRows)) attemptOutcomeUnknown += 1;
    if (arcadeRows.length === 0) noCallObserved += 1;
  }

  return {
    gateway_discovery_or_selection: { count: gateway, denominator: "observed_relevant_turns" },
    authorization_check_auth_needed_true: { count: authNeededTrue, denominator: "observed_relevant_turns" },
    authorization_check_auth_needed_false: { count: authNeededFalse, denominator: "observed_relevant_turns" },
    app_action_called: { count: appCalled, denominator: "observed_relevant_turns" },
    app_action_failed: { count: appFailed, denominator: "observed_relevant_turns" },
    attempt_observed_outcome_unknown: { count: attemptOutcomeUnknown, denominator: "observed_relevant_turns" },
    no_call_observed: { count: noCallObserved, denominator: "observed_relevant_turns" },
  };
};

/** @param {{ event: string, properties: Record<string, unknown> }[]} rows */
const gatewayRow = (rows) =>
  rows.some(
    (row) =>
      (OUTCOME_EVENTS.has(row.event) || row.event === "Plugin tool failed") &&
      DISCOVERY_TOOLS.has(toolName(row)),
  );

/**
 * @param {{ event: string, properties: Record<string, unknown> }[]} rows
 * @param {boolean} needed
 */
const authRow = (rows, needed) =>
  rows.some(
    (row) => isAuthRow(row) && row.properties.auth_needed === needed,
  );

/** @param {{ event: string, properties: Record<string, unknown> }[]} arcadeRows */
const attemptWithoutOutcome = (arcadeRows) => {
  const hasAttempt = arcadeRows.some((row) => row.event === "Plugin tool attempted");
  const hasOutcome = arcadeRows.some((row) => OUTCOME_EVENTS.has(row.event));
  return hasAttempt && !hasOutcome;
};

/**
 * @param {{ event: string, properties: Record<string, unknown> }[]} rows
 * @param {string} eventName
 */
const builtinCounts = (rows, eventName) => {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const row of rows) {
    if (row.event !== eventName) continue;
    const tool = String(row.properties.tool ?? "unknown");
    if (!out[tool]) out[tool] = {};
    const cli = row.properties.cli;
    const key = typeof cli === "string" ? cli : "_";
    out[tool][key] = (out[tool][key] ?? 0) + 1;
  }
  return out;
};

/**
 * @param {{ event: string, properties: Record<string, unknown> }[]} rows
 */
const failureKindCounts = (rows) => {
  /** @type {Record<string, number>} */
  const out = {};
  for (const row of rows) {
    if (row.event !== "Plugin tool failed") continue;
    const kind = String(row.properties.failure_kind ?? "unknown");
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
};

/**
 * @param {{ event: string, properties: Record<string, unknown> }[]} rows
 */
const operatorStatusCounts = (rows) => {
  /** @type {Record<string, number>} */
  const out = {};
  for (const row of rows) {
    if (row.event !== "Plugin subagent stopped") continue;
    const status = String(row.properties.status ?? "unknown");
    out[status] = (out[status] ?? 0) + 1;
  }
  return out;
};

/**
 * @param {{ event: string, properties: Record<string, unknown> }[]} rows
 */
const buildClaudeGroup = (rows) => {
  const prompts = rows.filter((row) => row.event === "Plugin prompt submitted");
  const relevantTurns = new Set(
    prompts.map((row) => String(row.properties.turn ?? "")).filter(Boolean),
  );

  /** @type {Map<string, { event: string, properties: Record<string, unknown> }[]>} */
  const byTurn = new Map();
  for (const row of rows) {
    const turn = row.properties.turn;
    if (typeof turn !== "string" || !turn) continue;
    const list = byTurn.get(turn) ?? [];
    list.push(row);
    byTurn.set(turn, list);
  }

  const toolOnlyTurns = [...byTurn.keys()].filter(
    (turn) => !relevantTurns.has(turn) && (byTurn.get(turn) ?? []).some((row) => row.event !== "Plugin prompt submitted"),
  ).length;

  const stageTurns = relevantTurns;

  return {
    unit: "turn",
    denominators: { observed_relevant_turns: relevantTurns.size },
    tool_only_turns: toolOnlyTurns,
    stages: countTurnStages(stageTurns, byTurn),
    builtin_tools_called: builtinCounts(rows, "Plugin built-in tool called"),
    builtin_tools_failed: builtinCounts(rows, "Plugin built-in tool failed"),
    failure_kinds: failureKindCounts(rows),
    operator_stop_status: operatorStatusCounts(rows),
  };
};

/**
 * @param {{ event: string, properties: Record<string, unknown> }[]} rows
 */
const buildCopilotGroup = (rows) => {
  const prompts = rows.filter((row) => row.event === "Plugin prompt submitted");
  const promptSessions = new Set(prompts.map((row) => String(row.properties.session)));

  /** @type {Map<string, string>} */
  const childToParent = new Map();
  const linkedChildren = new Set();
  for (const row of rows) {
    if (row.event !== "Plugin subagent stopped") continue;
    const parent = String(row.properties.session);
    const child = row.properties.subagent_session;
    if (typeof child === "string" && child) {
      childToParent.set(child, parent);
      linkedChildren.add(child);
    }
  }

  const denominatorSessions = new Set(
    [...promptSessions].filter((session) => !linkedChildren.has(session)),
  );

  const multiPromptSessions = [...denominatorSessions].filter((session) => {
    const count = prompts.filter((row) => String(row.properties.session) === session).length;
    return count > 1;
  }).length;

  const parentSessionsWithStop = new Set(
    rows
      .filter((row) => row.event === "Plugin subagent stopped" && row.properties.subagent_session)
      .map((row) => String(row.properties.session)),
  );
  const parentAttributionUnknown = [...denominatorSessions].filter(
    (session) => !parentSessionsWithStop.has(session),
  ).length;

  /** @type {Map<string, { event: string, properties: Record<string, unknown> }[]>} */
  const bySession = new Map();
  /** @param {{ event: string, properties: Record<string, unknown> }} row */
  const attributeSession = (row) => {
    const session = String(row.properties.session);
    if (linkedChildren.has(session)) {
      const parent = childToParent.get(session);
      return parent ?? session;
    }
    return session;
  };

  for (const row of rows) {
    const session = attributeSession(row);
    const list = bySession.get(session) ?? [];
    list.push(row);
    bySession.set(session, list);
  }

  let gateway = 0;
  let authNeededTrue = 0;
  let authNeededFalse = 0;
  let appCalled = 0;
  let appFailed = 0;
  let noCallObserved = 0;

  for (const session of denominatorSessions) {
    const sessionRows = bySession.get(session) ?? [];
    const arcadeRows = sessionRows.filter(isArcadeMcpRow);
    if (gatewayRow(sessionRows)) gateway += 1;
    if (authRow(sessionRows, true)) authNeededTrue += 1;
    if (authRow(sessionRows, false)) authNeededFalse += 1;
    if (sessionRows.some(isAppActionCalledRow)) appCalled += 1;
    if (sessionRows.some(isAppActionFailedRow)) appFailed += 1;
    if (arcadeRows.length === 0) noCallObserved += 1;
  }

  return {
    unit: "session",
    denominators: { observed_relevant_sessions: denominatorSessions.size },
    operator_linked_sessions_excluded: linkedChildren.size,
    multi_prompt_sessions: multiPromptSessions,
    parent_attribution_unknown_sessions: parentAttributionUnknown,
    stages: {
      gateway_discovery_or_selection: { count: gateway, denominator: "observed_relevant_sessions" },
      authorization_check_auth_needed_true: { count: authNeededTrue, denominator: "observed_relevant_sessions" },
      authorization_check_auth_needed_false: { count: authNeededFalse, denominator: "observed_relevant_sessions" },
      app_action_called: { count: appCalled, denominator: "observed_relevant_sessions" },
      app_action_failed: { count: appFailed, denominator: "observed_relevant_sessions" },
      no_call_observed: { count: noCallObserved, denominator: "observed_relevant_sessions" },
    },
    failure_kinds: failureKindCounts(rows),
    operator_stop_status: operatorStatusCounts(rows),
  };
};

const REPORT_LIMITS = [
  "Counts describe plugin hook observations only, not task outcomes or whether Arcade was needed.",
  "Prompt events are limited to locally classified app-related work; unrelated prompts are absent.",
  "Claude Code turn counts and Copilot CLI session counts must not be combined into one rate.",
  "Copilot CLI does not emit tool-attempt events; attempt stages apply only to Claude Code.",
  "Multiple tool calls in one turn or session cannot be paired without a tool-call ID.",
  "The Arcade MCP gateway remains the canonical source for request, auth, discovery, and tool-call telemetry.",
];

/**
 * @param {unknown[]} events
 */
export const buildReport = (events) => {
  let invalid = 0;
  let legacy = 0;
  /** @type {Map<string, { event: string, properties: Record<string, unknown> }[]>} */
  const groups = new Map();

  for (const raw of events) {
    if (!raw || typeof raw !== "object") {
      invalid += 1;
      continue;
    }
    const row = /** @type {{ event: string, distinct_id: string, properties: Record<string, unknown> }} */ (raw);
    if (isLegacyRow(row)) {
      legacy += 1;
      continue;
    }
    if (!isValidRow(row)) {
      invalid += 1;
      continue;
    }
    const key = JSON.stringify(groupKey(row.properties));
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  /** @type {object[]} */
  const reportGroups = [];
  for (const [key, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const meta = groupKey(rows[0].properties);
    const body =
      meta.host === "claude-code"
        ? buildClaudeGroup(rows)
        : meta.host === "copilot-cli"
          ? buildCopilotGroup(rows)
          : { unit: "unknown", denominators: {}, stages: {} };
    reportGroups.push({ ...meta, ...body });
  }

  return {
    excluded: { invalid, legacy },
    groups: reportGroups,
    limits: REPORT_LIMITS,
  };
};

/**
 * @param {string} text
 * @returns {unknown[]}
 */
export const parseExportedEvents = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/telemetry-report.mjs <file.jsonl|file.json>");
    process.exit(1);
  }
  const report = buildReport(parseExportedEvents(readFileSync(file, "utf8")));
  console.log(JSON.stringify(report, null, 2));
}
