#!/usr/bin/env node
import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VENDORED_SCHEMAS } from "./constants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_FILES = ["plugin.json", "mcp.json"];

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

for (const relativePath of SCHEMA_FILES) {
  const doc = await readJson(relativePath);
  const schemaUrl = doc.$schema;
  if (!schemaUrl) {
    console.error(`${relativePath}: missing $schema`);
    failed = true;
    continue;
  }

  const schema = await loadSchema(schemaUrl);
  const validate = ajv.compile(schema);
  if (!validate(doc)) {
    failed = true;
    console.error(`${relativePath}: schema validation failed`);
    for (const error of validate.errors ?? []) {
      console.error(`  - ${error.instancePath || "/"} ${error.message}`);
    }
    continue;
  }

  console.log(`${relativePath}: ok`);
}

if (failed) process.exit(1);
