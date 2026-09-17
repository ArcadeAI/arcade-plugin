import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
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
  assert.equal(codexPlugin.interface.displayName, PLUGIN_DISPLAY_NAME);
  assert.deepEqual(
    codexPlugin.interface,
    portable.extensions?.["com.openai"]?.interface,
  );
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

test("generateManifests accepts prerelease versions through adapter schemas", async () => {
  const root = await createFixture();
  const prerelease = "1.2.3-rc.1";

  try {
    writeFileSync(join(root, "VERSION"), `${prerelease}\n`);
    const plugin = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
    plugin.version = prerelease;
    writeJson(root, "plugin.json", plugin);

    generateManifests({ root });

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    for (const [docPath, schemaPath] of [
      [".cursor-plugin/plugin.json", "schemas/host-adapters/cursor-plugin.schema.json"],
      [
        ".codex-plugin/plugin.json",
        "schemas/host-adapters/codex-fallback-plugin.schema.json",
      ],
    ]) {
      const doc = JSON.parse(readFileSync(join(root, docPath), "utf8"));
      const schema = JSON.parse(readFileSync(join(ROOT, schemaPath), "utf8"));
      const validate = ajv.compile(schema);
      assert.equal(validate(doc), true, `${docPath}: ${JSON.stringify(validate.errors)}`);
      assert.equal(doc.version, prerelease);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
