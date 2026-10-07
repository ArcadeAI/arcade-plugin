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
import { ROOT } from "./helpers.mjs";

test("buildTelemetryTables lists every contract event and common property", () => {
  const tables = buildTelemetryTables();
  assert.match(tables, /Plugin prompt submitted/);
  assert.match(tables, /telemetry_version/);
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
