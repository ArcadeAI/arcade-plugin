// @ts-check

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { TELEMETRY_HOSTS } from "../hooks/telemetry-contract.mjs";
import { loadTelemetryAdapter } from "../hooks/telemetry-adapter.mjs";
import { ARCADE_TOOL_PREFIX } from "../hooks/telemetry-adapters/claude-code.mjs";
import { buildReport, normalizeExportRow, parseExportedEvents } from "../scripts/telemetry-report.mjs";
import { assertMatchesContract, captureTelemetry, hookInput, tempDataDir } from "./telemetry-helpers.mjs";
import { ROOT } from "./helpers.mjs";

const FIXTURE_DIR = path.join(ROOT, "test/fixtures/telemetry-report");
const FORBIDDEN_KEY = /recall|precision|success.?rate|task.?success|routing.?miss|matched.?attempt/i;

const loadFixture = () => {
  const events = parseExportedEvents(readFileSync(path.join(FIXTURE_DIR, "events.jsonl"), "utf8"));
  for (const event of events) {
    if (event.event?.startsWith("Plugin") && event.properties?.telemetry_version === 2) {
      assertMatchesContract(event);
    }
  }
  const expected = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "expected-report.json"), "utf8"));
  return { events, expected };
};

/** @param {unknown} value @param {string[]} keys */
const collectKeys = (value, keys = []) => {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const item of value) collectKeys(item, keys);
    } else {
      for (const [key, child] of Object.entries(value)) {
        keys.push(key);
        collectKeys(child, keys);
      }
    }
  }
  return keys;
};

test("buildReport matches the telemetry-report fixture", () => {
  const { events, expected } = loadFixture();
  assert.deepEqual(buildReport(events), expected);
});

test("buildReport strips PostHog export fields before validating", () => {
  const { events, expected } = loadFixture();
  const noisy = events.map((row) => {
    if (!row || typeof row !== "object" || !row.properties) return row;
    return {
      ...row,
      timestamp: "2026-01-01T00:00:00.000Z",
      uuid: "550e8400-e29b-41d4-a716-446655440000",
      properties: {
        ...row.properties,
        $lib: "posthog-node",
        $lib_version: "5.0.0",
      },
    };
  });
  for (const row of noisy) {
    if (row?.event?.startsWith("Plugin")) {
      const trimmed = normalizeExportRow(row);
      assert.ok(trimmed);
      assert.equal(trimmed.properties.$lib, undefined);
    }
  }
  assert.deepEqual(buildReport(noisy), expected);
});

test("buildReport rejects leaked hook fields in export properties", () => {
  const { events } = loadFixture();
  const sample = events.find(
    (row) => row.event === "Plugin prompt submitted" && row.properties?.telemetry_version === 2,
  );
  assert.ok(sample);
  const withPrompt = { ...sample, properties: { ...sample.properties, prompt: "secret text" } };
  const withCwd = { ...sample, properties: { ...sample.properties, cwd: "/Users/secret" } };
  assert.equal(buildReport([withPrompt]).excluded.invalid, 1);
  assert.equal(buildReport([withCwd]).excluded.invalid, 1);
});

test("CLI prints the same JSON as buildReport", () => {
  const { events, expected } = loadFixture();
  const file = path.join(FIXTURE_DIR, "events.jsonl");
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/telemetry-report.mjs"), file], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), expected);
  assert.deepEqual(buildReport(events).excluded, { invalid: 1, legacy: 1 });
});

const claudeRow = (event, extra) => ({
  event,
  distinct_id: "aaaaaaaaaaaaaaaa",
  properties: {
    session: "aaaaaaaaaaaaaaaa",
    turn: "1111111111111111",
    host: "claude-code",
    plugin_version: "0.2.0",
    telemetry_version: 2,
    os: "linux",
    arcade_used_before: false,
    $process_person_profile: false,
    $geoip_disable: true,
    $ip: "0.0.0.0",
    ...extra,
  },
});

const unknownOutcomeCount = (rows) => {
  for (const row of rows) assertMatchesContract(row);
  const report = buildReport(rows);
  assert.deepEqual(report.excluded, { invalid: 0, legacy: 0 });
  return report.groups[0].stages.attempt_observed_outcome_unknown.count;
};

test("an outcome on one Arcade server category does not settle an attempt on the other", () => {
  const prompt = claudeRow("Plugin prompt submitted", { could_use_arcade: true, service_hints: ["email"], reminder_sent: false });
  const attempt = (server) => claudeRow("Plugin tool attempted", { server, tool: "Arcade_UseTool" });
  const called = (server) => claudeRow("Plugin tool called", { server, tool: "Arcade_SelectTools" });
  const failed = (server) => claudeRow("Plugin tool failed", { server, tool: "Arcade_UseTool", failure_kind: "timeout" });

  assert.equal(unknownOutcomeCount([prompt, attempt("arcade"), called("other_arcade")]), 1);
  assert.equal(unknownOutcomeCount([prompt, attempt("other_arcade"), failed("arcade")]), 1);
  assert.equal(unknownOutcomeCount([prompt, attempt("arcade"), called("arcade")]), 0);
  assert.equal(unknownOutcomeCount([prompt, attempt("other_arcade"), failed("other_arcade")]), 0);
  assert.equal(unknownOutcomeCount([prompt, attempt("arcade"), attempt("other_arcade"), called("arcade")]), 1);
  // Order within the turn does not matter: an earlier outcome still settles its category.
  assert.equal(unknownOutcomeCount([prompt, called("arcade"), attempt("arcade")]), 0);
  assert.equal(unknownOutcomeCount([prompt, failed("other_arcade"), attempt("other_arcade")]), 0);
  assert.equal(unknownOutcomeCount([prompt, called("other_arcade"), attempt("arcade")]), 1);
  // Turn-level only: one outcome on a category settles every attempt on that category.
  assert.equal(unknownOutcomeCount([prompt, attempt("arcade"), attempt("arcade"), called("arcade")]), 0);
});

const copilotRow = (event, session, extra) => ({
  event,
  distinct_id: session,
  properties: {
    session,
    host: "copilot-cli",
    plugin_version: "0.2.0",
    telemetry_version: 2,
    os: "linux",
    arcade_used_before: false,
    $process_person_profile: false,
    $geoip_disable: true,
    $ip: "0.0.0.0",
    ...extra,
  },
});

test("operator_linked_sessions_excluded counts prompt sessions removed from the denominator", () => {
  const parent = "bbbbbbbbbbbbbbbb";
  const child = "cccccccccccccccc";
  const prompt = (session) =>
    copilotRow("Plugin prompt submitted", session, {
      could_use_arcade: true,
      service_hints: [],
      reminder_sent: false,
    });
  const stop = copilotRow("Plugin subagent stopped", parent, {
    agent: "arcade-operator",
    status: "needs_auth",
    subagent_session: child,
  });

  for (const row of [prompt(parent), prompt(child), stop]) assertMatchesContract(row);

  const orphanStop = buildReport([prompt(parent), stop]);
  assert.equal(orphanStop.groups[0].operator_linked_sessions_excluded, 0);
  assert.deepEqual(orphanStop.groups[0].denominators, { observed_relevant_sessions: 1 });

  const linked = buildReport([prompt(parent), prompt(child), stop]);
  assert.equal(linked.groups[0].operator_linked_sessions_excluded, 1);
  assert.deepEqual(linked.groups[0].denominators, { observed_relevant_sessions: 1 });
});

test("report limits state that other_arcade pools connections and calls are not paired", () => {
  const limits = buildReport([]).limits.join("\n");
  assert.match(limits, /other_arcade.*pools/i);
  assert.match(limits, /cannot be paired/i);
});

test("CLI rejects malformed JSON without echoing the input", (t) => {
  const marker = "SYNTHETIC-PRIVATE-MARKER-7f3a";
  const dir = tempDataDir();
  const valid = readFileSync(path.join(FIXTURE_DIR, "events.jsonl"), "utf8").split("\n")[0];
  const inputs = {
    "lines.jsonl": `${valid}\n{"event":"Plugin prompt submitted","properties":{"prompt":"${marker}"\n`,
    "array.json": `[{"event":"${marker}",}]`,
    "bare.jsonl": `${marker} not json`,
  };
  for (const [name, contents] of Object.entries(inputs)) {
    const file = path.join(dir, name);
    writeFileSync(file, contents);
    const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/telemetry-report.mjs"), file], {
      encoding: "utf8",
    });
    t.diagnostic(`${name}: ${result.stderr.trim()}`);
    assert.notEqual(result.status, 0, name);
    assert.equal(result.stdout, "", name);
    assert.match(result.stderr, /^telemetry-report: /, name);
    for (const stream of [result.stdout, result.stderr]) {
      assert.equal(stream.includes(marker), false, `${name}: ${stream}`);
      assert.equal(stream.includes("Plugin prompt submitted"), false, `${name}: ${stream}`);
    }
  }
});

test("empty input produces a report with no groups", () => {
  assert.deepEqual(parseExportedEvents(""), []);
  assert.deepEqual(parseExportedEvents(" \n\n"), []);
  const report = buildReport([]);
  assert.deepEqual(report.excluded, { invalid: 0, legacy: 0 });
  assert.deepEqual(report.groups, []);
  assert.ok(report.limits.length > 0);

  const file = path.join(tempDataDir(), "empty.jsonl");
  writeFileSync(file, "");
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/telemetry-report.mjs"), file], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), report);
});

test("report keys avoid forbidden metric names and hosts stay separate", () => {
  const { events, expected } = loadFixture();
  const report = buildReport(events);
  for (const key of collectKeys(report)) {
    assert.doesNotMatch(key, FORBIDDEN_KEY, key);
  }
  assert.deepEqual(
    report.groups.map((group) => group.host),
    ["claude-code", "copilot-cli"],
  );
  const byHost = Object.fromEntries(report.groups.map((group) => [group.host, group]));
  const expectedByHost = Object.fromEntries(expected.groups.map((group) => [group.host, group]));
  assert.equal(byHost["claude-code"].unit, "turn");
  assert.equal(byHost["copilot-cli"].unit, "session");
  assert.deepEqual(byHost["claude-code"].stages, expectedByHost["claude-code"].stages);
  assert.deepEqual(byHost["copilot-cli"].stages, expectedByHost["copilot-cli"].stages);
  assert.equal(byHost["copilot-cli"].stages.attempt_observed_outcome_unknown, undefined);
  assert.ok(byHost["claude-code"].stages.attempt_observed_outcome_unknown);
  assert.notDeepEqual(byHost["claude-code"].stages, byHost["copilot-cli"].stages);
});

const authStatusResponse = (statuses) => [
  {
    type: "text",
    text: JSON.stringify({
      message: statuses.includes("authorization_required") ? "Not yet authorized." : "All authorized.",
      providers: statuses.map((status, index) => ({ provider: `provider${index}`, status })),
    }),
  },
];

const COPILOT_SESSION = "dd3beb80-4471-4513-99a4-a57d3d7c08df";
const COPILOT_SUBAGENT = "57946be7-1a73-40ca-a042-abb0f68d9445";
const COPILOT_OPERATOR = "arcade:arcade-operator";

/** @param {import("../hooks/telemetry-adapter.mjs").TelemetryAdapter} adapter */
const runClaudeCrossCheck = async (adapter) => {
  const dataDir = tempDataDir();
  const session = "cross-check-claude-session";
  /** @type {object[]} */
  const events = [];
  const cap = async (fields, argv = []) => {
    const { sent } = await captureTelemetry({
      adapter,
      dataDir,
      input: hookInput({ session_id: session, ...fields }),
      argv,
    });
    events.push(...sent);
  };
  const p1 = "turn-one-11111111";
  const p2 = "turn-two-22222222";
  const p3 = "turn-three-33333333";
  const p4 = "turn-four-44444444";
  await cap({ hook_event_name: "UserPromptSubmit", prompt: "What is on my calendar tomorrow?", prompt_id: p1 });
  await cap({ hook_event_name: "PostToolUse", tool_name: `${ARCADE_TOOL_PREFIX}Arcade_SelectTools`, prompt_id: p1 });
  await cap({
    hook_event_name: "PostToolUse",
    tool_name: `${ARCADE_TOOL_PREFIX}System_ManageAuthorization`,
    tool_response: authStatusResponse(["authorized"]),
    prompt_id: p1,
  });
  await cap({
    hook_event_name: "PostToolUse",
    tool_name: `${ARCADE_TOOL_PREFIX}Arcade_UseTool`,
    tool_input: { tool_name: "Gmail.ListEmails" },
    prompt_id: p1,
  });
  await cap({
    hook_event_name: "PostToolUseFailure",
    tool_name: `${ARCADE_TOOL_PREFIX}Slack_SendMessage`,
    error: "rate limited",
    prompt_id: p1,
  });
  await cap({ hook_event_name: "UserPromptSubmit", prompt: "Fix the parser in src/main.ts", prompt_id: p2 });
  await cap({
    hook_event_name: "PostToolUse",
    tool_name: "mcp__granola__Granola_ListMeetings",
    prompt_id: p2,
  });
  await cap({ hook_event_name: "UserPromptSubmit", prompt: "What is on my calendar tomorrow?", prompt_id: p3 });
  await cap({
    hook_event_name: "PreToolUse",
    tool_name: `${ARCADE_TOOL_PREFIX}Arcade_UseTool`,
    tool_input: { tool_name: "Gmail.ListEmails" },
    prompt_id: p3,
  });
  await cap({ hook_event_name: "UserPromptSubmit", prompt: "Summarize unread email from this week", prompt_id: p4 });
  return events;
};

/** @param {import("../hooks/telemetry-adapter.mjs").TelemetryAdapter} adapter */
const runCopilotCrossCheck = async (adapter) => {
  const dataDir = tempDataDir();
  /** @type {object[]} */
  const events = [];
  const cap = async (fields) => {
    const { sent } = await captureTelemetry({ adapter, dataDir, input: fields });
    events.push(...sent);
  };
  const parent = (fields) => ({
    session_id: COPILOT_SESSION,
    timestamp: "2026-09-24T21:27:02.743Z",
    cwd: "/Users/someone/private-repo",
    ...fields,
  });
  const child = (fields) => parent({ session_id: COPILOT_SUBAGENT, ...fields });
  await cap(parent({ hook_event_name: "UserPromptSubmit", prompt: "What is on my calendar tomorrow?" }));
  await cap(parent({ hook_event_name: "PostToolUse", tool_name: "arcade-Arcade_SelectTools", tool_input: {}, tool_result: { result_type: "success", text_result_for_llm: "[]" } }));
  await cap(parent({
    hook_event_name: "PostToolUse",
    tool_name: "arcade-System_ManageAuthorization",
    tool_input: {},
    tool_result: { result_type: "success", text_result_for_llm: '{"providers":[{"status":"authorized"}]}' },
  }));
  await cap(parent({
    hook_event_name: "PostToolUse",
    tool_name: "arcade-Arcade_UseTool",
    tool_input: { tool_name: "Gmail.ListEmails" },
    tool_result: { result_type: "success", text_result_for_llm: "ok" },
  }));
  await cap(parent({
    hook_event_name: "PostToolUseFailure",
    tool_name: "arcade-Slack_SendMessage",
    tool_input: {},
    error: "MCP server 'arcade': Something went wrong in the upstream service",
  }));
  await cap(parent({ hook_event_name: "UserPromptSubmit", prompt: "Fix the parser in src/main.ts" }));
  await cap(parent({
    hook_event_name: "PostToolUse",
    tool_name: "granola-Granola_ListMeetings",
    tool_input: {},
    tool_result: { result_type: "success", text_result_for_llm: "[]" },
  }));
  await cap(parent({
    hook_event_name: "SubagentStop",
    agent_type: COPILOT_OPERATOR,
    agent_id: COPILOT_SUBAGENT,
    last_assistant_message: "status: needs_auth\nsummary: sign in",
  }));
  await cap(child({ hook_event_name: "UserPromptSubmit", prompt: "What is on my calendar tomorrow?" }));
  return events;
};

/** @param {object} group */
const claudeCrossCheckExpectation = (group) => {
  assert.equal(group.unit, "turn");
  assert.deepEqual(group.denominators, { observed_relevant_turns: 3 });
  assert.equal(group.tool_only_turns, 0);
  assert.deepEqual(group.stages, {
    gateway_discovery_or_selection: { count: 1, denominator: "observed_relevant_turns" },
    authorization_check_auth_needed_true: { count: 0, denominator: "observed_relevant_turns" },
    authorization_check_auth_needed_false: { count: 1, denominator: "observed_relevant_turns" },
    app_action_called: { count: 1, denominator: "observed_relevant_turns" },
    app_action_failed: { count: 1, denominator: "observed_relevant_turns" },
    attempt_observed_outcome_unknown: { count: 1, denominator: "observed_relevant_turns" },
    no_call_observed: { count: 1, denominator: "observed_relevant_turns" },
  });
};

/** @param {object} group */
const copilotCrossCheckExpectation = (group) => {
  assert.equal(group.unit, "session");
  assert.deepEqual(group.denominators, { observed_relevant_sessions: 1 });
  assert.equal(group.operator_linked_sessions_excluded, 1);
  assert.equal(group.multi_prompt_sessions, 0);
  assert.equal(group.parent_attribution_unknown_sessions, 0);
  assert.deepEqual(group.stages, {
    gateway_discovery_or_selection: { count: 1, denominator: "observed_relevant_sessions" },
    authorization_check_auth_needed_true: { count: 0, denominator: "observed_relevant_sessions" },
    authorization_check_auth_needed_false: { count: 1, denominator: "observed_relevant_sessions" },
    app_action_called: { count: 1, denominator: "observed_relevant_sessions" },
    app_action_failed: { count: 1, denominator: "observed_relevant_sessions" },
    no_call_observed: { count: 0, denominator: "observed_relevant_sessions" },
  });
  assert.equal(group.stages.attempt_observed_outcome_unknown, undefined);
  assert.deepEqual(group.operator_stop_status, { needs_auth: 1 });
};

for (const host of TELEMETRY_HOSTS) {
  test(`adapter cross-check buildReport counts for ${host}`, async () => {
    const adapter = await loadTelemetryAdapter(host);
    const events = host === "claude-code" ? await runClaudeCrossCheck(adapter) : await runCopilotCrossCheck(adapter);
    for (const event of events) assertMatchesContract(event);
    const report = buildReport(events);
    assert.deepEqual(report.excluded, { invalid: 0, legacy: 0 });
    assert.equal(report.groups.length, 1);
    const group = report.groups[0];
    assert.equal(group.host, host);
    if (host === "claude-code") claudeCrossCheckExpectation(group);
    else if (host === "copilot-cli") copilotCrossCheckExpectation(group);
    else assert.fail(`no cross-check for ${host}`);
  });
}
