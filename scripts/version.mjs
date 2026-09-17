/** Version helpers, bump CLI, and host-manifest regeneration entry point. */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const VERSION_FILE = "VERSION";

export const VERSIONED_MANIFESTS = [
  "plugin.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
];

export const SEMVER_PATTERN = String.raw`^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$`;
const SEMVER = new RegExp(SEMVER_PATTERN);

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

export function writeVersion(root, version) {
  const parsed = parseVersion(version);
  const pluginPath = join(root, "plugin.json");
  const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
  plugin.version = parsed;

  writeFileSync(join(root, VERSION_FILE), `${parsed}\n`, "utf8");
  writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`, "utf8");
  return parsed;
}

export function regenerateManifests(root = ROOT) {
  execFileSync("node", ["scripts/generate-manifests.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
}

export function bumpVersion(root, nextVersion) {
  const version = writeVersion(root, nextVersion);
  regenerateManifests(root);
  return version;
}

const isCli =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const nextVersion = process.argv[2];
  if (!nextVersion) {
    console.error("usage: node scripts/version.mjs <semver>");
    process.exit(1);
  }

  try {
    const version = bumpVersion(ROOT, nextVersion);
    console.log(`version: bumped to ${version} and regenerated manifests`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
