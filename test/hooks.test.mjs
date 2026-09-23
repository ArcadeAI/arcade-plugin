import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { HOSTS } from "../hooks/hook-hosts.mjs";
import { shouldRemind } from "../hooks/prompt-filters.mjs";
import { readRepoFile, ROOT, runHook } from "./helpers.mjs";

// Exactly what each client should receive, from its hook docs. Every client in
// HOSTS needs an entry here.
const EXPECTED_OUTPUT = {
  cursor: (_event, text) => ({ additional_context: text }),
  "claude-code": (event, text) => ({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }),
  copilot: (event, text) => ({
    additionalContext: text,
    hookSpecificOutput: { hookEventName: event, additionalContext: text },
  }),
};

test("every client in the hook table has an expected output format", () => {
  assert.deepEqual(Object.keys(EXPECTED_OUTPUT).sort(), Object.keys(HOSTS).sort());
});

test("every command in every generated hooks.json runs and prints what its client reads", () => {
  for (const [hostName, { manifest, rootVariable }] of Object.entries(HOSTS)) {
    for (const [event, entries] of Object.entries(JSON.parse(readRepoFile(manifest)).hooks)) {
      for (const { command } of entries.flatMap((entry) => entry.hooks ?? [entry])) {
        const label = `${hostName} ${event}`;
        const result = spawnSync(command.replaceAll(`\${${rootVariable}}`, ROOT), {
          shell: true,
          input: JSON.stringify({ prompt: "What's on my calendar?", agent_type: "Explore" }),
          encoding: "utf8",
        });
        assert.equal(result.status, 0, `${label}: ${result.stderr}`);
        const out = JSON.parse(result.stdout);
        const text = out.hookSpecificOutput?.additionalContext ?? out.additional_context;
        assert.ok(text, `${label}: no context in ${result.stdout}`);
        assert.deepEqual(out, EXPECTED_OUTPUT[hostName](event, text), label);
      }
    }
  }
});

test("shouldRemind skips acknowledgements and background task results", () => {
  for (const prompt of ["What's on my calendar?", "fix it", "go ahead and send it"]) {
    assert.equal(shouldRemind(prompt), true, prompt);
  }
  for (const prompt of ["", "ok", "yes thanks", "<task-notification>\n<task-id>a</task-id>", undefined]) {
    assert.equal(shouldRemind(prompt), false, String(prompt));
  }
});

test("subagent-start skips arcade-operator in every client's input format", () => {
  for (const input of [
    { agent_type: "arcade-operator" },
    { agent_type: "arcade:arcade-operator" },
  ]) {
    for (const host of Object.keys(HOSTS)) {
      const result = runHook("subagent-start.mjs", input, ["--host", host]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", `${host} ${JSON.stringify(input)}`);
    }
  }
  assert.notEqual(runHook("subagent-start.mjs", { agent_type: "Explore" }, ["--host", "claude-code"]).stdout, "");
});

test("hooks exit 0 and print nothing without a known --host", () => {
  for (const script of ["session-start.mjs", "user-prompt-submit.mjs", "subagent-start.mjs"]) {
    for (const args of [[], ["--host", "nope"]]) {
      const result = runHook(script, { prompt: "What's on my calendar?" }, args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", `${script} ${args.join(" ")}`);
    }
  }
});
