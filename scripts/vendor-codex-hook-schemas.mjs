#!/usr/bin/env node
// Refresh vendored Codex hook I/O schemas from openai/codex main.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "schemas/vendor/openai/codex-hooks");
const REF = process.env.CODEX_SCHEMA_REF ?? "main";
const BASE =
  "https://raw.githubusercontent.com/openai/codex";

const FILES = [
  "session-start.command.input.schema.json",
  "session-start.command.output.schema.json",
  "user-prompt-submit.command.input.schema.json",
  "user-prompt-submit.command.output.schema.json",
  "subagent-start.command.input.schema.json",
  "subagent-start.command.output.schema.json",
];

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return response.text();
};

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

mkdirSync(OUT_DIR, { recursive: true });

const commit = JSON.parse(
  await fetchText(`https://api.github.com/repos/openai/codex/commits/${REF}`),
).sha;

const digests = {};
for (const file of FILES) {
  const url = `${BASE}/${commit}/codex-rs/hooks/schema/generated/${file}`;
  const text = await fetchText(url);
  writeFileSync(join(OUT_DIR, file), text);
  digests[file] = sha256(text);
}

const source = {
  repository: "https://github.com/openai/codex",
  ref: REF,
  commit,
  pathPrefix: "codex-rs/hooks/schema/generated",
  vendoredAt: new Date().toISOString().slice(0, 10),
  files: FILES,
  digests,
};

writeFileSync(join(OUT_DIR, "SOURCE.json"), `${JSON.stringify(source, null, 2)}\n`);
console.log(`vendored ${FILES.length} Codex hook schemas at ${commit.slice(0, 12)}`);
