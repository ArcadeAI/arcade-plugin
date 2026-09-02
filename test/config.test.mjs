import assert from "node:assert/strict";
import { test } from "node:test";
import { ROUTING_MARKERS } from "../hooks/routing-guidance.mjs";
import {
  CLAUDE_CODE_CLI_VERSION,
  CI_NODE_VERSION,
  ENDPOINT,
  MCP_REMOTE_PACKAGE,
  MCPB_DOCUMENTATION_URL,
  PLUGINS_CLI_VERSION,
} from "../scripts/constants.mjs";
import { readRepoFile, readRepoJson } from "./helpers.mjs";

test("Cursor rule includes shared routing markers", async () => {
  const rule = await readRepoFile("clients/cursor/rules/arcade.mdc");
  for (const marker of ROUTING_MARKERS) {
    assert.match(rule, new RegExp(marker));
  }
});

test("MCPB manifest documents the monorepo install guide", async () => {
  const manifest = await readRepoJson("clients/claude-desktop/mcpb/manifest.json");
  assert.equal(manifest.documentation, MCPB_DOCUMENTATION_URL);
});

test("mcp-remote pin is consistent across Claude Desktop surfaces", async () => {
  const config = await readRepoFile("clients/claude-desktop/claude_desktop_config.json");
  const manifest = await readRepoFile("clients/claude-desktop/mcpb/manifest.json");
  const buildScript = await readRepoFile("scripts/build-claude-desktop-mcpb.mjs");

  for (const surface of [config, manifest]) {
    assert.match(surface, new RegExp(MCP_REMOTE_PACKAGE.replace(".", "\\.")));
    assert.match(surface, new RegExp(ENDPOINT.replace(/\./g, "\\.")));
  }

  assert.match(buildScript, /MCP_REMOTE_PACKAGE/);
  assert.match(buildScript, /from "\.\/constants\.mjs"/);
});

test("adapter manifest versions match VERSION", async () => {
  const version = (await readRepoFile("VERSION")).trim();
  const manifests = [
    "plugin.json",
    ".cursor-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    "clients/claude-desktop/mcpb/manifest.json",
  ];

  for (const path of manifests) {
    const manifest = await readRepoJson(path);
    assert.equal(manifest.version, version, `${path} version drift`);
  }
});

test("README describes personal trial use", async () => {
  const readme = await readRepoFile("README.md");
  assert.match(readme, /personal trial/i);
});

test("CI toolchain versions are pinned in package.json", async () => {
  const packageJson = await readRepoJson("package.json");
  assert.equal(packageJson.devDependencies?.plugins, PLUGINS_CLI_VERSION);
  assert.equal(
    packageJson.devDependencies?.["@anthropic-ai/claude-code"],
    CLAUDE_CODE_CLI_VERSION,
  );
  assert.equal(packageJson.scripts?.["verify:discover"], "plugins discover .");
  assert.equal(
    packageJson.scripts?.["verify:claude"],
    "claude plugin validate .",
  );

  for (const workflow of [".github/workflows/check.yml", ".github/workflows/release.yml"]) {
    const content = await readRepoFile(workflow);
    assert.match(content, new RegExp(`node-version: "${CI_NODE_VERSION}"`));
  }
});
