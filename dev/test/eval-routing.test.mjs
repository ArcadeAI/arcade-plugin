import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareRoutingEval, summarizeRoutingEval, summarizeRun } from "../scripts/eval-routing.mjs";

test("the eval changes hooks while keeping instructions and mock tools identical", () => {
  const root = mkdtempSync(join(tmpdir(), "routing-eval-"));
  try {
    prepareRoutingEval(root);
    const read = (arm, path) => readFileSync(join(root, arm, path), "utf8");
    const old = JSON.parse(read("hooks", ".claude-plugin/plugin.json"));
    const current = JSON.parse(read("no-hooks", ".claude-plugin/plugin.json"));
    assert.equal(old.hooks, "./hooks/eval-hooks.json");
    delete old.hooks;
    assert.deepEqual(old, current);
    assert.equal(current.mcpServers.arcade.url, "https://example.invalid/arcade");
    for (const path of ["skills/try-arcade/SKILL.md", "agents/arcade-operator.agent.md", "evals/calendar/prompt.md", "evals/mocks/direct/_tools.json"]) {
      assert.equal(read("hooks", path), read("no-hooks", path));
    }
    assert.deepEqual(Object.keys(JSON.parse(read("hooks", "hooks/eval-hooks.json")).hooks), ["SessionStart", "UserPromptSubmit", "SubagentStart"]);
    assert.match(read("no-hooks", "evals/auth-block/graders/arcade-executed.md"), /^max: 1$/m);
    assert.throws(() => prepareRoutingEval(root), /fresh output directory/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("summaries retain failed runs and can reuse copied traces after native cleanup", () => {
  const root = mkdtempSync(join(tmpdir(), "routing-evidence-"));
  try {
    const write = (path, value) => { const target = join(root, path); mkdirSync(join(target, ".."), { recursive: true }); writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value)); };
    write("setup.json", { sourceCommit: "test", sessionContext: "routing instructions", arms: ["hooks"], cases: [{ name: "calendar", route: "arcade" }] });
    const zero = ["arcade-selected", "arcade-executed", "cli-used", "skill-used", "no-list_calendar_events", "no-list_github_issues", "no-search_gmail", "no-search_slack"];
    const valid = { error: null, tracePath: join(root, "native.jsonl"), graders: zero.map((name) => ({ name, explanation: "tool called 0x" })), mocks: { calls: { total: 0 } } };
    const failed = { error: "provider failure", tracePath: null };
    write("results/hooks/aggregate-result.json", { cases: [{ name: "calendar", arms: { with: [failed, valid] } }] });
    const events = [{ type: "system", subtype: "init", model: "test" }, { type: "system", subtype: "hook_response", hook_event: "SessionStart", exit_code: 0, stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: "routing instructions" } }) }];
    write("native.jsonl", events.map((entry) => JSON.stringify(entry)).join("\n"));
    assert.equal(summarizeRoutingEval(root).arms.hooks.errors, 1);
    rmSync(join(root, "native.jsonl"));
    assert.equal(summarizeRoutingEval(root).arms.hooks.errors, 1);
    events[1].stdout = "";
    write("traces/hooks/calendar-2.jsonl", events.map((entry) => JSON.stringify(entry)).join("\n"));
    assert.equal(summarizeRoutingEval(root).arms.hooks.errors, 2);

    write("setup.json", { sourceCommit: "test", arms: ["no-hooks"], cases: [{ name: "calendar", route: "arcade" }] });
    write("results/no-hooks/aggregate-result.json", { cases: [{ name: "calendar", arms: { with: [valid] } }] });
    write("native.jsonl", JSON.stringify(events[0]));
    assert.equal(summarizeRoutingEval(root).arms["no-hooks"].errors, 0);
    write("traces/no-hooks/calendar-1.jsonl", events.map((entry) => JSON.stringify(entry)).join("\n"));
    assert.equal(summarizeRoutingEval(root).arms["no-hooks"].errors, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("routing counts distinguish app completion, bypass, and invalid model runs", () => {
  const counts = { "arcade-selected": 0, "arcade-executed": 0, "cli-used": 0, "skill-used": 0, "no-list_calendar_events": 1, "no-list_github_issues": 0, "no-search_gmail": 0, "no-search_slack": 0 };
  const run = { graders: [...Object.entries(counts).map(([name, value]) => ({ name, explanation: `tool called ${value}x (expected 0..0)` })), { name: "answer", passed: true }], mocks: { calls: { total: 1 } }, error: null };
  const result = summarizeRun(run, { name: "calendar", route: "arcade" });
  assert.equal(result.valid, true);
  assert.equal(result.executed, 0);
  assert.equal(result.direct, 1);
  assert.equal(result.answer, true);
  assert.equal(summarizeRun({ ...run, error: "timed out" }, { name: "calendar" }).valid, false);
  assert.equal(summarizeRun({ ...run, mocks: { calls: { total: 2 } } }, { name: "calendar" }).valid, false);
});
