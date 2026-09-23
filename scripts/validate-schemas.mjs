#!/usr/bin/env node
import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VENDORED_SCHEMAS } from "./constants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTABLE_DOCUMENTS = ["plugin.json", "mcp.json"];
const HOST_CONTRACTS = [
  ["hooks/hooks.json", "schemas/host-adapters/claude-hooks.schema.json"],
  [
    "clients/cursor/hooks/hooks.json",
    "schemas/host-adapters/cursor-hooks.schema.json",
  ],
  [
    ".cursor-plugin/plugin.json",
    "schemas/host-adapters/cursor-plugin.schema.json",
  ],
];

const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));

const loadSchema = async (schemaUrl) => {
  const localPath = VENDORED_SCHEMAS[schemaUrl];
  if (!localPath) {
    throw new Error(`No vendored schema for ${schemaUrl}`);
  }
  return readJson(localPath);
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
let failed = false;

const validateDocument = async (relativePath, schema) => {
  const doc = await readJson(relativePath);
  const validate = ajv.compile(schema);
  if (!validate(doc)) {
    failed = true;
    console.error(`${relativePath}: schema validation failed`);
    for (const error of validate.errors ?? []) {
      console.error(`  - ${error.instancePath || "/"} ${error.message}`);
    }
    return;
  }

  console.log(`${relativePath}: ok`);
};

for (const relativePath of PORTABLE_DOCUMENTS) {
  const doc = await readJson(relativePath);
  const schemaUrl = doc.$schema;
  if (!schemaUrl) {
    console.error(`${relativePath}: missing $schema`);
    failed = true;
    continue;
  }

  await validateDocument(relativePath, await loadSchema(schemaUrl));
}

for (const [relativePath, schemaPath] of HOST_CONTRACTS) {
  await validateDocument(relativePath, await readJson(schemaPath));
}

if (failed) process.exit(1);
