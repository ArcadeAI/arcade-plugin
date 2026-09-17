import assert from "node:assert/strict";
import { test } from "node:test";
import { runManifestHookSmoke } from "../scripts/manifest-hook-smoke.mjs";
import { ROOT } from "./helpers.mjs";

test("hook manifest commands run with substituted plugin root tokens", () => {
  const errors = runManifestHookSmoke(ROOT);
  assert.deepEqual(errors, []);
});
