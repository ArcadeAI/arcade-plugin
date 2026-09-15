#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readVersion } from "./version.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_PATH = "contract/plugin.contract.json";
const IDENTITY_PATH = "contract/identity.json";
const INVENTORY_PATH = "contract/inventory.json";

export const GENERATED_MANIFESTS = [
  "plugin.json",
  "mcp.json",
  "clients/cursor/mcp.json",
  "clients/claude/mcp.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
];

const readJson = (relativePath) =>
  JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

const identityFields = (contract) => {
  const { name, description, author, homepage, license, keywords } = contract.identity;
  return { name, description, author, homepage, license, keywords };
};

const listingFields = (contract) => {
  const { displayName, logo } = contract.marketplace;
  const fields = { displayName };
  if (logo) fields.logo = logo;
  return fields;
};

const buildManifests = (contract, version) => {
  const { identity, gateway, hosts, marketplace, schemas } = contract;
  const shared = { ...identityFields(contract), version };

  const portablePlugin = {
    $schema: schemas.plugin,
    ...identityFields(contract),
    version,
    repository: identity.repository,
  };

  const portableMcp = {
    $schema: schemas.mcp,
    mcpServers: {
      [gateway.serverName]: {
        type: gateway.transports.portable,
        url: gateway.url,
      },
    },
  };

  const cursorMcp = {
    mcpServers: {
      [gateway.serverName]: {
        url: gateway.url,
      },
    },
  };

  const claudeMcp = {
    mcpServers: {
      [gateway.serverName]: {
        type: gateway.transports.claude,
        url: gateway.url,
      },
    },
  };

  const cursorPlugin = {
    ...shared,
    ...listingFields(contract),
    ...hosts.cursor,
  };

  const claudePlugin = {
    ...shared,
    mcpServers: hosts.claude.mcpServers,
  };

  const codexPlugin = {
    ...shared,
    ...listingFields(contract),
    skills: hosts.codex.skills,
    hooks: hosts.codex.hooks,
    mcpServers: hosts.codex.mcpServers,
  };

  const marketplaceManifest = {
    $schema: schemas.marketplace,
    name: identity.name,
    description: marketplace.description,
    version,
    owner: marketplace.owner,
    plugins: [
      {
        name: identity.name,
        ...listingFields(contract),
        source: "./",
        description: identity.description,
        version,
        author: identity.author,
        homepage: identity.homepage,
        repository: identity.repository,
        license: identity.license,
        keywords: identity.keywords,
      },
    ],
  };

  return new Map([
    ["plugin.json", portablePlugin],
    ["mcp.json", portableMcp],
    ["clients/cursor/mcp.json", cursorMcp],
    ["clients/claude/mcp.json", claudeMcp],
    [".cursor-plugin/plugin.json", cursorPlugin],
    [".claude-plugin/plugin.json", claudePlugin],
    [".claude-plugin/marketplace.json", marketplaceManifest],
    [".codex-plugin/plugin.json", codexPlugin],
  ]);
};

const collectComponentPaths = (contract) => {
  const paths = new Set();
  const add = (value) => {
    if (typeof value === "string") {
      paths.add(value.replace(/^\.\//, ""));
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) add(entry);
    }
  };

  for (const host of Object.values(contract.hosts)) {
    for (const value of Object.values(host)) add(value);
  }
  add(contract.marketplace?.logo);

  return [...paths].sort();
};

const buildInventory = (manifestContents) => {
  const manifests = GENERATED_MANIFESTS.map((path) => ({
    path,
    sha256: sha256(manifestContents.get(path)),
  }));

  return {
    schema_version: 1,
    manifests,
    components: collectComponentPaths(readJson(CONTRACT_PATH)),
  };
};

const buildIdentity = (version, inventoryContent) => ({
  schema_version: 1,
  plugin_version: version,
  inventory_sha256: sha256(inventoryContent),
});

const writeIfChanged = (relativePath, content, checkOnly) => {
  const absolutePath = join(ROOT, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  if (checkOnly) {
    const current = readFileSync(absolutePath, "utf8");
    if (current !== content) {
      throw new Error(`${relativePath} is out of date — run npm run generate`);
    }
    return;
  }

  writeFileSync(absolutePath, content, "utf8");
};

export function generateManifests({ check = false } = {}) {
  const contract = readJson(CONTRACT_PATH);
  const version = readVersion(ROOT);
  const manifests = buildManifests(contract, version);
  const manifestContents = new Map(
    [...manifests.entries()].map(([path, value]) => [path, serialize(value)]),
  );

  for (const [path, content] of manifestContents) {
    writeIfChanged(path, content, check);
  }

  const inventory = buildInventory(manifestContents);
  const inventoryContent = serialize(inventory);
  writeIfChanged(INVENTORY_PATH, inventoryContent, check);

  const identity = buildIdentity(version, inventoryContent);
  const identityContent = serialize(identity);
  writeIfChanged(IDENTITY_PATH, identityContent, check);

  return {
    version,
    manifestCount: manifests.size,
    componentCount: inventory.components.length,
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const check = process.argv.includes("--check");
  try {
    const result = generateManifests({ check });
    const mode = check ? "check" : "generate";
    console.log(
      `${mode}: ${result.manifestCount} manifests, ${result.componentCount} component paths (v${result.version})`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
