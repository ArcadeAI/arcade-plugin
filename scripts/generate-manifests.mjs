#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readVersion } from "./version.mjs";
import { PLUGIN_DISPLAY_NAME } from "./constants.mjs";
import {
  CODEX_FALLBACK_MCP_PATH,
  readOpenAiInterface,
} from "./openai-extension.mjs";
import {
  GATEWAY_RULES_DELEGATE,
  GATEWAY_RULES_PARENT,
  SESSION_CONTEXT,
} from "../hooks/routing-guidance.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const GENERATED_MANIFESTS = [
  "clients/cursor/mcp.json",
  "clients/claude/mcp.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
];

export const GENERATED_PROJECTIONS = [
  ...GENERATED_MANIFESTS,
  "com.github.copilot/agents/arcade-operator.agent.md",
  "clients/cursor/rules/arcade.mdc",
];

/** Hand-written files that contain one generated block of routing rules. */
export const FILES_WITH_GENERATED_RULES = {
  "agents/arcade-operator.agent.md": GATEWAY_RULES_DELEGATE,
  "skills/try-arcade/SKILL.md": GATEWAY_RULES_PARENT,
};

export const RULES_BLOCK_BEGIN =
  "<!-- BEGIN generated from hooks/routing-guidance.mjs by `npm run generate`; edit that file, not this block -->";
export const RULES_BLOCK_END = "<!-- END generated -->";

const COPILOT_AGENT_NOTE =
  "<!-- Generated copy of agents/arcade-operator.agent.md by `npm run generate`. " +
  "Copilot CLI and VS Code only load agents from com.github.copilot/agents/. " +
  "Edit the source file, not this one. -->";

// Keeps generated Markdown readable in diffs; hosts ignore the line breaks.
const wrapText = (text, width = 78) => {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
};

export const fillRulesBlock = (text, rules, relativePath) => {
  const begin = text.indexOf(RULES_BLOCK_BEGIN);
  const end = text.indexOf(RULES_BLOCK_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`${relativePath} is missing the generated rules block markers`);
  }
  return (
    text.slice(0, begin + RULES_BLOCK_BEGIN.length) +
    `\n${wrapText(rules)}\n` +
    text.slice(end)
  );
};

const buildCursorRule = () =>
  [
    "---",
    "description: Prefer Arcade for external service tasks",
    "alwaysApply: true",
    "---",
    "",
    "<!-- Generated from hooks/routing-guidance.mjs by `npm run generate`. Edit that file, not this one. -->",
    "",
    wrapText(SESSION_CONTEXT),
    "",
  ].join("\n");

const addCopilotNote = (operatorText) => {
  const frontmatterEnd = operatorText.indexOf("\n---\n", 4) + "\n---\n".length;
  return (
    operatorText.slice(0, frontmatterEnd) +
    `\n${COPILOT_AGENT_NOTE}\n` +
    operatorText.slice(frontmatterEnd)
  );
};

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

const listingFields = () => ({ displayName: PLUGIN_DISPLAY_NAME });

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
  const cursorMcp = {
    mcpServers: {
      arcade: { url: gateway.url },
    },
  };
  const claudeMcp = {
    mcpServers: {
      arcade: { type: "http", url: gateway.url },
    },
  };
  const cursorPlugin = {
    ...shared,
    ...listingFields(),
    repository: portablePlugin.repository,
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
  };
  const openAiInterface = readOpenAiInterface(portablePlugin);
  if (!openAiInterface?.displayName) {
    throw new Error(
      "plugin.json must define extensions.com.openai.interface.displayName",
    );
  }
  // Codex's .codex-plugin format only looks for ".mcp.json" by default, so the
  // fallback has to point at the portable mcp.json explicitly.
  const codexPlugin = {
    ...shared,
    mcpServers: CODEX_FALLBACK_MCP_PATH,
    interface: openAiInterface,
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
        displayName: PLUGIN_DISPLAY_NAME,
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

  for (const [path, rules] of Object.entries(FILES_WITH_GENERATED_RULES)) {
    const current = readFileSync(join(root, path), "utf8");
    writeIfChanged(root, path, fillRulesBlock(current, rules, path), check);
  }

  writeIfChanged(root, "clients/cursor/rules/arcade.mdc", buildCursorRule(), check);

  const operator = fillRulesBlock(
    readFileSync(join(root, "agents/arcade-operator.agent.md"), "utf8"),
    GATEWAY_RULES_DELEGATE,
    "agents/arcade-operator.agent.md",
  );
  writeIfChanged(
    root,
    "com.github.copilot/agents/arcade-operator.agent.md",
    addCopilotNote(operator),
    check,
  );

  return { version, projectionCount: GENERATED_PROJECTIONS.length };
}

const isCli =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const check = process.argv.includes("--check");
  try {
    const result = generateManifests({ check });
    const mode = check ? "check" : "generate";
    console.log(
      `${mode}: ${result.projectionCount} host projections from portable sources (v${result.version})`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
