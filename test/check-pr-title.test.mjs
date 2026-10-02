import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ROOT } from "./helpers.mjs";

const run = (eventPath) => spawnSync(process.execPath, [path.join(ROOT, "scripts/check-pr-title.mjs")], {
  env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
  encoding: "utf8",
});

test("accepts release and non-release Conventional Commit titles", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "arcade-pr-title-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const eventPath = path.join(dir, "event.json");
  for (const title of [
    "fix: allow an authorized gateway fallback",
    "feat(gateway): add tool discovery",
    "fix(plugin)!: require a new host version",
    "feat!: change the gateway contract",
    "perf: reduce discovery calls",
    "docs: explain releases",
    "chore(main): release 0.2.1",
    ...["refactor", "test", "build", "ci", "style", "revert"].map((type) => `${type}: update plugin checks`),
  ]) {
    writeFileSync(eventPath, JSON.stringify({ pull_request: { title } }));
    const result = run(eventPath);
    assert.equal(result.status, 0, `${title}: ${result.stderr}`);
  }
});

test("rejects titles Release Please cannot use and missing event titles", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "arcade-pr-title-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const eventPath = path.join(dir, "event.json");
  for (const title of [
    "Let the parent conversation use other tools when Arcade can't",
    "Fix: update routing",
    "unknown: update routing",
    "fix update routing",
    "fix(): update routing",
    "fix: ",
    "fix: \t",
    "fix: update routing\nfeat: add tools",
    "fix: update routing\n",
    undefined,
    null,
    42,
  ]) {
    writeFileSync(eventPath, JSON.stringify({ pull_request: { title } }));
    const result = run(eventPath);
    assert.equal(result.status, 1, String(title));
    assert.match(result.stderr, /Conventional Commit header/);
  }
  writeFileSync(eventPath, "{}");
  assert.equal(run(eventPath).status, 1);
});

test("treats shell syntax in the event title as data", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "arcade-pr-title-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const eventPath = path.join(dir, "event.json");
  const outputPath = path.join(dir, "shell-executed");
  const title = `fix: $(touch '${outputPath}') \`touch '${outputPath}'\`; echo ::error::injected`;
  writeFileSync(eventPath, JSON.stringify({ pull_request: { title } }));
  const result = run(eventPath);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(outputPath), false);
  assert.doesNotMatch(result.stdout + result.stderr, /::error::injected/);
});

test("fails when the event file is unreadable or invalid JSON", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "arcade-pr-title-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const eventPath = path.join(dir, "event.json");
  assert.equal(run(eventPath).status, 1);
  writeFileSync(eventPath, "not JSON");
  const result = run(eventPath);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GITHUB_EVENT_PATH/);
});
