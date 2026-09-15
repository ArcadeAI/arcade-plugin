import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  GENERATED_MANIFESTS,
  HOOK_MANIFESTS,
  generateManifests,
} from "../scripts/generate-manifests.mjs";
import { readVersion } from "../scripts/version.mjs";
import { readRepoFile, readRepoJson, ROOT } from "./helpers.mjs";

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

test("generateManifests matches committed golden manifests", async () => {
  const version = readVersion(ROOT);
  const contract = await readRepoJson("contract/plugin.contract.json");
  const result = generateManifests({ check: true });

  assert.equal(result.version, version);
  assert.equal(result.manifestCount, GENERATED_MANIFESTS.length);

  const portable = await readRepoJson("plugin.json");
  assert.equal(portable.$schema, contract.schemas.plugin);
  assert.equal(portable.name, contract.identity.name);
  assert.equal(portable.version, version);
  assert.equal(portable.repository, contract.identity.repository);

  const mcp = await readRepoJson("mcp.json");
  assert.equal(
    mcp.mcpServers[contract.gateway.serverName].type,
    contract.gateway.transports.portable,
  );
  assert.equal(mcp.mcpServers[contract.gateway.serverName].url, contract.gateway.url);

  const cursorMcp = await readRepoJson("clients/cursor/mcp.json");
  assert.equal(
    cursorMcp.mcpServers[contract.gateway.serverName].url,
    contract.gateway.url,
  );
  assert.equal(cursorMcp.mcpServers[contract.gateway.serverName].type, undefined);

  const claudeMcp = await readRepoJson("clients/claude/mcp.json");
  assert.equal(
    claudeMcp.mcpServers[contract.gateway.serverName].type,
    contract.gateway.transports.claude,
  );

  const cursorPlugin = await readRepoJson(".cursor-plugin/plugin.json");
  assert.equal(cursorPlugin.displayName, contract.marketplace.displayName);
  assert.equal(cursorPlugin.logo, contract.marketplace.logo);
  for (const key of ["skills", "agents", "commands", "rules", "hooks", "mcpServers"]) {
    assert.equal(cursorPlugin[key], contract.hosts.cursor[key]);
  }

  const marketplace = await readRepoJson(".claude-plugin/marketplace.json");
  assert.equal(marketplace.plugins[0].displayName, contract.marketplace.displayName);
  assert.equal(marketplace.plugins[0].logo, contract.marketplace.logo);

  const codexPlugin = await readRepoJson(".codex-plugin/plugin.json");
  assert.equal(codexPlugin.displayName, contract.marketplace.displayName);
  assert.equal(codexPlugin.logo, contract.marketplace.logo);
  assert.deepEqual(codexPlugin.hooks, contract.hosts.codex.hooks);
  assert.equal(codexPlugin.skills, contract.hosts.codex.skills);
  assert.equal(codexPlugin.mcpServers, contract.hosts.codex.mcpServers);
});

test("inventory records manifest digests and declared component paths", async () => {
  const inventory = await readRepoJson("contract/inventory.json");
  const identity = await readRepoJson("contract/identity.json");
  const inventoryRaw = await readRepoFile("contract/inventory.json");

  assert.equal(identity.inventory_sha256, sha256(inventoryRaw));
  assert.equal(inventory.manifests.length, GENERATED_MANIFESTS.length);

  for (const entry of inventory.manifests) {
    const content = await readRepoFile(entry.path);
    assert.equal(entry.sha256, sha256(content), `${entry.path} digest drift`);
  }

  assert.ok(inventory.components.includes("skills"));
  assert.ok(inventory.components.includes("hooks/hooks.json"));
  assert.ok(inventory.components.includes("com.openai/hooks/hooks.json"));

  assert.equal(inventory.hook_manifests.length, HOOK_MANIFESTS.length);
  for (const entry of inventory.hook_manifests) {
    const content = await readRepoFile(entry.path);
    assert.equal(entry.sha256, sha256(content), `${entry.path} hook digest drift`);
  }
});

test("generateManifests --check fails when a manifest is stale", async () => {
  const plugin = await readRepoJson("plugin.json");
  const stale = { ...plugin, description: `${plugin.description} stale` };
  const original = await readRepoFile("plugin.json");
  const { writeFile } = await import("node:fs/promises");
  const path = await import("node:path");

  await writeFile(path.join(ROOT, "plugin.json"), `${JSON.stringify(stale, null, 2)}\n`);

  try {
    assert.throws(() => generateManifests({ check: true }), /out of date/);
  } finally {
    await writeFile(path.join(ROOT, "plugin.json"), original);
    generateManifests({ check: true });
  }
});
