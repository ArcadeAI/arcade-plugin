#!/usr/bin/env node
// Sync manifest version from plugin.json, then pack the Claude Desktop .mcpb.
// Usage: node scripts/build-claude-desktop-mcpb.mjs

import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENDPOINT, MCP_REMOTE_PACKAGE } from "./constants.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCPB_DIR = join(ROOT, "clients/claude-desktop/mcpb");
const OUTPUT = join(ROOT, "clients/claude-desktop/arcade.mcpb");

const plugin = JSON.parse(readFileSync(join(ROOT, "plugin.json"), "utf8"));
const manifestPath = join(MCPB_DIR, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

manifest.version = plugin.version;
manifest.server.mcp_config.args = ["-y", MCP_REMOTE_PACKAGE, ENDPOINT];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

rmSync(OUTPUT, { force: true });
execSync("npx -y @anthropic-ai/mcpb pack . ../arcade.mcpb", {
  cwd: MCPB_DIR,
  stdio: "inherit",
});

console.log(`build-claude-desktop-mcpb: wrote ${OUTPUT} (version ${plugin.version})`);
