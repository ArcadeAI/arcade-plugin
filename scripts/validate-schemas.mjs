#!/usr/bin/env node
import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_FILES = ["plugin.json", "mcp.json"];
const schemaCache = new Map();

const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));

const loadSchema = async (schemaUrl) => {
  if (schemaCache.has(schemaUrl)) return schemaCache.get(schemaUrl);
  const response = await fetch(schemaUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch schema ${schemaUrl}: ${response.status}`);
  }
  const schema = await response.json();
  schemaCache.set(schemaUrl, schema);
  return schema;
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
