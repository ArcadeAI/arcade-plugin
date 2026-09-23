/**
 * The hooks this plugin runs and the clients that run them. `npm run generate`
 * writes each client's hooks.json from this table. Every hook command passes
 * `--host <name>` so the script prints the output format that client reads.
 */

export const HOOK_TIMEOUT_SEC = 5;

/**
 * One entry per hook script and event. The event is Claude Code's name for it;
 * a client with an `events` map uses its own names and only gets the events it
 * lists. `hosts` limits an entry to some clients; `matcher` is passed to Claude
 * Code.
 */
export const HOOKS = [
  { script: "session-start.mjs", event: "SessionStart" },
  { script: "user-prompt-submit.mjs", event: "UserPromptSubmit" },
  { script: "subagent-start.mjs", event: "SubagentStart" },
  // Telemetry (docs/telemetry.md) reads Claude Code's hook input, so only
  // Claude Code runs it. Tool events are limited to MCP tools.
  ...["SessionStart", "UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "SubagentStop"].map((event) => ({
    script: "telemetry.mjs",
    event,
    hosts: ["claude-code"],
    ...(event.startsWith("PostToolUse") ? { matcher: "mcp__.*" } : {}),
  })),
];

export const HOSTS = {
  "claude-code": {
    // Not hooks/hooks.json: Cursor falls back to that default path and would
    // run these too.
    manifest: ".claude-plugin/hooks.json",
    format: "nested",
    rootVariable: "CLAUDE_PLUGIN_ROOT",
    contextOutput: (eventName, text) => ({
      hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
    }),
  },
  // Cursor's CLI doesn't load the plugin's always-apply rule, so the session
  // hook carries the full rules and the rule is the short reminder. Cursor's
  // prompt and subagent hooks can't add context.
  cursor: {
    manifest: "clients/cursor/hooks/hooks.json",
    format: "flat",
    rootVariable: "CURSOR_PLUGIN_ROOT",
    events: { SessionStart: "sessionStart" },
    contextOutput: (_eventName, text) => ({ additional_context: text }),
  },
  // Copilot CLI. PascalCase names put it in its VS Code-compatible mode
  // (snake_case input); it drops prompt-hook output, so there's no prompt hook.
  // VS Code reads this file too but doesn't expand ${PLUGIN_ROOT} for Agent
  // Plugins hooks or pass their output to the model (pluginParsers.ts,
  // copilotPluginConverters.ts on microsoft/vscode main, 2026-09).
  copilot: {
    manifest: "com.github.copilot/hooks/hooks.json",
    format: "flat",
    rootVariable: "PLUGIN_ROOT",
    events: { SessionStart: "SessionStart", SubagentStart: "SubagentStart" },
    contextOutput: (eventName, text) => ({
      additionalContext: text,
      hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
    }),
  },
};

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
