#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readVersion } from "./version.mjs";
import { PLUGIN_DISPLAY_NAME, PLUGIN_LOGO } from "./constants.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const GENERATED_MANIFESTS = [
  "clients/cursor/mcp.json",
  "clients/claude/mcp.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
];

const readJson = (root, relativePath) =>
  JSON.parse(readFileSync(join(root, relativePath), "utf8"));

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

const identityFields = (portablePlugin) => {
  const {
    name,
    description,
    author,
    homepage,
    license,
    keywords,
  } = portablePlugin;
  return { name, description, author, homepage, license, keywords };
};

const listingFields = () => ({
  displayName: PLUGIN_DISPLAY_NAME,
  logo: PLUGIN_LOGO,
});

export const buildManifests = ({ portablePlugin, portableMcp, version }) => {
  if (portablePlugin.version !== version) {
    throw new Error(
      `plugin.json version ${portablePlugin.version} does not match VERSION ${version}`,
    );
  }

  const gateway = portableMcp.mcpServers?.arcade;
  if (!gateway?.url) {
    throw new Error('mcp.json must define mcpServers.arcade.url');
  }

  const shared = { ...identityFields(portablePlugin), version };
  const pluginHeaders = {
    "Arcade-Plugin": "arcade",
    "Arcade-Plugin-Version": version,
    ...(gateway.headers ?? {}),
  };
  const cursorMcp = {
    mcpServers: {
      arcade: {
        url: gateway.url,
        headers: pluginHeaders,
      },
    },
  };
  const claudeMcp = {
    mcpServers: {
      arcade: {
        type: "http",
        url: gateway.url,
        headers: pluginHeaders,
      },
    },
  };
  const cursorPlugin = {
    ...shared,
    ...listingFields(),
    skills: "skills",
    agents: "agents",
    commands: "commands",
    rules: "clients/cursor/rules",
    hooks: "clients/cursor/hooks/hooks.json",
    mcpServers: "clients/cursor/mcp.json",
  };
  const claudePlugin = {
    ...shared,
    mcpServers: "./clients/claude/mcp.json",
    hooks: ["./hooks/hooks.json", "./clients/claude/hooks/hooks.json"],
  };
  const codexPlugin = {
    ...shared,
    ...listingFields(),
    hooks: ["./hooks/hooks.json", "./com.openai/hooks/hooks.json"],
  };
  const marketplaceManifest = {
    $schema: "https://json.schemastore.org/claude-code-marketplace.json",
    name: portablePlugin.name,
    description: "Install Arcade in Claude Desktop, Cowork, and Claude Code.",
    version,
    owner: portablePlugin.author,
    plugins: [
      {
        name: portablePlugin.name,
        ...listingFields(),
        source: "./",
        description: portablePlugin.description,
        version,
        author: portablePlugin.author,
        homepage: portablePlugin.homepage,
        repository: portablePlugin.repository,
        license: portablePlugin.license,
        keywords: portablePlugin.keywords,
      },
    ],
  };

  return new Map([
    ["clients/cursor/mcp.json", cursorMcp],
    ["clients/claude/mcp.json", claudeMcp],
    [".cursor-plugin/plugin.json", cursorPlugin],
    [".claude-plugin/plugin.json", claudePlugin],
    [".claude-plugin/marketplace.json", marketplaceManifest],
    [".codex-plugin/plugin.json", codexPlugin],
  ]);
};

const writeIfChanged = (root, relativePath, content, checkOnly) => {
  const absolutePath = join(root, relativePath);
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

export function generateManifests({ check = false, root = ROOT } = {}) {
  const version = readVersion(root);
  const manifests = buildManifests({
    portablePlugin: readJson(root, "plugin.json"),
    portableMcp: readJson(root, "mcp.json"),
    version,
  });

  for (const [path, value] of manifests) {
    writeIfChanged(root, path, serialize(value), check);
  }

  return { version, manifestCount: manifests.size };
}

const isCli =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const check = process.argv.includes("--check");
  try {
    const result = generateManifests({ check });
    const mode = check ? "check" : "generate";
    console.log(
      `${mode}: ${result.manifestCount} host manifests from portable plugin (v${result.version})`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
