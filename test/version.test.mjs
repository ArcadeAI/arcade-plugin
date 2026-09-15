import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyVersionToJson,
  parseVersion,
  VERSIONED_MANIFESTS,
  writeVersion,
} from "../scripts/version.mjs";

test("parseVersion accepts release semver", () => {
  assert.equal(parseVersion("0.1.0\n"), "0.1.0");
  assert.equal(parseVersion("1.2.3-rc.1"), "1.2.3-rc.1");
});

test("parseVersion rejects invalid semver", () => {
  assert.throws(() => parseVersion("v0.1.0"), /invalid semver/);
  assert.throws(() => parseVersion("not-a-version"), /invalid semver/);
});

test("applyVersionToJson updates marketplace plugin entry", () => {
  const manifest = {
    version: "0.1.0",
    plugins: [{ name: "arcade", version: "0.1.0" }],
  };

  applyVersionToJson(".claude-plugin/marketplace.json", manifest, "0.2.0");

  assert.equal(manifest.version, "0.2.0");
  assert.equal(manifest.plugins[0].version, "0.2.0");
});

test("VERSIONED_MANIFESTS covers every checked adapter manifest", () => {
  assert.deepEqual(VERSIONED_MANIFESTS, [
    "plugin.json",
    ".cursor-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".codex-plugin/plugin.json",
  ]);
});

test("writeVersion persists semver to VERSION file", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "arcade-version-"));

  try {
    const version = writeVersion(tempRoot, "0.2.0");
    assert.equal(version, "0.2.0");
    assert.equal(readFileSync(join(tempRoot, "VERSION"), "utf8"), "0.2.0\n");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
