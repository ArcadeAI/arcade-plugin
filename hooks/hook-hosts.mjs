/**
 * The hooks this plugin runs and the clients that run them. `npm run generate`
 * writes each client's hooks.json from this table. Every hook command passes
 * `--host <name>` so the script prints the output format that client reads.
 *
 * Cursor has no entry: its always-apply rule already carries the full rules,
 * and its prompt and subagent hooks can't add context.
 */

export const HOOK_TIMEOUT_SEC = 5;

/**
 * One entry per hook script. Every client below uses the same PascalCase event
 * name, and the script prints that name in its output.
 */
export const HOOKS = [
  { script: "session-start.mjs", event: "SessionStart" },
  // Copilot CLI drops this hook's output; VS Code and Claude Code use it.
  { script: "user-prompt-submit.mjs", event: "UserPromptSubmit" },
  { script: "subagent-start.mjs", event: "SubagentStart" },
];

export const HOSTS = {
  "claude-code": {
    manifest: "hooks/hooks.json",
    format: "nested",
    rootVariable: "CLAUDE_PLUGIN_ROOT",
    contextOutput: (eventName, text) => ({
      hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
    }),
  },
  // Copilot CLI and VS Code both read this file. PascalCase event names put
  // Copilot CLI in its VS Code-compatible mode (snake_case input). Copilot CLI
  // reads the top-level additionalContext and VS Code reads
  // hookSpecificOutput; each ignores the other.
  copilot: {
    manifest: "com.github.copilot/hooks/hooks.json",
    format: "flat",
    rootVariable: "PLUGIN_ROOT",
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
