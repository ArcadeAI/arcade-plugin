import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { readRepoFile, readRepoJson, ROOT } from "./helpers.mjs";

const pathExists = async (relativePath) => {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
};

const resolveClient = (capabilities, clientId) => {
  const client = capabilities.clients[clientId];
  if (client.sameAs) {
    return capabilities.clients[client.sameAs];
  }
  return client;
};

test("support matrix capabilities file matches documented clients", async () => {
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");
  const matrix = await readRepoFile("docs/support-matrix.md");

  assert.deepEqual(capabilities.skills, ["try-arcade", "scale-arcade"]);
  assert.deepEqual(capabilities.commands, [
    "arcade-apps",
    "arcade-connect",
    "arcade-status",
  ]);

  for (const command of capabilities.commands) {
    assert.match(matrix, new RegExp(`/${command}`));
  }

  for (const [clientId, client] of Object.entries(capabilities.clients)) {
    if (client.sameAs) continue;
    assert.match(matrix, new RegExp(client.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("support matrix capability paths exist on disk", async () => {
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");

  for (const skill of capabilities.skills) {
    assert.equal(await pathExists(`skills/${skill}/SKILL.md`), true);
  }

  for (const [clientId, client] of Object.entries(capabilities.clients)) {
    const resolved = resolveClient(capabilities, clientId);
    if (resolved.sameAs) continue;

    assert.equal(
      await pathExists(resolved.installGuide),
      true,
      `${clientId} install guide`,
    );

    if (resolved.subagent?.path) {
      assert.equal(await pathExists(resolved.subagent.path), true);
    }

    if (resolved.rule) {
      assert.equal(await pathExists(resolved.rule), true);
    }

    if (resolved.hooks) {
      assert.equal(await pathExists(resolved.hooks.manifest), true);
      const manifest = await readRepoJson(resolved.hooks.manifest);
      assert.deepEqual(
        Object.keys(manifest.hooks).sort(),
        [...resolved.hooks.events].sort(),
        `${clientId} hook events`,
      );
    }
  }
});

test("support matrix markdown hook counts match capabilities data", async () => {
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");
  const matrix = await readRepoFile("docs/support-matrix.md");

  const rows = {
    cursor: /\*\*Cursor\*\*.*?\|\s*✅\s*\|\s*2\s*\|\s*✅\s*\|\s*3\s*\|\s*✅\s*\|\s*✅\s*\|/,
    "claude-code": /\*\*Claude Code\*\*.*?\|\s*✅\s*\|\s*2\s*\|\s*✅\s*\|\s*3\s*\|\s*—\s*\|\s*2\s*\|/,
    codex: /\*\*Codex \/ ChatGPT local runtime\*\*.*?\|\s*✅\s*\|\s*2\s*\|\s*—\s*\|\s*—\s*\|\s*—\s*\|\s*✅\s*3\s*\|/,
  };

  for (const [clientId, pattern] of Object.entries(rows)) {
    assert.match(matrix, pattern, `${clientId} matrix row`);
    const hooks = resolveClient(capabilities, clientId).hooks;
    if (hooks?.count) {
      assert.equal(typeof hooks.count, "number");
    }
  }
});

test("copilot and vscode subagent paths use com.github.copilot projection", async () => {
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");
  for (const clientId of ["copilot-cli", "vscode"]) {
    const subagent = resolveClient(capabilities, clientId).subagent;
    assert.match(subagent.path, /^com\.github\.copilot\//);
    assert.equal(subagent.via, "com.github.copilot");
  }
});
