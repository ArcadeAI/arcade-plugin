#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CODEX_HOOKS_PATH,
  readOpenAiInterface,
  validateCodexFallbackManifest,
} from "./openai-extension.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(ROOT, "schemas/vendor/openai/codex-hooks");
const errors = [];

const fail = (message) => errors.push(message);

const readJson = (relativePath) =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const source = readJson("schemas/vendor/openai/codex-hooks/SOURCE.json");
for (const file of source.files) {
  const absolutePath = join(VENDOR_DIR, file);
  if (!existsSync(absolutePath)) {
    fail(`missing vendored Codex schema: ${file}`);
    continue;
  }
  if (source.digests?.[file]) {
    const digest = sha256(readFileSync(absolutePath, "utf8"));
    if (digest !== source.digests[file]) {
      fail(`vendored Codex schema drift: ${file} (run node scripts/vendor-codex-hook-schemas.mjs)`);
    }
  }
}

const portable = readJson("plugin.json");
if (portable.extensions?.["com.openai"]?.hooks !== CODEX_HOOKS_PATH) {
  fail(`plugin.json: extensions.com.openai.hooks must be "${CODEX_HOOKS_PATH}"`);
}
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
