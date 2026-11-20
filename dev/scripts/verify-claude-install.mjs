#!/usr/bin/env node
// Installs both Claude bundles in temporary Claude configurations.
//
// Usage: node dev/scripts/verify-claude-install.mjs [repo-path]
// Uses `claude` from PATH. The repo path defaults to this checkout.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOSTS } from "../../plugin/hooks/hook-hosts.mjs";
import { defaultMcpUrl, validateClaudeDirectory } from "./claude-directory-policy.mjs";
import { buildHookManifest, CLAUDE_PLUGIN_DIR, PLUGIN_DIR } from "./generate-manifests.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb"];
// Shorter than the CI job limit, so a hung `claude` fails with its command named.
const CLAUDE_TIMEOUT_MS = 5 * 60_000;

/** The files git would commit: tracked plus untracked-but-not-ignored, minus deleted ones. */
function listFiles(root) {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const listed = [...new Set(output.split("\0").filter(Boolean))];
  return listed.filter((file) => lstatSync(join(root, file), { throwIfNoEntry: false })?.isFile());
}

function claude(args, env) {
  const result = spawnSync("claude", args, { env, encoding: "utf8", timeout: CLAUDE_TIMEOUT_MS });
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`claude ${args.join(" ")} did not finish within ${CLAUDE_TIMEOUT_MS / 60_000} minutes`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`claude ${args.join(" ")} exited with ${result.status}:\n${result.stdout}${result.stderr}`);
  }
}

function verifyInstall(copy, config, marketplace) {
  const plugin = marketplace.plugins[0].name;
  // Pass only PATH and the temp-folder, Windows system, and locale variables
  // below. Do not copy the parent environment.
  const env = { PATH: process.env.PATH ?? "", CLAUDE_CONFIG_DIR: config };
  for (const name of ["PATHEXT", "SystemRoot", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"]) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  claude(["plugin", "marketplace", "add", copy], env);
  claude(["plugin", "install", `${plugin}@${marketplace.name}`], env);

  const pluginCache = join(config, "plugins", "cache", marketplace.name, plugin);
  const versions = existsSync(pluginCache) ? readdirSync(pluginCache) : [];
  if (versions.length !== 1) {
    throw new Error(`expected one installed version under ${pluginCache}, found ${versions.length}`);
  }
  const installed = join(pluginCache, versions[0]);
  if (existsSync(join(installed, "AGENTS.md")) || existsSync(join(installed, "dev"))) {
    throw new Error(`${plugin}@${marketplace.name} ${versions[0]} installed repository files outside ${marketplace.plugins[0].source}`);
  }
  if (existsSync(join(installed, "node_modules"))) {
    throw new Error(`${plugin}@${marketplace.name} ${versions[0]} installed with node_modules, so Claude Code ran a package install`);
  }
  // Claude Code keeps node_modules only when the install succeeds, so a failed
  // or timed-out install shows up only as these files.
  const lockfile = LOCKFILES.find((file) => existsSync(join(installed, file)));
  if (lockfile && existsSync(join(installed, "package.json"))) {
    throw new Error(`${plugin}@${marketplace.name} ${versions[0]} installed with package.json and ${lockfile} at its root, so Claude Code tries a package install`);
  }
  for (const file of ["skills/try-arcade/SKILL.md", "skills/scale-arcade/SKILL.md", "agents/arcade-operator.agent.md", "commands/arcade-status.md"]) {
    if (!existsSync(join(installed, file))) throw new Error(`installed plugin is missing ${file}`);
  }
  const manifest = JSON.parse(readFileSync(join(installed, ".claude-plugin/plugin.json"), "utf8"));
  const expectedUrl = JSON.parse(readFileSync(join(copy, PLUGIN_DIR, "mcp.json"), "utf8")).mcpServers.arcade.url;
  if (defaultMcpUrl(manifest, manifest.mcpServers?.arcade?.url) !== expectedUrl) throw new Error("installed plugin is missing the default Arcade gateway");
  return { installed, manifest };
}

const repo = resolve(process.argv[2] ?? DEFAULT_ROOT);
const copy = mkdtempSync(join(tmpdir(), "plugin-copy-"));
const config = mkdtempSync(join(tmpdir(), "claude-config-"));
try {
  for (const file of listFiles(repo)) {
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(join(repo, file), join(copy, file));
  }

  const marketplacePath = join(copy, ".claude-plugin/marketplace.json");
  const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));
  const [entry] = marketplace.plugins;
  assert.equal(entry.source, `./${PLUGIN_DIR}`);
  const direct = verifyInstall(copy, join(config, "direct"), marketplace);
  assert.equal(direct.manifest.hooks, `./${HOSTS["claude-code"].manifest}`);
  const hooks = JSON.parse(readFileSync(join(direct.installed, direct.manifest.hooks), "utf8"));
  assert.deepEqual(hooks, buildHookManifest("claude-code"));
  console.log(`PASS: ${entry.name}@${marketplace.name} ${direct.manifest.version} installed from ${entry.source} with ${Object.keys(hooks.hooks).join(", ")}`);

  // Use a temporary marketplace to verify the files Claude copies from the directory bundle.
  const directoryEntry = { ...entry, source: `./${CLAUDE_PLUGIN_DIR}` };
  const directoryMarketplace = { ...marketplace, plugins: [directoryEntry] };
  writeFileSync(marketplacePath, JSON.stringify(directoryMarketplace));
  const directory = verifyInstall(copy, join(config, "directory"), directoryMarketplace);
  const problems = validateClaudeDirectory(directory.installed);
  if (problems.length) throw new Error(`installed plugin violates directory restrictions:\n${problems.join("\n")}`);
  console.log(`PASS: ${entry.name}@${marketplace.name} ${directory.manifest.version} installed from ${directoryEntry.source} and passes directory restrictions`);
} catch (error) {
  console.log(`FAIL: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  rmSync(copy, { recursive: true, force: true });
  rmSync(config, { recursive: true, force: true });
}
