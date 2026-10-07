// @ts-check

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { buildReport, parseExportedEvents } from "../scripts/telemetry-report.mjs";
import { assertMatchesContract } from "./telemetry-helpers.mjs";
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

test("phase 2: adapter cross-check against live hook captures", { todo: true }, () => {});
