import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
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

test("VERSIONED_MANIFESTS covers every generated plugin manifest", () => {
  assert.deepEqual(VERSIONED_MANIFESTS, [
    "plugin.json",
    ".cursor-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".codex-plugin/plugin.json",
  ]);
});

test("writeVersion updates VERSION and the portable manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "arcade-version-"));
  writeFileSync(
    join(root, "plugin.json"),
    `${JSON.stringify({ name: "arcade", version: "0.1.0" }, null, 2)}\n`,
  );

  try {
    const version = writeVersion(root, "0.2.0");
    const plugin = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));

    assert.equal(version, "0.2.0");
    assert.equal(readFileSync(join(root, "VERSION"), "utf8"), "0.2.0\n");
    assert.equal(plugin.version, "0.2.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
