import assert from "node:assert/strict";
import { test } from "node:test";
import { readRepoFile } from "./helpers.mjs";

const COMMANDS = ["arcade-apps", "arcade-connect", "arcade-status"];

test("README and support matrix agree on slash command names", async () => {
  const readme = await readRepoFile("README.md");
  const matrix = await readRepoFile("docs/support-matrix.md");

  for (const command of COMMANDS) {
    assert.match(readme, new RegExp(`/${command}`));
    assert.match(matrix, new RegExp(`/${command}`));
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
  assert.match(
    guide,
    /github\.com\/ArcadeAI\/arcade-plugin\/releases\/latest\/download\/arcade-claude\.zip/,
  );
  assert.match(guide, /Organization settings → Plugins → Add plugins → Upload a file/);
  assert.doesNotMatch(guide, /arcade\.mcpb/);
});
