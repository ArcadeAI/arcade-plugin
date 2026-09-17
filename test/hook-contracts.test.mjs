import assert from "node:assert/strict";
import { test } from "node:test";
import { validateHookContracts } from "../scripts/hook-contracts.mjs";
import { ROOT } from "./helpers.mjs";

test("hook stdout matches vendored Codex and Cursor output schemas", () => {
  const errors = validateHookContracts(ROOT);
  assert.deepEqual(errors, []);
});
