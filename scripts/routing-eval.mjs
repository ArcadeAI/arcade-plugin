import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { classifyPrompt } from "../hooks/telemetry-classify.mjs";

const DEFAULT_DATASET = new URL("../test/fixtures/routing-evaluation.json", import.meta.url);
const ARCADE_SELECTIONS = ["arcade_plugin", "arcade_connection"];
const rate = (numerator, denominator) => ({
  numerator,
  denominator,
  fraction: denominator === 0 ? null : numerator / denominator,
});

function requireValue(value, allowed, field) {
  if (!allowed.includes(value)) throw new Error(`Invalid ${field}: ${value}`);
}

export function validateDataset(dataset) {
  if (dataset.version !== 1 || dataset.labelStatus !== "agent-authored-awaiting-human-review") {
    throw new Error("Unsupported dataset version or label status");
  }
  if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) throw new Error("Dataset needs cases");
  const ids = new Set();
  for (const row of dataset.cases) {
    if (typeof row.id !== "string" || !row.id || ids.has(row.id)) throw new Error("Case IDs must be unique strings");
    ids.add(row.id);
    if (!Array.isArray(row.turns) || row.turns.length === 0 || row.turns.some((turn) => typeof turn !== "string" || !turn.trim())) {
      throw new Error(`Case ${row.id} needs nonempty prompt turns`);
    }
    if (typeof row.arcadeAppropriate !== "boolean" || typeof row.reason !== "string" || !row.reason.trim()) {
      throw new Error(`Case ${row.id} needs a relevance label and reason`);
    }
  }
}

export function validateObservations(dataset, observations) {
  if (observations.datasetVersion !== dataset.version || !Array.isArray(observations.records)) {
    throw new Error("Observations need the matching datasetVersion and records array");
  }
  const ids = new Set(dataset.cases.map((row) => row.id));
  const seen = new Set();
  for (const row of observations.records) {
    if (!ids.has(row.caseId)) throw new Error(`Unknown case: ${row.caseId}`);
    requireValue(row.client, ["claude-code", "copilot-cli"], "client");
    const key = `${row.client}:${row.caseId}`;
    if (seen.has(key)) throw new Error(`Duplicate observation: ${key}`);
    seen.add(key);
    if (typeof row.recordedAt !== "string" || !Number.isFinite(Date.parse(row.recordedAt))) throw new Error(`Invalid recordedAt: ${key}`);
    if (typeof row.evidence !== "string" || !row.evidence.trim()) throw new Error(`Missing local evidence reference: ${key}`);
    requireValue(row.selection, [...ARCADE_SELECTIONS, "other", "none", "unknown"], "selection");
    requireValue(row.attempt, ["attempted", "not_attempted", "unknown"], "attempt");
    requireValue(row.toolResult, ["completed", "failed", "not_attempted", "unknown"], "toolResult");
    requireValue(row.blocker, ["none", "auth", "setup", "other", "unknown"], "blocker");
    requireValue(row.taskOutcome, ["succeeded", "failed", "unknown"], "taskOutcome");
    if (row.attempt === "attempted" && !ARCADE_SELECTIONS.includes(row.selection)) {
      throw new Error(`An Arcade attempt needs an Arcade selection: ${key}`);
    }
    if (["completed", "failed"].includes(row.toolResult) && row.attempt !== "attempted") {
      throw new Error(`A tool result needs an observed attempt: ${key}`);
    }
    if (row.toolResult === "not_attempted" && row.attempt !== "not_attempted") {
      throw new Error(`not_attempted result needs a matching attempt: ${key}`);
    }
    if (row.taskOutcome !== "unknown" && (typeof row.taskOutcomeEvidence !== "string" || !row.taskOutcomeEvidence.trim())) {
      throw new Error(`Known task outcomes need independent outcome evidence: ${key}`);
    }
  }
}

function summarizeClient(cases, records) {
  const labels = new Map(cases.map((row) => [row.id, row.arcadeAppropriate]));
  const appropriate = records.filter((row) => labels.get(row.caseId));
  const selectionKnown = appropriate.filter((row) => row.selection !== "unknown");
  const attemptKnown = appropriate.filter((row) => row.attempt !== "unknown");
  const attempts = records.filter((row) => row.attempt === "attempted");
  const resultsKnown = attempts.filter((row) => ["completed", "failed"].includes(row.toolResult));
  const outcomesKnown = appropriate.filter((row) => row.taskOutcome !== "unknown");
  return {
    observedCases: records.length,
    unobservedCases: cases.length - records.length,
    appropriateObservedCases: appropriate.length,
    unknownSelections: appropriate.length - selectionKnown.length,
    unknownAttemptStatus: appropriate.length - attemptKnown.length,
    arcadeSelected: rate(selectionKnown.filter((row) => ARCADE_SELECTIONS.includes(row.selection)).length, selectionKnown.length),
    arcadeAttempted: rate(attemptKnown.filter((row) => row.attempt === "attempted").length, attemptKnown.length),
    toolCompleted: rate(resultsKnown.filter((row) => row.toolResult === "completed").length, resultsKnown.length),
    taskSucceeded: rate(outcomesKnown.filter((row) => row.taskOutcome === "succeeded").length, outcomesKnown.length),
    unknownTaskOutcomes: appropriate.filter((row) => row.taskOutcome === "unknown").length,
    attemptsWithoutToolResult: attempts.length - resultsKnown.length,
    inappropriateArcadeAttempts: records.filter((row) => !labels.get(row.caseId) && row.attempt === "attempted").length,
    pluginSelections: records.filter((row) => row.selection === "arcade_plugin").length,
    otherArcadeSelections: records.filter((row) => row.selection === "arcade_connection").length,
    blockers: Object.fromEntries(["none", "auth", "setup", "other", "unknown"].map((blocker) => [blocker, records.filter((row) => row.blocker === blocker).length])),
  };
}

export function evaluateRouting(dataset, observations = { datasetVersion: dataset.version, records: [] }) {
  validateDataset(dataset);
  validateObservations(dataset, observations);
  const cases = dataset.cases.map((row) => ({
    id: row.id,
    arcadeAppropriate: row.arcadeAppropriate,
    lexicalPositive: classifyPrompt(row.turns.at(-1)).couldUseArcade,
    hasPriorTurns: row.turns.length > 1,
  }));
  const positives = cases.filter((row) => row.arcadeAppropriate);
  const negatives = cases.filter((row) => !row.arcadeAppropriate);
  return {
    datasetVersion: dataset.version,
    labelStatus: dataset.labelStatus,
    labelsApprovedForPMReporting: false,
    observationSource: observations.records.length ? "imported-local-records-evidence-not-verified" : "no-client-observations",
    units: { lexicalBaseline: "final prompt per case, without prior-turn context", routing: "controlled case per client" },
    dataset: { total: cases.length, arcadeAppropriate: positives.length, arcadeInappropriate: negatives.length, multiTurn: cases.filter((row) => row.hasPriorTurns).length },
    lexicalBaseline: {
      truePositives: positives.filter((row) => row.lexicalPositive).length,
      falseNegatives: positives.filter((row) => !row.lexicalPositive).length,
      trueNegatives: negatives.filter((row) => !row.lexicalPositive).length,
      falsePositives: negatives.filter((row) => row.lexicalPositive).length,
      recall: rate(positives.filter((row) => row.lexicalPositive).length, positives.length),
      falsePositiveRate: rate(negatives.filter((row) => row.lexicalPositive).length, negatives.length),
    },
    clients: Object.fromEntries(["claude-code", "copilot-cli"].map((client) => [client, summarizeClient(cases, observations.records.filter((row) => row.client === client))])),
    cases,
  };
}

function main(args) {
  let observationsPath;
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--observations" || !args[index + 1] || observationsPath) {
      throw new Error("Usage: npm run eval:routing -- [--observations /local/observations.json]");
    }
    observationsPath = args[++index];
  }
  const dataset = JSON.parse(readFileSync(DEFAULT_DATASET, "utf8"));
  const observations = observationsPath ? JSON.parse(readFileSync(observationsPath, "utf8")) : undefined;
  console.log(JSON.stringify(evaluateRouting(dataset, observations), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
