import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  GENERATED_PROJECTIONS,
  generateManifests,
} from "../scripts/generate-manifests.mjs";
import { readVersion } from "../scripts/version.mjs";
import { PLUGIN_DISPLAY_NAME } from "../scripts/constants.mjs";
import { readRepoJson, ROOT } from "./helpers.mjs";

const writeJson = (root, relativePath, value) => {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

const createFixture = async () => {
  const root = mkdtempSync(join(tmpdir(), "arcade-manifests-"));
  const version = readVersion(ROOT);
  writeFileSync(join(root, "VERSION"), `${version}\n`);
  writeJson(root, "plugin.json", await readRepoJson("plugin.json"));
  writeJson(root, "mcp.json", await readRepoJson("mcp.json"));
  const agentPath = "agents/arcade-operator.agent.md";
  mkdirSync(dirname(join(root, agentPath)), { recursive: true });
  writeFileSync(
    join(root, agentPath),
    readFileSync(join(ROOT, agentPath), "utf8"),
  );
  return root;
};

test("generateManifests matches committed host manifests", async () => {
  const version = readVersion(ROOT);
  const result = generateManifests({ check: true });

  assert.equal(result.version, version);
  assert.equal(result.projectionCount, GENERATED_PROJECTIONS.length);

  const portable = await readRepoJson("plugin.json");
  assert.equal(portable.version, version);
  assert.equal(
    portable.extensions?.["com.openai"]?.hooks,
    "./com.openai/hooks/hooks.json",
  );

  const mcp = await readRepoJson("mcp.json");
  assert.equal(mcp.mcpServers.arcade.type, "streamable-http");

  const cursorMcp = await readRepoJson("clients/cursor/mcp.json");
  assert.equal(cursorMcp.mcpServers.arcade.url, mcp.mcpServers.arcade.url);
  assert.equal(cursorMcp.mcpServers.arcade.type, undefined);

  const claudeMcp = await readRepoJson("clients/claude/mcp.json");
  assert.equal(claudeMcp.mcpServers.arcade.type, "http");
  assert.equal(claudeMcp.mcpServers.arcade.url, mcp.mcpServers.arcade.url);

  const cursorPlugin = await readRepoJson(".cursor-plugin/plugin.json");
  assert.equal(cursorPlugin.displayName, PLUGIN_DISPLAY_NAME);

  const codexPlugin = await readRepoJson(".codex-plugin/plugin.json");
  assert.equal(codexPlugin.displayName, PLUGIN_DISPLAY_NAME);
  assert.equal(codexPlugin.hooks, "./com.openai/hooks/hooks.json");
  assert.equal(codexPlugin.skills, undefined);
  assert.equal(codexPlugin.mcpServers, undefined);

  assert.equal(
    readFileSync(
      join(ROOT, "com.github.copilot/agents/arcade-operator.agent.md"),
      "utf8",
    ),
    readFileSync(join(ROOT, "agents/arcade-operator.agent.md"), "utf8"),
  );
});

test("generateManifests checks a temporary installed-artifact fixture", async () => {
  const root = await createFixture();

  try {
    generateManifests({ root });
    generateManifests({ check: true, root });

    const stalePath = join(root, ".codex-plugin/plugin.json");
    const stale = JSON.parse(readFileSync(stalePath, "utf8"));
    stale.description = `${stale.description} stale`;
    writeJson(root, ".codex-plugin/plugin.json", stale);

    assert.throws(
      () => generateManifests({ check: true, root }),
      /.codex-plugin\/plugin.json is out of date/,
    );

    generateManifests({ root });
    const agentProjection = join(
      root,
      "com.github.copilot/agents/arcade-operator.agent.md",
    );
    writeFileSync(
      agentProjection,
      `${readFileSync(agentProjection, "utf8")}stale\n`,
    );

    assert.throws(
      () => generateManifests({ check: true, root }),
      /com\.github\.copilot\/agents\/arcade-operator\.agent\.md is out of date/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
