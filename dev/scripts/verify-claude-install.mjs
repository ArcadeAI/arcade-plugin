#!/usr/bin/env node
// Installs the plugin with Claude Code into a temporary config directory and
// fails if the installed copy has node_modules, which means Claude Code ran a
// package install. The Claude plugin directory holds such a version for a
// reviewer ("Dependencies install from a lockfile"):
// https://claude.com/docs/plugins/pre-submission-checklist
//
// Usage: node dev/scripts/verify-claude-install.mjs [repo-path]
// Uses `claude` from PATH. The repo path defaults to this checkout.

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
  const result = spawnSync("claude", args, { env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`claude ${args.join(" ")} exited with ${result.status}:\n${result.stdout}${result.stderr}`);
  }
}

/** Returns a success message, or throws with the reason the install is wrong. */
function verifyInstall(repo, copy, config) {
  for (const file of listFiles(repo)) {
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(join(repo, file), join(copy, file));
  }

  const marketplace = JSON.parse(readFileSync(join(copy, ".claude-plugin/marketplace.json"), "utf8"));
  const plugin = marketplace.plugins[0].name;
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config };
  claude(["plugin", "marketplace", "add", copy], env);
  claude(["plugin", "install", `${plugin}@${marketplace.name}`], env);

  const pluginCache = join(config, "plugins", "cache", marketplace.name, plugin);
  const versions = existsSync(pluginCache) ? readdirSync(pluginCache) : [];
  if (versions.length !== 1) {
    throw new Error(`expected one installed version under ${pluginCache}, found ${versions.length}`);
  }
  const installed = join(pluginCache, versions[0]);
  if (!existsSync(join(installed, ".claude-plugin", "plugin.json"))) {
    throw new Error(`${plugin}@${marketplace.name} ${versions[0]} installed without .claude-plugin/plugin.json`);
  }
  if (existsSync(join(installed, "node_modules"))) {
    throw new Error(`${plugin}@${marketplace.name} ${versions[0]} installed with node_modules, so Claude Code ran a package install`);
  }
  return `${plugin}@${marketplace.name} ${versions[0]} installed from ${repo} with no node_modules`;
}

const repo = resolve(process.argv[2] ?? DEFAULT_ROOT);
const copy = mkdtempSync(join(tmpdir(), "plugin-copy-"));
const config = mkdtempSync(join(tmpdir(), "claude-config-"));
try {
  console.log(`PASS: ${verifyInstall(repo, copy, config)}`);
} catch (error) {
  console.log(`FAIL: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  rmSync(copy, { recursive: true, force: true });
  rmSync(config, { recursive: true, force: true });
}
