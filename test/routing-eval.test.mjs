import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { evaluateRouting } from "../scripts/routing-eval.mjs";

const dataset = JSON.parse(readFileSync(new URL("./fixtures/routing-evaluation.json", import.meta.url), "utf8"));
const observation = (caseId, overrides = {}) => ({
  caseId,
  client: "claude-code",
  recordedAt: "2026-09-29T12:00:00Z",
  evidence: "test-only-scripted-observation",
  selection: "arcade_plugin",
  attempt: "attempted",
  toolResult: "completed",
  blocker: "none",
  taskOutcome: "unknown",
  ...overrides,
});
const evaluateRecords = (records) => evaluateRouting(dataset, { datasetVersion: dataset.version, records });

test("the default report contains no invented client results", () => {
  const report = evaluateRouting(dataset);
  assert.equal(report.labelsApprovedForPMReporting, false);
  assert.equal(report.observationSource, "no-client-observations");
  for (const client of Object.values(report.clients)) {
    assert.equal(client.observedCases, 0);
    assert.equal(client.unobservedCases, dataset.cases.length);
    assert.deepEqual(client.taskSucceeded, { numerator: 0, denominator: 0, fraction: null });
    assert.equal(client.arcadeAttempted.fraction, null);
  }
});

test("the independent labels include context-dependent confirmations and local app code", () => {
  const report = evaluateRouting(dataset);
  const email = report.cases.find((row) => row.id === "email-confirmation");
  assert.equal(email.arcadeAppropriate, true);
  assert.equal(email.hasPriorTurns, true);
  assert.equal(email.lexicalPositive, false);
  const code = report.cases.find((row) => row.id === "slack-local-code");
  assert.equal(code.arcadeAppropriate, false);
  assert.equal(code.lexicalPositive, true);
});

test("tool completion, alternate connections and known task outcomes stay separate", () => {
  const report = evaluateRecords([
    observation("inbox-triage"),
    observation("alternate-arcade-connection", { selection: "arcade_connection", taskOutcome: "succeeded", taskOutcomeEvidence: "test-only-verification-of-requested-result" }),
    observation("auth-blocker", { toolResult: "failed", blocker: "auth" }),
    observation("setup-blocker", { selection: "none", attempt: "not_attempted", toolResult: "not_attempted", blocker: "setup" }),
  ]);
  const client = report.clients["claude-code"];
  assert.equal(client.arcadeAttempted.numerator, 3);
  assert.equal(client.arcadeAttempted.denominator, 4);
  assert.equal(client.toolCompleted.numerator, 2);
  assert.equal(client.toolCompleted.denominator, 3);
  assert.deepEqual(client.taskSucceeded, { numerator: 1, denominator: 1, fraction: 1 });
  assert.equal(client.unknownTaskOutcomes, 3);
  assert.equal(client.otherArcadeSelections, 1);
  assert.equal(client.blockers.auth, 1);
  assert.equal(client.blockers.setup, 1);
  assert.equal(report.clients["copilot-cli"].observedCases, 0);
});

test("missing observations and missing attempt results do not become routing misses or failures", () => {
  const report = evaluateRecords([
    observation("calendar-availability", { toolResult: "unknown" }),
    observation("chat-followup", { selection: "unknown", attempt: "unknown", toolResult: "unknown", blocker: "unknown" }),
    observation("slack-local-code"),
  ]);
  const client = report.clients["claude-code"];
  assert.equal(client.unobservedCases, dataset.cases.length - 3);
  assert.equal(client.arcadeAttempted.denominator, 1);
  assert.equal(client.unknownSelections, 1);
  assert.equal(client.unknownAttemptStatus, 1);
  assert.equal(client.attemptsWithoutToolResult, 1);
  assert.equal(client.inappropriateArcadeAttempts, 1);
});

test("invalid imported records fail instead of silently changing denominators", () => {
  assert.throws(() => evaluateRecords([observation("unknown-case")]), /Unknown case/);
  assert.throws(() => evaluateRecords([observation("inbox-triage"), observation("inbox-triage")]), /Duplicate observation/);
  assert.throws(() => evaluateRecords([observation("inbox-triage", { taskOutcome: "succeeded" })]), /independent outcome evidence/);
  assert.throws(() => evaluateRecords([observation("inbox-triage", { attempt: "unknown" })]), /observed attempt/);
  assert.throws(() => evaluateRecords([observation("inbox-triage", { evidence: "" })]), /evidence reference/);
  assert.throws(() => evaluateRouting(dataset, { datasetVersion: 2, records: [] }), /matching datasetVersion/);
});
