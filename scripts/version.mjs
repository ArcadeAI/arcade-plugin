/** Shared version file paths and sync helpers for check + bump scripts. */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const VERSION_FILE = "VERSION";

export const VERSIONED_MANIFESTS = [
  "plugin.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
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

export function syncVersionToManifests(root, version) {
  const parsed = parseVersion(version);
  writeFileSync(join(root, VERSION_FILE), `${parsed}\n`, "utf8");

  const written = [VERSION_FILE];
  for (const manifestPath of VERSIONED_MANIFESTS) {
    const abs = join(root, manifestPath);
    const manifest = JSON.parse(readFileSync(abs, "utf8"));
    applyVersionToJson(manifestPath, manifest, parsed);
    writeFileSync(abs, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    written.push(manifestPath);
  }

  return written;
}
