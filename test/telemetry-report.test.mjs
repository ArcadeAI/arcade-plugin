// @ts-check

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { TELEMETRY_HOSTS } from "../hooks/telemetry-contract.mjs";
import { loadTelemetryAdapter } from "../hooks/telemetry-adapter.mjs";
import { buildReport, parseExportedEvents } from "../scripts/telemetry-report.mjs";
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

test("report keys avoid forbidden metric names and hosts stay separate", () => {
  const { events } = loadFixture();
  const report = buildReport(events);
  for (const key of collectKeys(report)) {
    assert.doesNotMatch(key, FORBIDDEN_KEY, key);
  }
  const hosts = report.groups.map((group) => group.host);
  assert.deepEqual(new Set(hosts), new Set(hosts));
  for (const group of report.groups) {
    if (group.host === "copilot-cli") {
      assert.equal(group.stages.attempt_observed_outcome_unknown, undefined);
    }
    if (group.host === "claude-code") {
      assert.ok(group.stages.attempt_observed_outcome_unknown);
    }
  }
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

const claudeArcadePrefix = () => {
  const plugin = JSON.parse(readFileSync(path.join(ROOT, "plugin.json"), "utf8"));
  const [server] = Object.keys(JSON.parse(readFileSync(path.join(ROOT, "mcp.json"), "utf8")).mcpServers);
  return `mcp__plugin_${plugin.name}_${server}__`;
};

const COPILOT_SESSION = "dd3beb80-4471-4513-99a4-a57d3d7c08df";
const COPILOT_SUBAGENT = "57946be7-1a73-40ca-a042-abb0f68d9445";
const COPILOT_OPERATOR = "arcade:arcade-operator";

/** @param {import("../hooks/telemetry-adapter.mjs").TelemetryAdapter} adapter */
const runClaudeCrossCheck = async (adapter) => {
  const dataDir = tempDataDir();
  const prefix = claudeArcadePrefix();
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
  await cap({ hook_event_name: "PostToolUse", tool_name: `${prefix}Arcade_SelectTools`, prompt_id: p1 });
  await cap({
    hook_event_name: "PostToolUse",
    tool_name: `${prefix}System_ManageAuthorization`,
    tool_response: authStatusResponse(["authorized"]),
    prompt_id: p1,
  });
  await cap({
    hook_event_name: "PostToolUse",
    tool_name: `${prefix}Arcade_UseTool`,
    tool_input: { tool_name: "Gmail.ListEmails" },
    prompt_id: p1,
  });
  await cap({
    hook_event_name: "PostToolUseFailure",
    tool_name: `${prefix}Slack_SendMessage`,
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
    tool_name: `${prefix}Arcade_UseTool`,
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
  test(`adapter cross-check buildReport counts for ${host}`, async (t) => {
    const adapterPath = path.join(ROOT, "hooks/telemetry-adapters", `${host}.mjs`);
    if (!existsSync(adapterPath)) {
      t.skip(`${host} adapter not in this branch`);
      return;
    }
    const adapter = await loadTelemetryAdapter(host);
    const events = host === "claude-code" ? await runClaudeCrossCheck(adapter) : await runCopilotCrossCheck(adapter);
    for (const event of events) assertMatchesContract(event);
    const report = buildReport(events);
    assert.deepEqual(report.excluded, { invalid: 0, legacy: 0 });
    assert.equal(report.groups.length, 1);
    const group = report.groups[0];
    assert.equal(group.host, host);
    if (host === "claude-code") claudeCrossCheckExpectation(group);
    else copilotCrossCheckExpectation(group);
  });
}
