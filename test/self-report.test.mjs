import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resetInstallIdCache } from "../hooks/install-id.mjs";
import {
  isSelfReportEnabled,
  recordSelfReport,
} from "../hooks/self-report.mjs";

test("isSelfReportEnabled defaults on and respects opt-out", () => {
  const previous = process.env.ARCADE_PLUGIN_SELF_REPORT;
  delete process.env.ARCADE_PLUGIN_SELF_REPORT;
  assert.equal(isSelfReportEnabled(), true);
  process.env.ARCADE_PLUGIN_SELF_REPORT = "0";
  assert.equal(isSelfReportEnabled(), false);
  if (previous === undefined) delete process.env.ARCADE_PLUGIN_SELF_REPORT;
  else process.env.ARCADE_PLUGIN_SELF_REPORT = previous;
});

test("recordSelfReport writes allowlisted fields only", () => {
  const previousHome = process.env.HOME;
  const previousReport = process.env.ARCADE_PLUGIN_SELF_REPORT;
  const previousInstall = process.env.ARCADE_PLUGIN_INSTALL_ID;
  const tempHome = mkdtempSync(join(tmpdir(), "arcade-self-report-"));

  process.env.HOME = tempHome;
  process.env.ARCADE_PLUGIN_SELF_REPORT = "1";
  process.env.ARCADE_PLUGIN_INSTALL_ID = "test-install-id";
  resetInstallIdCache();

  try {
    recordSelfReport({
      hook: "session-start",
      hookInput: { conversation_id: "conv-secret", cursor_version: "1.0" },
      error: new Error("boom"),
    });

    const day = new Date().toISOString().slice(0, 10);
    const file = join(tempHome, ".arcade-plugin", "self-reports", `${day}.jsonl`);
    const line = readFileSync(file, "utf8").trim().split("\n").at(-1);
    const record = JSON.parse(line);

    assert.equal(record.install_id, "test-install-id");
    assert.equal(record.hook, "session-start");
    assert.equal(record.error_class, "Error");
    assert.equal(record.host, "cursor");
    assert.ok(record.plugin_version);
    assert.ok(record.ts);
    assert.equal(record.prompt, undefined);
    assert.equal(record.conversation_id, undefined);
    assert.doesNotMatch(JSON.stringify(record), /conv-secret/);
    assert.doesNotMatch(JSON.stringify(record), /boom/);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousReport === undefined) delete process.env.ARCADE_PLUGIN_SELF_REPORT;
    else process.env.ARCADE_PLUGIN_SELF_REPORT = previousReport;
    if (previousInstall === undefined) delete process.env.ARCADE_PLUGIN_INSTALL_ID;
    else process.env.ARCADE_PLUGIN_INSTALL_ID = previousInstall;
    resetInstallIdCache();
    rmSync(tempHome, { recursive: true, force: true });
  }
});

test("recordSelfReport is a no-op when disabled", () => {
  const previousHome = process.env.HOME;
  const previousReport = process.env.ARCADE_PLUGIN_SELF_REPORT;
  const tempHome = mkdtempSync(join(tmpdir(), "arcade-self-report-off-"));

  process.env.HOME = tempHome;
  process.env.ARCADE_PLUGIN_SELF_REPORT = "0";

  try {
    recordSelfReport({ hook: "session-start", error: new Error("boom") });
    const day = new Date().toISOString().slice(0, 10);
    const file = join(tempHome, ".arcade-plugin", "self-reports", `${day}.jsonl`);
    assert.throws(() => readFileSync(file, "utf8"), /ENOENT/);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousReport === undefined) delete process.env.ARCADE_PLUGIN_SELF_REPORT;
    else process.env.ARCADE_PLUGIN_SELF_REPORT = previousReport;
    rmSync(tempHome, { recursive: true, force: true });
  }
});
