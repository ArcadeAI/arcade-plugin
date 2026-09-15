/** Shared version file paths and read helpers for check + tests. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const VERSION_FILE = "VERSION";

export const VERSIONED_MANIFESTS = [
  "plugin.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
];

const SEMVER = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;

export function parseVersion(raw) {
  const version = raw.trim();
  if (!SEMVER.test(version)) {
    throw new Error(`invalid semver: ${version}`);
  }
  return version;
}

export function readVersion(root) {
  return parseVersion(readFileSync(join(root, VERSION_FILE), "utf8"));
}

export function applyVersionToJson(manifestPath, manifest, version) {
  manifest.version = version;
  if (manifestPath === ".claude-plugin/marketplace.json") {
    const listed = manifest.plugins?.[0];
    if (listed) {
      listed.version = version;
    }
  }
  return manifest;
}
