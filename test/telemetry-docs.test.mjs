// @ts-check

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  buildTelemetryTables,
  fillTelemetryTables,
  TELEMETRY_BLOCK_BEGIN,
  TELEMETRY_BLOCK_END,
} from "../scripts/telemetry-docs.mjs";
import { COMMON_PROPERTIES, EVENTS } from "../hooks/telemetry-contract.mjs";
import { ROOT } from "./helpers.mjs";

test("buildTelemetryTables lists every contract event and common property", () => {
  const tables = buildTelemetryTables();
  for (const eventName of Object.keys(EVENTS)) {
    assert.ok(tables.includes(eventName), `tables must include event "${eventName}"`);
  }
  for (const propName of Object.keys(COMMON_PROPERTIES)) {
    assert.ok(tables.includes(propName), `tables must include common property "${propName}"`);
  }
  assert.match(tables, /Service categories:/);
});

test("fillTelemetryTables replaces only the generated block", () => {
  const docPath = path.join(ROOT, "docs/telemetry.md");
  const source = readFileSync(docPath, "utf8");
  const filled = fillTelemetryTables(source);
  assert.ok(filled.includes(TELEMETRY_BLOCK_BEGIN));
  assert.ok(filled.includes(TELEMETRY_BLOCK_END));
  assert.ok(filled.includes(buildTelemetryTables().split("\n")[0]));
});
