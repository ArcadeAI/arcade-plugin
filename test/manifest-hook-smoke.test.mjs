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

test("smoke allows empty stdout from telemetry only, and isolates its network and data dir", () => {
  const root = mkdtempSync(path.join(tmpdir(), "arcade-smoke-root-"));
  const write = (relativePath, content) => {
    mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    writeFileSync(path.join(root, relativePath), content);
  };
  const command = (script) => ({
    type: "command",
    command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${script}"`,
    timeout: 5,
  });

  try {
    write("hooks/silent-routing.mjs", "");
    write(
      "hooks/telemetry.mjs",
      [
        'if (process.env.ARCADE_PLUGIN_TELEMETRY_HOST !== "http://127.0.0.1:9") process.exit(2);',
        'if (!process.env.CLAUDE_PLUGIN_DATA?.includes("arcade-hook-smoke-")) process.exit(3);',
      ].join("\n"),
    );
    write(
      "hooks/hooks.json",
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [command("silent-routing.mjs"), command("telemetry.mjs")],
            },
          ],
          Stop: [{ hooks: [command("telemetry.mjs")] }],
        },
      }),
    );
    write("clients/cursor/hooks/hooks.json", JSON.stringify({ hooks: {} }));

    assert.deepEqual(runManifestHookSmoke(root), [
      "claude: SessionStart produced empty stdout",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
