import assert from "node:assert/strict";
import { test } from "node:test";
import { readRepoFile, readRepoJson } from "./helpers.mjs";

test("README and support matrix agree on slash command names", async () => {
  const readme = await readRepoFile("README.md");
  const matrix = await readRepoFile("docs/support-matrix.md");
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");

  for (const command of capabilities.commands.cursor) {
    assert.match(readme, new RegExp(command.replace("/", "\\/")));
    assert.match(matrix, new RegExp(command.replace("/", "\\/")));
  }
  for (const command of capabilities.commands["claude-code"]) {
    assert.match(matrix, new RegExp(command.replace("/", "\\/")));
  }
});

test("README documents the plugins CLI install path", async () => {
  const readme = await readRepoFile("README.md");
  assert.match(readme, /npx plugins add/);
});

test("Claude Desktop guide documents the marketplace install", async () => {
  const guide = await readRepoFile("docs/install/claude-desktop.md");
  assert.match(guide, /claude plugin marketplace add ArcadeAI\/arcade-plugin/);
  assert.match(guide, /claude plugin install arcade@arcade/);
  assert.doesNotMatch(guide, /arcade\.mcpb/);
});

test("Codex guide documents hook trust", async () => {
  const guide = await readRepoFile("docs/install/codex.md");
  assert.match(guide, /\/hooks/);
  assert.match(guide, /SubagentStart/);
  assert.match(guide, /extensions\.com\.openai/);
  assert.match(guide, /local runtime/);
});

test("Copilot and VS Code guides document the namespaced operator", async () => {
  for (const guidePath of [
    "docs/install/copilot.md",
    "docs/install/vscode.md",
  ]) {
    const guide = await readRepoFile(guidePath);
    assert.match(guide, /com\.github\.copilot\/agents/);
    assert.match(guide, /arcade-operator/);
  }
});
