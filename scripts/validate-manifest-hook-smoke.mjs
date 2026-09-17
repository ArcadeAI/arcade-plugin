#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractHookCommands,
  MANIFEST_HOOK_ADAPTERS,
  runManifestHookSmoke,
} from "./manifest-hook-smoke.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = runManifestHookSmoke(ROOT);

if (errors.length > 0) {
  console.error(`validate-manifest-hook-smoke: ${errors.length} problem(s)\n`);
  for (const message of errors) console.error(`  ✗ ${message}`);
  process.exit(1);
}

let commandCount = 0;
for (const adapter of MANIFEST_HOOK_ADAPTERS) {
  const hooksJson = JSON.parse(
    readFileSync(join(ROOT, adapter.manifest), "utf8"),
  );
  commandCount += extractHookCommands(hooksJson).length;
}

console.log(
  `validate-manifest-hook-smoke: ok (${MANIFEST_HOOK_ADAPTERS.length} adapters, ${commandCount} commands)`,
);
