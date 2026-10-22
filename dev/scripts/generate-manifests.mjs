#!/usr/bin/env node
// Writes every client-specific file from the sources listed in
// ARCHITECTURE.md. `--check` fails instead of writing if anything is stale.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURSOR_RULE,
  OPERATOR_RULES,
  SKILL_RULES,
} from "../../plugin/hooks/routing-guidance.mjs";
import { HOOK_TIMEOUT_SEC, HOOKS, HOSTS } from "../../plugin/hooks/hook-hosts.mjs";
import { fillTelemetryTables, TELEMETRY_DOC } from "./telemetry-docs.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Shipped plugin files live here. Marketplace catalogs and .gitattributes stay
// at the repo root and point at this directory.
export const PLUGIN_DIR = "plugin";

const inPlugin = (file) => `${PLUGIN_DIR}/${file}`;

// One policy URL for both clients. The other OpenAI directory fields below are
// written into plugin/plugin.json from here too. Identity text (name, descriptions,
// category, website, logo) stays in plugin/plugin.json.
const privacyPolicyUrl = "https://www.arcade.dev/privacy-policy/";
const openaiSupportUrl = "https://support.arcade.dev";
const openaiTermsUrl = "https://www.arcade.dev/terms-of-service/";

const OPENAI_CAPABILITIES = [
  "Read and search email",
  "Check calendar events",
  "Find issues and pull requests",
  "Read team chat",
  "Draft messages for your confirmation",
];

const OPENAI_DEFAULT_PROMPTS = [
  "What's on my calendar tomorrow?",
  "Summarize my unread email from this week.",
  "Which GitHub issues are assigned to me?",
];

// Tool names are the MCP forms of Arcade toolkit tools (dots become underscores).
// demo_recording_url is a real review field and is required before MCP review,
// but a ZIP may omit it. No recording URL is published here; omitting the field
// leaves any value already saved in the dashboard.
const OPENAI_REVIEW = {
  test_cases: {
    positive: [
      {
        description: "Summarize unread email in the connected Gmail account",
        prompt: "Summarize my unread email from the last 7 days.",
        tools_triggered: "Gmail_ListEmails",
        expected_behavior: "Lists the seeded unread test emails (sender, subject, one-line summary each) from the reviewer Gmail account. No email is changed or marked read.",
      },
      {
        description: "Read tomorrow's calendar",
        prompt: "What's on my calendar tomorrow?",
        tools_triggered: "GoogleCalendar_ListEvents",
        expected_behavior: "Returns the seeded recurring test events for tomorrow with times and titles from the reviewer Google Calendar. Nothing is created or changed.",
      },
      {
        description: "Find GitHub issues assigned to the user",
        prompt: "Which open GitHub issues are assigned to me in arcade-review/sample-tracker?",
        tools_triggered: "Github_ListIssues",
        expected_behavior: "Lists the seeded open issues assigned to the reviewer GitHub account in the sample repo, with titles and links.",
      },
      {
        description: "Read recent messages in a Slack channel",
        prompt: "What did people say in #launch-plan on Slack this week?",
        tools_triggered: "Slack_GetMessages",
        expected_behavior: "Summarizes the seeded messages in #launch-plan in the review Slack workspace and names who said what. Nothing is posted.",
      },
      {
        description: "Draft an email and stop for confirmation",
        prompt: "Draft a reply to the 'Q4 venue options' email saying Thursday works, but don't send it.",
        tools_triggered: "Gmail_ListEmails, Gmail_WriteDraftReplyEmail",
        expected_behavior: "Shows the draft text and recipient, asks before saving, then saves it as a Gmail draft. The email is not sent.",
      },
    ],
    negative: [
      {
        description: "General knowledge question that needs no connected app",
        prompt: "What's the difference between TCP and UDP?",
      },
      {
        description: "Request outside any connected app (payments)",
        prompt: "Send $50 to my landlord on Venmo.",
      },
      {
        description: "Irreversible bulk action without a confirmed target",
        prompt: "Delete every email in my inbox.",
      },
    ],
  },
  commerce: false,
  commerce_description: "Arcade does not sell products or process payments.",
};

// No version number: Release Please bumps VERSION without rewriting this note.
const OPENAI_PUBLICATION = {
  countries: ["US"],
  release_notes: "Initial OpenAI directory release. Two skills (try-arcade, scale-arcade) and the Arcade MCP gateway at https://api.arcade.dev/mcp/arcade. No hooks, commands, or agents.",
};

const GENERATED_INTERFACE_KEYS = ["capabilities", "supportURL", "privacyPolicyURL", "termsOfServiceURL", "defaultPrompt"];

/** Writes the OpenAI directory fields. Other interface keys in plugin.json are kept. */
const applyOpenAiDirectory = (openai) => {
  const {
    displayName,
    shortDescription,
    longDescription,
    developerName,
    category,
    websiteURL,
    logo,
    composerIcon,
    ...rest
  } = openai.interface;
  for (const key of GENERATED_INTERFACE_KEYS) delete rest[key];
  openai.interface = {
    displayName,
    shortDescription,
    longDescription,
    developerName,
    category,
    capabilities: OPENAI_CAPABILITIES,
    websiteURL,
    supportURL: openaiSupportUrl,
    privacyPolicyURL: privacyPolicyUrl,
    termsOfServiceURL: openaiTermsUrl,
    defaultPrompt: OPENAI_DEFAULT_PROMPTS,
    logo,
    composerIcon,
    ...rest,
  };
  openai.review = OPENAI_REVIEW;
  openai.publication = OPENAI_PUBLICATION;
};

// Marketplace support contact; plugin author metadata still comes from plugin.json.
export const ACCEPTED_LISTING_OWNER_EMAIL = "support@arcade.dev";

// Claude Code and Cowork only accept the operator at the default agents/ path
// (the CLI wants .md paths in "agents", Cowork wants folders). Copilot CLI and
// VS Code only read com.github.copilot/agents/, so that folder gets a copy.
const OPERATOR = inPlugin("agents/arcade-operator.agent.md");
const CURSOR_RULE_DIR = "clients/cursor/rules";
const ROUTING_SOURCE = inPlugin("hooks/routing-guidance.mjs");
const HOOK_HOSTS_SOURCE = inPlugin("hooks/hook-hosts.mjs");
const TELEMETRY_SOURCE = inPlugin("hooks/telemetry-contract.mjs");
const PLUGIN_JSON = inPlugin("plugin.json");
const MCP_JSON = inPlugin("mcp.json");
const VERSION_FILE = inPlugin("VERSION");

/** Hand-written files that contain one generated block of routing rules. */
export const FILES_WITH_GENERATED_RULES = {
  [OPERATOR]: OPERATOR_RULES,
  [inPlugin("skills/try-arcade/SKILL.md")]: SKILL_RULES,
};

/** Hand-written files whose event tables are generated from hooks/telemetry-contract.mjs. */
export const FILES_WITH_GENERATED_TABLES = [TELEMETRY_DOC];

/** Generated copy → the file it is copied from. */
export const COPIED_FILES = {
  // Each skill folder has to work on its own.
  [inPlugin("skills/scale-arcade/references/arcade-docs.md")]: inPlugin("skills/try-arcade/references/arcade-docs.md"),
  [inPlugin("com.github.copilot/agents/arcade-operator.agent.md")]: OPERATOR,
  // The repository LICENSE stays at the root; the plugin directory has its own copy.
  [inPlugin("LICENSE")]: "LICENSE",
};

/**
 * Source files for each generated or partially-generated path. Used in error
 * messages so a person who hand-edits a generated file knows what to edit
 * instead. Every path that buildFiles adds to its output map must have an
 * entry here — buildFiles throws if one is missing.
 */
export const FILE_SOURCES = {
  // extensions.com.openai listing URLs, capabilities, defaultPrompt, review, and publication.
  [PLUGIN_JSON]: ["dev/scripts/generate-manifests.mjs"],
  // plugin.json and mcp.json supply identity and the gateway URL; VERSION
  // supplies the version; hook-hosts.mjs supplies the hooks manifest path; the
  // script writes the fixed skills/agents/commands/rules paths.
  [inPlugin(".cursor-plugin/plugin.json")]: [PLUGIN_JSON, MCP_JSON, VERSION_FILE, HOOK_HOSTS_SOURCE, "dev/scripts/generate-manifests.mjs"],
  // The script writes the mcpServers transport type.
  [inPlugin(".claude-plugin/plugin.json")]: [PLUGIN_JSON, MCP_JSON, VERSION_FILE, HOOK_HOSTS_SOURCE, "dev/scripts/generate-manifests.mjs"],
  // The script writes the marketplace description and support email. There is no version field.
  ".claude-plugin/marketplace.json": [PLUGIN_JSON, "dev/scripts/generate-manifests.mjs"],
  // Cursor's multi-plugin manifest. The plugin directory is "plugin".
  ".cursor-plugin/marketplace.json": [PLUGIN_JSON, "dev/scripts/generate-manifests.mjs"],
  // The script writes the frontmatter and the header comment.
  [inPlugin(`${CURSOR_RULE_DIR}/arcade.mdc`)]: [ROUTING_SOURCE, "dev/scripts/generate-manifests.mjs"],
  // The hook manifest paths in the list come from hook-hosts.mjs.
  ".gitattributes": [HOOK_HOSTS_SOURCE, "dev/scripts/generate-manifests.mjs"],
  // hook-hosts.mjs supplies the events, scripts, and timeout; the script writes
  // the version, entry type, nesting, and command template. With telemetry
  // enabled, the adapter that hook-hosts.mjs names supplies telemetry entries.
  ...Object.fromEntries(
    Object.values(HOSTS).map((h) => [inPlugin(h.manifest), [HOOK_HOSTS_SOURCE, "dev/scripts/generate-manifests.mjs"]]),
  ),
  [inPlugin("skills/scale-arcade/references/arcade-docs.md")]: [inPlugin("skills/try-arcade/references/arcade-docs.md")],
  // A copy of the operator with its rules block filled in.
  [inPlugin("com.github.copilot/agents/arcade-operator.agent.md")]: [OPERATOR, ROUTING_SOURCE],
  [inPlugin("LICENSE")]: ["LICENSE"],
  [OPERATOR]: [ROUTING_SOURCE],
  [inPlugin("skills/try-arcade/SKILL.md")]: [ROUTING_SOURCE],
  [TELEMETRY_DOC]: [TELEMETRY_SOURCE],
};

/** Formats an array of source paths as a human-readable list. */
const joinSources = (sources) => {
  if (sources.length === 1) return sources[0];
  if (sources.length === 2) return `${sources[0]} and ${sources[1]}`;
  return `${sources.slice(0, -1).join(", ")}, and ${sources.at(-1)}`;
};

/**
 * Throws if `path` has no entry in `fileSources`. Exported so tests can call
 * it directly with an incomplete sources map.
 */
export const requireSources = (path, fileSources) => {
  if (!(path in fileSources)) {
    throw new Error(
      `${path} has no entry in FILE_SOURCES — add one in dev/scripts/generate-manifests.mjs next to where it is built`,
    );
  }
};

/** Returns the error message to throw when `path` is out of date on disk. */
const outOfDateError = (path) => {
  if (path === PLUGIN_JSON) {
    return `${path}: generated OpenAI directory fields are out of date. Run npm run generate. Edit them in dev/scripts/generate-manifests.mjs instead.`;
  }
  if (path in FILES_WITH_GENERATED_RULES) {
    return `${path}: the rules block is out of date. Run npm run generate. If you edited the block by hand, make the change in ${ROUTING_SOURCE} instead.`;
  }
  if (FILES_WITH_GENERATED_TABLES.includes(path)) {
    return `${path}: the telemetry tables are out of date. Run npm run generate. If you edited the tables by hand, make the change in ${TELEMETRY_SOURCE} instead.`;
  }
  const sources = FILE_SOURCES[path];
  const joined = joinSources(sources);
  if (path in COPIED_FILES) {
    return `${path} is out of date. Run npm run generate. If you edited ${path} by hand, make the change in ${joined} instead (this file is a copy).`;
  }
  return `${path} is out of date. Run npm run generate. If you edited ${path} by hand, make the change in ${joined} instead.`;
};

const RULES_BLOCK_BEGIN =
  "<!-- BEGIN generated from hooks/routing-guidance.mjs by `npm run generate`; edit that file, not this block -->";
const RULES_BLOCK_END = "<!-- END generated -->";

const readText = (root, path) => readFileSync(join(root, path), "utf8");
const readJson = (root, path) => JSON.parse(readText(root, path));
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

const fillRulesBlock = (text, rules, path) => {
  const begin = text.indexOf(RULES_BLOCK_BEGIN);
  const end = text.indexOf(RULES_BLOCK_END);
  if (begin === -1 || end < begin) {
    throw new Error(`${path} is missing the generated rules block markers`);
  }
  return `${text.slice(0, begin + RULES_BLOCK_BEGIN.length)}\n${rules}\n${text.slice(end)}`;
};

/**
 * The command fields of one hook entry. With `runOnlyIfScriptExists`, the
 * command runs the script only if the file is there, so a client that leaves
 * the root variable unset or pointing at a missing script gets exit 0 and no
 * output. `powershell`
 * is intended for Windows (not verified); it has no double quotes because VS
 * Code is expected to pass it as one argument to `powershell.exe -Command`.
 */
const hookCommandFields = (hostName, script) => {
  const { rootVariable, runOnlyIfScriptExists } = HOSTS[hostName];
  const scriptPath = `\${${rootVariable}}/hooks/${script}`;
  const command = `node "${scriptPath}" --host ${hostName}`;
  if (!runOnlyIfScriptExists) return { command };
  const psPath = `($env:${rootVariable} + '/hooks/${script}')`;
  return {
    command: `if [ -f "${scriptPath}" ]; then ${command}; fi`,
    powershell: `if ($env:${rootVariable} -and (Test-Path -LiteralPath ${psPath})) { node ${psPath} --host ${hostName} }`,
  };
};

// Claude Code nests each command in a group: { hooks: { Event: [{ matcher, hooks: [entry] }] } },
// with one group per event and matcher. Cursor, Copilot CLI, and VS Code take
// the entries directly and need version 1.
export const buildHookManifest = (hostName, hookRows = HOOKS) => {
  const host = HOSTS[hostName];
  const nested = host.format === "nested";
  const hooks = {};
  for (const hook of hookRows) {
    if (hook.hosts && !hook.hosts.includes(hostName)) continue;
    const name = host.events ? host.events[hook.event] : hook.event;
    if (!name) continue;
    hooks[name] ??= [];
    if (!nested) {
      if (hook.if || hook.extraArgs) {
        throw new Error(`${hook.script} entry for ${hostName} has if or extra args, which the flat format does not support`);
      }
      const entry = { type: "command", ...hookCommandFields(hostName, hook.script), timeout: HOOK_TIMEOUT_SEC };
      hooks[name].push({ ...entry, ...(hook.matcher ? { matcher: hook.matcher } : {}) });
      continue;
    }
    const { command } = hookCommandFields(hostName, hook.script);
    const entry = {
      type: "command",
      ...(hook.if ? { if: hook.if } : {}),
      command: [command, ...(hook.extraArgs ?? [])].join(" "),
      timeout: HOOK_TIMEOUT_SEC,
    };
    let group = hooks[name].find((existing) => existing.matcher === hook.matcher);
    if (!group) {
      group = { ...(hook.matcher ? { matcher: hook.matcher } : {}), hooks: [] };
      hooks[name].push(group);
    }
    group.hooks.push(entry);
  }
  return nested ? { hooks } : { version: 1, hooks };
};

/** Every generated file and its contents, from the sources in `root`. */
const buildFiles = (root) => {
  const plugin = readJson(root, PLUGIN_JSON);
  const version = readText(root, VERSION_FILE).trim();
  if (plugin.version !== version) {
    throw new Error(`plugin.json version ${plugin.version} does not match VERSION ${version}`);
  }
  const { url } = readJson(root, MCP_JSON).mcpServers.arcade;
  const { interface: openaiListing } = plugin.extensions["com.openai"];
  // The ChatGPT directory already lists a plugin named "Arcade" from another
  // company, so the OpenAI listing uses "Arcade.dev". The other clients keep
  // "Arcade".
  const displayName = "Arcade";
  if (!openaiListing.logo) {
    throw new Error("plugin.json extensions.com.openai.interface.logo is missing");
  }
  // Codex wants the logo path with a leading "./"; Cursor takes it without one.
  // The Claude marketplace has no logo field. Both paths are relative to the
  // plugin directory.
  const logo = openaiListing.logo.replace(/^\.\//, "");
  const { name, description, author, homepage, license, keywords, repository } = plugin;
  const identity = { name, description, author, homepage, license, keywords, version };
  const owner = { ...author, email: ACCEPTED_LISTING_OWNER_EMAIL };

  const files = new Map([
    [
      inPlugin(".cursor-plugin/plugin.json"),
      serialize({
        ...identity,
        // Cursor's manifest schema allows only `name` and `email` in `author`.
        author: { name: author.name },
        displayName,
        logo,
        repository,
        skills: "skills",
        agents: "agents",
        commands: "commands",
        rules: CURSOR_RULE_DIR,
        hooks: HOSTS.cursor.manifest,
        // Cursor infers the transport from the URL.
        mcpServers: { arcade: { url } },
      }),
    ],
    [
      inPlugin(".claude-plugin/plugin.json"),
      serialize({
        ...identity,
        displayName,
        privacyPolicyUrl,
        hooks: `./${HOSTS["claude-code"].manifest}`,
        // Claude Code needs "http"; the Agent Plugins mcp.json says "streamable-http".
        mcpServers: { arcade: { type: "http", url } },
      }),
    ],
    [
      ".claude-plugin/marketplace.json",
      serialize({
        $schema: "https://json.schemastore.org/claude-code-marketplace.json",
        name,
        // Marketplace listing text. Codex also installs from this marketplace.
        description: "Install Arcade in Claude Desktop, Cowork, Claude Code, and Codex.",
        owner,
        // No version here: Claude Code takes it from .claude-plugin/plugin.json.
        plugins: [
          { name, displayName, source: `./${PLUGIN_DIR}`, description, author, homepage, repository, license, keywords },
        ],
      }),
    ],
    [
      ".cursor-plugin/marketplace.json",
      serialize({
        name,
        owner,
        plugins: [{ name, source: PLUGIN_DIR }],
      }),
    ],
    [
      inPlugin(`${CURSOR_RULE_DIR}/arcade.mdc`),
      [
        "---",
        "description: Prefer Arcade for external service tasks",
        "alwaysApply: true",
        "---",
        "",
        "<!-- Generated from hooks/routing-guidance.mjs by `npm run generate`. Edit that file, not this one. -->",
        "",
        CURSOR_RULE,
        "",
      ].join("\n"),
    ],
  ]);

  for (const [hostName, host] of Object.entries(HOSTS)) {
    files.set(inPlugin(host.manifest), serialize(buildHookManifest(hostName)));
  }

  for (const [copy, source] of Object.entries(COPIED_FILES)) {
    const rules = FILES_WITH_GENERATED_RULES[source];
    files.set(copy, rules ? fillRulesBlock(readText(root, source), rules, source) : readText(root, source));
  }

  // GitHub collapses linguist-generated files in pull request diffs.
  files.set(
    ".gitattributes",
    [
      "# Written by `npm run generate`. Lists every fully generated file.",
      ...[...files.keys()].map((path) => `${path} linguist-generated=true`),
      "",
    ].join("\n"),
  );

  // Directory fields are generated; the rest of the portable manifest remains source.
  // Add this after .gitattributes so the whole file is not marked generated.
  applyOpenAiDirectory(plugin.extensions["com.openai"]);
  files.set(PLUGIN_JSON, serialize(plugin));

  for (const [path, rules] of Object.entries(FILES_WITH_GENERATED_RULES)) {
    files.set(path, fillRulesBlock(readText(root, path), rules, path));
  }

  for (const path of FILES_WITH_GENERATED_TABLES) {
    files.set(path, fillTelemetryTables(readText(root, path)));
  }

  // Every output must have a source entry so error messages can name it.
  for (const path of files.keys()) {
    requireSources(path, FILE_SOURCES);
  }

  return files;
};

export const generateManifests = ({ check = false, root = ROOT } = {}) => {
  const files = buildFiles(root);
  if (check) {
    // A path in the committed .gitattributes that is no longer generated is a
    // leftover from a removed source and should be deleted.
    const committed = existsSync(join(root, ".gitattributes"))
      ? readText(root, ".gitattributes").match(/^\S+(?= linguist-generated)/gm) ?? []
      : [];
    for (const path of committed) {
      if (!files.has(path)) throw new Error(`${path} is no longer generated — delete it`);
    }
  }
  for (const [path, content] of files) {
    const absolutePath = join(root, path);
    if (check) {
      if (!existsSync(absolutePath) || readFileSync(absolutePath, "utf8") !== content) {
        throw new Error(outOfDateError(path));
      }
      continue;
    }
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return files;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  try {
    const files = generateManifests({ check });
    console.log(`${check ? "check" : "generate"}: ${files.size} files`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
