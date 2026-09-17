#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateHookContracts, HOOK_CONTRACTS } from "./hook-contracts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = validateHookContracts(ROOT);

if (errors.length > 0) {
  console.error(`validate-hook-contracts: ${errors.length} problem(s)\n`);
  for (const message of errors) console.error(`  ✗ ${message}`);
  process.exit(1);
}

console.log(
  `validate-hook-contracts: ok (${HOOK_CONTRACTS.length} contracts)`,
);
