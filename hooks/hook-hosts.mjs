/**
 * The hooks this plugin runs and the clients that run them. `npm run generate`
 * writes each client's hooks.json from this table. Every hook command passes
 * `--host <name>` so the script prints the output format that client reads.
 */

import { EVENTS } from "./telemetry-contract.mjs";

export const HOOK_TIMEOUT_SEC = 5;

/**
 * Each client that runs plugin hooks. `mcpToolMatcher` matches that client's
 * MCP tool names. `runOnlyIfScriptExists` makes each command check for its
 * script first. A client with `telemetry` runs telemetry.mjs: `dataVariable`
 * names the environment variable that holds the plugin's data folder, and
 * `optOutSwitches` are the client's own settings that turn telemetry off.
 * `anyValue: true` means any non-empty value turns it off; `anyValue: false`
 * means any value except empty, 0, false, off, or no does.
 */
export const HOSTS = {
  "claude-code": {
    // Not hooks/hooks.json: Cursor falls back to that default path and would
    // run these too.
    manifest: ".claude-plugin/hooks.json",
    format: "nested",
    rootVariable: "CLAUDE_PLUGIN_ROOT",
    mcpToolMatcher: "mcp__.*",
    telemetry: {
      host: "claude-code",
      dataVariable: "CLAUDE_PLUGIN_DATA",
      // Claude Code treats any non-empty value as set, including "0" and "false".
      optOutSwitches: [
        { name: "DISABLE_TELEMETRY", anyValue: true },
        { name: "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", anyValue: true },
      ],
    },
    contextOutput: (eventName, text) => ({
      hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
    }),
  },
  // Cursor's CLI doesn't load the plugin's always-apply rule, so the session
  // hook carries the full rules. The IDE and Cloud Agents don't run plugin
  // hooks, so they rely on the always-apply rule, which is the full session
  // rules. Cursor's prompt and subagent hooks can't add context.
  cursor: {
    manifest: "clients/cursor/hooks/hooks.json",
    format: "flat",
    rootVariable: "CURSOR_PLUGIN_ROOT",
    events: { SessionStart: "sessionStart" },
    contextOutput: (_eventName, text) => ({ additional_context: text }),
  },
  // Copilot CLI. PascalCase names put it in its VS Code-compatible mode
  // (snake_case SessionStart input; SubagentStart still sends camelCase
  // agentName in 1.0.88); it drops prompt-hook output, so it has no prompt reminder hook.
  // It names MCP tools `<server>-<tool>`; built-in tools have no hyphen.
  // VS Code reads this file too but doesn't set or expand ${PLUGIN_ROOT} for
  // Agent Plugins hooks (pluginParsers.ts on microsoft/vscode main, 2026-09),
  // so each command checks that its script exists and otherwise exits 0
  // without output.
  copilot: {
    manifest: "com.github.copilot/hooks/hooks.json",
    format: "flat",
    rootVariable: "PLUGIN_ROOT",
    mcpToolMatcher: ".+-.+",
    runOnlyIfScriptExists: true,
    events: {
      SessionStart: "SessionStart",
      SubagentStart: "SubagentStart",
      UserPromptSubmit: "UserPromptSubmit",
      PostToolUse: "PostToolUse",
      PostToolUseFailure: "PostToolUseFailure",
      SubagentStop: "SubagentStop",
    },
    telemetry: {
      host: "copilot-cli",
      dataVariable: "COPILOT_PLUGIN_DATA",
      // Copilot documents "true" and doesn't say which other values it
      // accepts, so any value that isn't clearly off counts.
      optOutSwitches: [{ name: "COPILOT_OFFLINE", anyValue: false }],
    },
    contextOutput: (eventName, text) => ({
      additionalContext: text,
      hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
    }),
  },
};

/**
 * One entry per hook script and event. The event is Claude Code's name for it;
 * a client with an `events` map uses its own names and only gets the events it
 * lists. `hosts` limits an entry to some clients. `mcpToolsOnly` limits a tool
 * event to MCP tools, using each client's `mcpToolMatcher`.
 */
export const HOOKS = [
  { script: "session-start.mjs", event: "SessionStart" },
  // Copilot CLI drops prompt-hook output, so only Claude Code runs this one.
  { script: "user-prompt-submit.mjs", event: "UserPromptSubmit", hosts: ["claude-code"] },
  { script: "subagent-start.mjs", event: "SubagentStart" },
  // Telemetry (docs/telemetry.md) runs only in the clients with a `telemetry` entry.
  ...Object.values(EVENTS).map(({ hook, mcpToolsOnly }) => ({
    script: "telemetry.mjs",
    event: hook,
    hosts: Object.keys(HOSTS).filter((name) => HOSTS[name].telemetry),
    ...(mcpToolsOnly ? { mcpToolsOnly } : {}),
  })),
];

/** The client named by `--host`, or null if it's missing or unknown. */
export const hostFromArgs = (argv) => {
  const flag = argv.indexOf("--host");
  return flag === -1 ? null : (HOSTS[argv[flag + 1]] ?? null);
};

/** The hook's JSON input, or {} if there is none or it doesn't parse. */
export const readInput = async () => {
  if (process.stdin.isTTY) return {};
  let data = "";
  try {
    for await (const chunk of process.stdin) data += chunk;
    return JSON.parse(data) ?? {};
  } catch {
    return {};
  }
};

/** Adds text to the model's context in the format `host` reads. */
export const printContext = (host, eventName, text) => {
  process.stdout.write(JSON.stringify(host.contextOutput(eventName, text)));
};
