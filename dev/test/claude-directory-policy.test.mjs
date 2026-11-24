import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { restrictedFileProblems, validateClaudeDirectory } from "../scripts/claude-directory-policy.mjs";
import { ROOT } from "./helpers.mjs";

test("the submitted Claude folder meets every unverified-organization restriction", () => {
  assert.deepEqual(validateClaudeDirectory(join(ROOT, "clients/claude")), []);
});

test("restricted files fail even when they are not declared in the manifest", () => {
  for (const file of [
    "scripts/start.sh", "helper.mjs", "icon.svg", "font.woff", "archive.zip",
    "package.json", "package-lock.json", "pnpm-workspace.yaml", ".npmrc", ".yarnrc.yml",
    "deno.json", "composer.json", "environment.yml", "requirements.txt",
    ".claude/skills/example/SKILL.md", "other/.claude-plugin/plugin.json",
    "egress.json", "config/egress.yaml", "egress/rules.json", "egress/nested/rules.yaml", ".claude-plugin/hooks.json",
    ".claude-plugin/extra.md", "hooks/hooks.json", "mcp.json", "lsp.json", "monitors.json",
    "output-styles/unlisted.md", "commands/task.json", "agents/operator.yaml", "bad:name.md",
  ]) {
    assert.ok(restrictedFileProblems(file, Buffer.from("{}\n")).length, file);
  }
});

test("text must be UTF-8 without NUL bytes, shebangs, or package-source settings", () => {
  for (const bytes of [
    Buffer.from("#!/bin/sh\necho hello\n"),
    Buffer.from("\ufeff#!/bin/sh\n"),
    Buffer.from("text\0more text"),
    Buffer.concat([Buffer.alloc(9000, 65), Buffer.from([0xff])]),
    Buffer.from("registry=https://example.com"),
    Buffer.from("@mycompany:registry=https://example.com"),
    Buffer.from('{"registry": "https://example.com"}'),
    Buffer.from('"npmRegistryServer": "https://example.com"'),
    Buffer.from("npmRegistryServer: https://example.com"),
    Buffer.from("--extra-index-url https://example.com"),
    Buffer.from("UV_INDEX_URL=https://example.com"),
    Buffer.from("PIP_INDEX_URL=https://example.com"),
    Buffer.from("npm install --registry https://example.com"),
    Buffer.from("pip install -i https://example.com"),
    Buffer.from("npm config set registry https://example.com"),
  ]) {
    assert.ok(restrictedFileProblems("instructions.txt", bytes).length, bytes.toString());
  }
  for (const file of ["README.md", "LICENSE", ".gitignore", "skills/task/SKILL.md", ".claude-plugin/plugin.json"]) {
    assert.deepEqual(restrictedFileProblems(file, Buffer.from("Useful text.\n")), [], file);
  }
});

test("skills, commands, and agents cannot define frontmatter hooks", () => {
  for (const file of ["skills/x/SKILL.md", "commands/x.md", "agents/x.md"]) {
    assert.ok(restrictedFileProblems(file, Buffer.from("---\nname: x\nhooks:\n  PreToolUse: []\n---\n")).includes("component frontmatter hooks"), file);
  }
});

test("inline hooks of every type and untracked symbolic links fail", () => {
  const root = mkdtempSync(join(tmpdir(), "claude-policy-"));
  try {
    mkdirSync(join(root, ".claude-plugin"));
    for (const type of ["command", "prompt", "agent", "http"]) {
      writeFileSync(join(root, ".claude-plugin/plugin.json"), JSON.stringify({ name: "example", hooks: { Stop: [{ hooks: [{ type }] }] } }));
      assert.ok(validateClaudeDirectory(root).some((problem) => problem.includes("hooks require")), type);
    }
    for (const declaration of [
      { mcpServers: { local: { command: "node" } } },
      { lspServers: { local: { command: "x" } } },
      { monitors: "./monitor.json" },
      { outputStyles: "./styles/" },
    ]) {
      writeFileSync(join(root, ".claude-plugin/plugin.json"), JSON.stringify({ name: "example", mcpServers: {}, ...declaration }));
      assert.ok(validateClaudeDirectory(root).some((problem) => problem.startsWith("plugin.json:")));
    }
    writeFileSync(join(root, ".claude-plugin/plugin.json"), '{"name":"example","mcpServers":{}}');
    symlinkSync(join(root, ".claude-plugin/plugin.json"), join(root, "linked.json"));
    assert.ok(validateClaudeDirectory(root).includes("linked.json: not a regular file"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
