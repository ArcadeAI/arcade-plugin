import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROMPT_REMINDER,
  ROUTING_MARKERS,
  SESSION_CONTEXT,
  SUBAGENT_CONTEXT,
} from "../hooks/routing-guidance.mjs";
import {
  CLAUDE_CODE_CLI_VERSION,
  CI_NODE_VERSION,
  ENDPOINT,
  MCP_REMOTE_PACKAGE,
  PLUGINS_CLI_VERSION,
} from "../scripts/constants.mjs";
import { VERSIONED_MANIFESTS, readVersion } from "../scripts/version.mjs";
import { readRepoFile, readRepoJson, ROOT } from "./helpers.mjs";

test("Cursor rule includes shared routing markers", async () => {
  const rule = await readRepoFile("clients/cursor/rules/arcade.mdc");
  for (const marker of ROUTING_MARKERS) {
    assert.match(rule, new RegExp(marker));
  }
});

test("hook guidance strings include shared routing markers", () => {
  for (const surface of [SESSION_CONTEXT, PROMPT_REMINDER, SUBAGENT_CONTEXT]) {
    for (const marker of ROUTING_MARKERS) {
      assert.match(surface, new RegExp(marker));
    }
  }
});

test("mcp-remote pin is consistent across Claude Desktop config", async () => {
  const config = await readRepoFile("clients/claude-desktop/claude_desktop_config.json");

  assert.match(config, new RegExp(MCP_REMOTE_PACKAGE.replace(".", "\\.")));
  assert.match(config, new RegExp(ENDPOINT.replace(/\./g, "\\.")));
});

test("adapter manifest versions match VERSION", async () => {
  const version = readVersion(ROOT);

  for (const path of VERSIONED_MANIFESTS) {
    const manifest = await readRepoJson(path);
    assert.equal(manifest.version, version, `${path} version drift`);
  }

  const marketplace = await readRepoJson(".claude-plugin/marketplace.json");
  assert.equal(
    marketplace.plugins?.[0]?.version,
    version,
    ".claude-plugin/marketplace.json plugins[0] version drift",
  );
});

test("release-please config syncs every VERSIONed manifest", async () => {
  const config = await readRepoJson("release-please-config.json");
  const pkg = config.packages?.["."];
  const extraPaths = new Set((pkg?.["extra-files"] ?? []).map((entry) => entry.path));

  assert.equal(pkg?.["version-file"], "VERSION");

  for (const path of VERSIONED_MANIFESTS) {
    assert.ok(extraPaths.has(path), `release-please-config.json must list ${path}`);
  }

  const workflow = await readRepoFile(".github/workflows/release-please.yml");
  assert.match(workflow, /release-please-action@v4/);
});
test("CI toolchain versions are pinned in package.json", async () => {
  const packageJson = await readRepoJson("package.json");
  assert.equal(packageJson.devDependencies?.plugins, PLUGINS_CLI_VERSION);
  assert.equal(
    packageJson.devDependencies?.["@anthropic-ai/claude-code"],
    CLAUDE_CODE_CLI_VERSION,
  );
  assert.equal(packageJson.engines?.node, CI_NODE_VERSION);
  assert.equal(packageJson.scripts?.["verify:discover"], "plugins discover .");
  assert.equal(
    packageJson.scripts?.["verify:claude"],
    "claude plugin validate .",
  );

  const workflow = await readRepoFile(".github/workflows/check.yml");
  assert.match(workflow, new RegExp(`node-version: "${CI_NODE_VERSION}"`));
});
