#!/usr/bin/env node

import Ajv2020 from "ajv/dist/2020.js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const fail = (message) => errors.push(message);

const readJson = (relativePath) =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const cursorManifestSchema = readJson(
  "schemas/host-adapters/cursor-plugin.schema.json",
);
const cursorHooksSchema = readJson("schemas/host-adapters/cursor-hooks.schema.json");
const validateManifest = ajv.compile(cursorManifestSchema);
const validateHooks = ajv.compile(cursorHooksSchema);

const manifest = readJson(".cursor-plugin/plugin.json");
if (!validateManifest(manifest)) {
  fail(
    `.cursor-plugin/plugin.json: ${JSON.stringify(validateManifest.errors)}`,
  );
}

const hooks = readJson("clients/cursor/hooks/hooks.json");
if (!validateHooks(hooks)) {
  fail(
    `clients/cursor/hooks/hooks.json: ${JSON.stringify(validateHooks.errors)}`,
  );
}

for (const key of [
  "skills",
  "agents",
  "commands",
  "rules",
  "hooks",
  "mcpServers",
]) {
  const target = manifest[key];
  if (!existsSync(join(ROOT, target))) {
    fail(`.cursor-plugin/plugin.json: missing path ${target}`);
  }
}

const hasCursorCli = (() => {
  try {
    execFileSync("cursor", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

if (hasCursorCli) {
  const help = execFileSync("cursor", ["agent", "--help"], { encoding: "utf8" });
  if (!help.includes("--plugin-dir")) {
    fail("cursor agent CLI missing --plugin-dir flag");
  }
} else {
  console.warn("verify-cursor: cursor CLI not installed — skipped CLI smoke");
}

if (errors.length > 0) {
  console.error(`verify-cursor: ${errors.length} problem(s)\n`);
  for (const message of errors) console.error(`  ✗ ${message}`);
  process.exit(1);
}

console.log("verify-cursor: ok");
