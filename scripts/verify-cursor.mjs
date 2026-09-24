// Runs Cursor's plugin validator (cursor/plugin-template) against this repo.
//
// Cursor publishes the validator without a license, so this script downloads
// it at a pinned commit and checks its hash instead of copying it into the
// repo. To update it, change VALIDATOR_COMMIT and VALIDATOR_SHA256 together.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VALIDATOR_COMMIT = "bf795ee9a28e6d8b2e013beb9ac47fdd6d573fb7";
const VALIDATOR_SHA256 = "826f55f546ce59500a6e3d7d32a15d90f3373cecc3b41486e75ae28b60647a4a";
const VALIDATOR_URL = `https://raw.githubusercontent.com/cursor/plugin-template/${VALIDATOR_COMMIT}/scripts/validate-template.mjs`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const response = await fetch(VALIDATOR_URL);
if (!response.ok) {
  console.error(`Could not download Cursor's validator (${response.status}): ${VALIDATOR_URL}`);
  process.exit(1);
}
const validator = await response.text();
const hash = createHash("sha256").update(validator).digest("hex");
if (hash !== VALIDATOR_SHA256) {
  console.error(`Cursor's validator at ${VALIDATOR_COMMIT} has sha256 ${hash}, expected ${VALIDATOR_SHA256}.`);
  process.exit(1);
}

// The validator only reads plugins listed in .cursor-plugin/marketplace.json.
// This repo is a single plugin and has no marketplace file, so the check runs
// on a copy of the tracked files with a one-entry marketplace file added.
const work = mkdtempSync(join(tmpdir(), "arcade-cursor-validate-"));
let status = 1;
try {
  const copy = join(work, "repo");
  const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if (tracked.status !== 0) {
    throw new Error(`git ls-files failed: ${tracked.stderr}`);
  }
  for (const file of tracked.stdout.split("\0").filter(Boolean)) {
    if (!existsSync(join(root, file))) continue;
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(join(root, file), join(copy, file));
  }

  const plugin = JSON.parse(readFileSync(join(root, ".cursor-plugin/plugin.json"), "utf8"));
  const marketplace = {
    name: plugin.name,
    owner: { name: plugin.author.name },
    plugins: [{ name: plugin.name, source: "." }],
  };
  writeFileSync(join(copy, ".cursor-plugin/marketplace.json"), `${JSON.stringify(marketplace, null, 2)}\n`);

  const validatorPath = join(work, "validate-template.mjs");
  writeFileSync(validatorPath, validator);
  status = spawnSync(process.execPath, [validatorPath], { cwd: copy, stdio: "inherit" }).status ?? 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(status);
