#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readOpenAiInterface,
  validateCodexFallbackManifest,
} from "./openai-extension.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const fail = (message) => errors.push(message);

const readJson = (relativePath) =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));

const portable = readJson("plugin.json");
const openAiInterface = readOpenAiInterface(portable);
if (openAiInterface?.displayName !== "Arcade") {
  fail('plugin.json: extensions.com.openai.interface.displayName must be "Arcade"');
}
if (!openAiInterface?.shortDescription) {
  fail("plugin.json: extensions.com.openai.interface.shortDescription is required");
}

validateCodexFallbackManifest(
  readJson(".codex-plugin/plugin.json"),
  portable,
  fail,
);

const hasCodexCli = (() => {
  try {
    execFileSync("codex", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

if (hasCodexCli) {
  const help = execFileSync("codex", ["plugin", "--help"], { encoding: "utf8" });
  if (!help.includes("add")) {
    fail("codex plugin CLI missing add subcommand");
  }
} else {
  console.warn("verify-codex: codex CLI not installed — skipped CLI smoke");
}

if (errors.length > 0) {
  console.error(`verify-codex: ${errors.length} problem(s)\n`);
  for (const message of errors) console.error(`  ✗ ${message}`);
  process.exit(1);
}

console.log("verify-codex: ok");
