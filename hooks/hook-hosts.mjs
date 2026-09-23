/**
 * The hooks this plugin runs and the hosts that run them. `npm run generate`
 * writes each host's hooks.json from this table. Every hook command passes
 * `--host <name>` so the script prints the output format that host reads.
 */

export const HOOK_TIMEOUT_SEC = 5;

/** One entry per hook script: the event name, or names, each host uses to call it. */
export const HOOKS = [
  {
    script: "session-start.mjs",
    events: { "claude-code": "SessionStart", cursor: "sessionStart" },
  },
  {
    script: "user-prompt-submit.mjs",
    events: { "claude-code": "UserPromptSubmit" },
  },
  {
    script: "subagent-start.mjs",
    events: { "claude-code": "SubagentStart" },
  },
  {
    script: "telemetry.mjs",
    events: {
      "claude-code": [
        "SessionStart",
        "UserPromptSubmit",
        "PostToolUse",
        "PostToolUseFailure",
        "SubagentStop",
      ],
    },
  },
];

export const HOSTS = {
  "claude-code": {
    manifest: "hooks/hooks.json",
    rootVariable: "CLAUDE_PLUGIN_ROOT",
    // Events without an entry run on every occurrence.
    matchers: {
      SessionStart: "startup|resume|clear|compact|fork",
      SubagentStart: "*",
      PostToolUse: "mcp__.*",
      PostToolUseFailure: "mcp__.*",
      SubagentStop: "*",
    },
    contextOutput: (eventName, text) => ({
      hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
    }),
  },
  cursor: {
    manifest: "clients/cursor/hooks/hooks.json",
    rootVariable: "CURSOR_PLUGIN_ROOT",
    matchers: {},
    contextOutput: (_eventName, text) => ({ additional_context: text }),
  },
};

/** The host named by `--host`, Claude Code when absent, null when unknown. */
export const hostFromArgs = (argv) => {
  const flag = argv.indexOf("--host");
  const name = flag === -1 ? "claude-code" : argv[flag + 1];
  return HOSTS[name] ?? null;
};
