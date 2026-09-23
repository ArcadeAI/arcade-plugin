import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runManifestHookSmoke } from "../scripts/manifest-hook-smoke.mjs";
import { ROOT } from "./helpers.mjs";

test("hook manifest commands run with substituted plugin root tokens", () => {
  const errors = runManifestHookSmoke(ROOT);
  assert.deepEqual(errors, []);
});

test("smoke allows empty stdout from the telemetry hook only", () => {
  const root = mkdtempSync(path.join(tmpdir(), "arcade-smoke-root-"));
  const command = (script) => ({
    type: "command",
    command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${script}"`,
  });
  try {
    mkdirSync(path.join(root, "hooks"));
    mkdirSync(path.join(root, "clients/cursor/hooks"), { recursive: true });
    writeFileSync(path.join(root, "hooks/silent.mjs"), "");
    writeFileSync(path.join(root, "hooks/telemetry.mjs"), "");
    writeFileSync(
      path.join(root, "hooks/hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [command("silent.mjs"), command("telemetry.mjs")] }],
        },
      }),
    );
    writeFileSync(path.join(root, "clients/cursor/hooks/hooks.json"), '{"hooks":{}}');

    assert.deepEqual(runManifestHookSmoke(root), [
      "claude-code: SessionStart produced empty stdout",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
