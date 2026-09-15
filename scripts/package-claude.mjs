#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const filename = "arcade-claude.zip";
const output = join(root, "dist", filename);
const staging = mkdtempSync(join(tmpdir(), "arcade-claude-"));

try {
  const plugin = join(staging, "plugin");
  mkdirSync(plugin);

  // Package tracked Claude components using their current working-tree contents.
  const files = execFileSync("git", [
    "ls-files", "-z", "--",
    ".claude-plugin/plugin.json",
    "clients/claude/mcp.json",
    "skills", "agents", "commands", "hooks", "LICENSE",
  ], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);

  for (const file of files) {
    const destination = join(plugin, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, file), destination);
  }

  const archive = join(staging, filename);
  execFileSync("zip", ["-q", "-r", archive, "."], { cwd: plugin });
  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(archive, output);
  console.log(output);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
