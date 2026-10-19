import assert from "node:assert/strict";
import { test } from "node:test";
import { assertReleaseVersion } from "../scripts/sync-version.mjs";

const release = (sourceVersion, destinationVersion, options = {}) =>
  assertReleaseVersion({ sourceVersion, destinationVersion, tag: `v${sourceVersion}`, ...options });

test("a coordinated 0.8.0 release upgrades the legacy 0.7.1 version", () => {
  assert.doesNotThrow(() => release("0.8.0", "0.7.1"));
});

test("the old canonical 0.4.0 cannot downgrade legacy 0.7.1", () => {
  for (const sameTree of [false, true]) {
    assert.throws(() => release("0.4.0", "0.7.1", { sameTree }), /refusing version downgrade from 0\.7\.1 to 0\.4\.0/);
  }
});

test("numeric components compare by major, minor, then patch", () => {
  for (const [source, destination] of [["1.0.0", "0.99.99"], ["0.10.0", "0.9.99"], ["0.8.10", "0.8.9"]]) {
    assert.doesNotThrow(() => release(source, destination));
    assert.throws(() => release(destination, source), /refusing version downgrade/);
  }
});

test("equal versions permit an already identical snapshot only", () => {
  assert.doesNotThrow(() => release("0.8.0", "0.8.0", { sameTree: true }));
  for (const sameTree of [undefined, false, "true", 1]) {
    assert.throws(() => release("0.8.0", "0.8.0", { sameTree }), /already exists with different content/);
  }
});

test("a release requires its exact vX.Y.Z source tag", () => {
  for (const tag of [undefined, null, "", "0.8.0", "v0.7.1", "v0.8.0-beta.1", "refs/tags/v0.8.0"]) {
    assert.throws(() => release("0.8.0", "0.7.1", { tag }), /release tag must be v0\.8\.0/);
  }
});

test("both versions reject malformed, prerelease, build and leading-zero forms", () => {
  const invalid = [undefined, null, 8, "", "0.8", "0.8.0.1", "v0.8.0", "01.8.0", "0.08.0", "0.8.00", "0.8.0-beta.1", "0.8.0+build", "-1.8.0", "0.8.0\n", " 0.8.0"];
  for (const value of invalid) {
    assert.throws(() => release(value, "0.7.1"), /sourceVersion must be a stable X\.Y\.Z/);
    assert.throws(() => release("0.8.0", value), /destinationVersion must be a stable X\.Y\.Z/);
  }
});

test("large components compare exactly without Number overflow", () => {
  const smaller = "9007199254740992.0.0";
  const larger = "9007199254740993.0.0";
  assert.doesNotThrow(() => release(larger, smaller));
  assert.throws(() => release(smaller, larger), /refusing version downgrade/);
  assert.doesNotThrow(() => release(larger, larger, { sameTree: true }));
});
