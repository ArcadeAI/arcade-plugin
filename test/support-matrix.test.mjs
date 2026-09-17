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
  const { sameAs, ...overrides } = client;
  return sameAs
    ? { ...capabilities.clients[sameAs], ...overrides }
    : overrides;
};

const extractMarkdownRow = (markdown, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(
    new RegExp(`^\\|\\s*\\*\\*${escaped}\\*\\*\\s*\\|(.+)\\|\\s*$`, "m"),
  );
  if (!match) return null;
  return match[1].split("|").map((cell) => cell.trim());
};

const formatHooksCell = (hooks) => {
  if (!hooks) return "—";
  if (hooks.count === 1) return "✅";
  return `✅ ${hooks.count}`;
};

test("support matrix capabilities file matches documented clients", async () => {
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");
  const matrix = await readRepoFile("docs/support-matrix.md");

  assert.deepEqual(capabilities.skills, ["try-arcade", "scale-arcade"]);
  for (const commandFile of capabilities.commandFiles) {
    assert.equal(await pathExists(commandFile), true, commandFile);
  }

  for (const command of capabilities.commands.cursor) {
    assert.match(matrix, new RegExp(command.replace("/", "\\/")));
  }
  for (const command of capabilities.commands["claude-code"]) {
    assert.match(matrix, new RegExp(command.replace("/", "\\/")));
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

test("sameAs clients retain their own metadata", async () => {
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");
  const vscode = resolveClient(capabilities, "vscode");

  assert.equal(vscode.installGuide, "docs/install/vscode.md");
  assert.deepEqual(vscode.subagent, capabilities.clients["copilot-cli"].subagent);
});

test("README hook counts match capabilities data", async () => {
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");
  const readme = await readRepoFile("README.md");

  for (const [clientId, client] of Object.entries(capabilities.clients)) {
    const cells = extractMarkdownRow(readme, client.label);
    assert.ok(cells, `README row for ${client.label}`);
    const hooks = resolveClient(capabilities, clientId).hooks;
    assert.equal(
      cells[5],
      formatHooksCell(hooks),
      `${client.label} README hooks cell`,
    );
  }
});

test("support matrix markdown hook counts match capabilities data", async () => {
  const capabilities = await readRepoJson("docs/support-matrix.capabilities.json");
  const matrix = await readRepoFile("docs/support-matrix.md");

  const rows = {
    cursor: /\*\*Cursor\*\*.*?\|\s*✅\s*\|\s*2\s*\|\s*✅\s*\|\s*3\s*\|\s*✅\s*\|\s*✅¹\s*\|/,
    "claude-code": /\*\*Claude Code\*\*.*?\|\s*✅\s*\|\s*2\s*\|\s*✅\s*\|\s*3\s*\|\s*—\s*\|\s*3\s*\|/,
    codex: /\*\*Codex \/ ChatGPT local runtime\*\*.*?\|\s*✅\s*\|\s*2\s*\|\s*—\s*\|\s*—\s*\|\s*—\s*\|\s*—\s*\|/,
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

test("portable manifest exposes Codex listing metadata", async () => {
  const portable = await readRepoJson("plugin.json");
  assert.equal(portable.extensions?.["com.openai"]?.interface?.displayName, "Arcade");
});
