import assert from "node:assert/strict";
import { test } from "node:test";
import { ROUTING_MARKERS } from "../hooks/routing-guidance.mjs";
import {
  CLAUDE_CODE_CLI_VERSION,
  CI_NODE_VERSION,
  ENDPOINT,
  MCP_REMOTE_PACKAGE,
  PLUGINS_CLI_VERSION,
} from "../scripts/constants.mjs";
import { readRepoFile, readRepoJson } from "./helpers.mjs";

test("Cursor rule includes shared routing markers", async () => {
  const rule = await readRepoFile("clients/cursor/rules/arcade.mdc");
  for (const marker of ROUTING_MARKERS) {
    assert.match(rule, new RegExp(marker));
  }
});

test("mcp-remote pin is consistent across Claude Desktop config", async () => {
  const config = await readRepoFile("clients/claude-desktop/claude_desktop_config.json");

  assert.match(config, new RegExp(MCP_REMOTE_PACKAGE.replace(".", "\\.")));
  assert.match(config, new RegExp(ENDPOINT.replace(/\./g, "\\.")));
});

test("adapter manifest versions match VERSION", async () => {
  const version = (await readRepoFile("VERSION")).trim();
  const manifests = [
    "plugin.json",
    ".cursor-plugin/plugin.json",
    ".claude-plugin/plugin.json",
  ];

  for (const path of manifests) {
    const manifest = await readRepoJson(path);
    assert.equal(manifest.version, version, `${path} version drift`);
  }
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
