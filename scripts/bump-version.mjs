#!/usr/bin/env node
// Sync VERSION and every adapter manifest to one semver.
// Usage: node scripts/bump-version.mjs <semver>

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readVersion, syncVersionToManifests } from "./version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2];

if (!next) {
  console.error("Usage: node scripts/bump-version.mjs <semver>");
  console.error("Example: node scripts/bump-version.mjs 0.2.0");
  process.exit(1);
}

let current;
try {
  current = readVersion(ROOT);
} catch (error) {
  console.error(`bump-version.mjs: ${error.message}`);
  process.exit(1);
}

let written;
try {
  written = syncVersionToManifests(ROOT, next.trim());
} catch (error) {
  console.error(`bump-version.mjs: ${error.message}`);
  process.exit(1);
}

const parsed = next.trim();
if (current === parsed) {
  console.log(`Version already ${current}; manifests refreshed.`);
} else {
  console.log(`Bumped ${current} → ${parsed}`);
}

console.log("Updated:");
for (const path of written) {
  console.log(`  ${path}`);
}
console.log("\nNext: edit CHANGELOG.md, then npm run verify");
