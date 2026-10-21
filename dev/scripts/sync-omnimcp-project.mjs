// omnimcp's directory copy ships only the session-start hook. arcade-plugin
// keeps the prompt and subagent hooks; this rewrites the copy rsync just made
// so a fresh sync matches that slimmer tree. Missing files are skipped so a
// partial tree (the sync tests) still projects.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const destination = process.argv[2];
if (!destination) {
  console.error("::error::sync-omnimcp-project.mjs needs the destination path");
  process.exit(1);
}

const block = (lines) => lines.join("\n");

/** @param {string} text @param {{ from: string, to: string, stale: string }} edit @param {string} file */
const applyEdit = (text, edit, file) => {
  const count = text.split(edit.from).length - 1;
  if (count === 1) return text.replace(edit.from, edit.to);
  if (count === 0 && !text.includes(edit.stale) && text.includes(edit.to)) return text;
  console.error(`::error::${file} is neither the arcade-plugin text nor the omnimcp projection`);
  process.exit(1);
};

/** @param {string} file @param {{ from: string, to: string, stale: string }[]} edits */
const project = (file, edits) => {
  const path = join(destination, file);
  if (!existsSync(path)) return;
  const original = readFileSync(path, "utf8");
  const next = edits.reduce((text, edit) => applyEdit(text, edit, file), original);
  if (next !== original) writeFileSync(path, next);
};

const DROPPED_SCRIPTS = ["user-prompt-submit.mjs", "subagent-start.mjs"];
const mentionsDropped = (value) => DROPPED_SCRIPTS.some((script) => JSON.stringify(value).includes(script));

const filterEntries = (entries) => entries.flatMap((entry) => {
  if (Array.isArray(entry.hooks)) {
    const hooks = entry.hooks.filter((hook) => !mentionsDropped(hook));
    return hooks.length === 0 ? [] : [{ ...entry, hooks }];
  }
  return mentionsDropped(entry) ? [] : [entry];
});

const MANIFESTS = [
  ".claude-plugin/hooks.json",
  "clients/cursor/hooks/hooks.json",
  "com.github.copilot/hooks/hooks.json",
  "dev/test/fixtures/telemetry/claude-code/hooks.enabled.json",
  "dev/test/fixtures/telemetry/copilot-cli/hooks.enabled.json",
];

for (const file of MANIFESTS) {
  const path = join(destination, file);
  if (!existsSync(path)) continue;
  const original = readFileSync(path, "utf8");
  const manifest = JSON.parse(original);
  const hooks = {};
  for (const [event, entries] of Object.entries(manifest.hooks)) {
    const kept = filterEntries(entries);
    if (kept.length > 0) hooks[event] = kept;
  }
  const next = `${JSON.stringify({ ...manifest, hooks }, null, 2)}\n`;
  if (next !== original) writeFileSync(path, next);
}

project("hooks/hook-hosts.mjs", [
  {
    stale: "session/subagent context",
    from: block([
      "  // Copilot CLI. PascalCase names put it in its VS Code-compatible mode",
      "  // (snake_case SessionStart input; SubagentStart still sends camelCase",
      "  // agentName in 1.0.88); it drops prompt-hook output, so it has no prompt",
      "  // reminder hook. The other events it lists run only telemetry.",
      "  // VS Code Copilot sessions use the shared Copilot hook implementation and",
      "  // this manifest for session/subagent context (see docs/install/vscode.md).",
    ]),
    to: block([
      "  // Copilot CLI. PascalCase names put it in its VS Code-compatible mode",
      "  // (snake_case SessionStart input). This copy ships only the session-start",
      "  // hook. The other events it lists run only telemetry.",
      "  // VS Code Copilot sessions use the shared Copilot hook implementation and",
      "  // this manifest for session context (see docs/install/vscode.md).",
    ]),
  },
  {
    stale: "user-prompt-submit.mjs",
    from: block([
      "  { script: \"session-start.mjs\", event: \"SessionStart\" },",
      "  // Copilot CLI drops prompt-hook output, so only Claude Code runs this one.",
      "  { script: \"user-prompt-submit.mjs\", event: \"UserPromptSubmit\", hosts: [\"claude-code\"] },",
      "  { script: \"subagent-start.mjs\", event: \"SubagentStart\" },",
    ]),
    to: "  { script: \"session-start.mjs\", event: \"SessionStart\" },",
  },
]);

project("hooks/telemetry-adapter.mjs", [
  {
    stale: "runs user-prompt-submit.mjs",
    from: "Whether the client runs user-prompt-submit.mjs.",
    to: "Whether prompt events set reminder_sent.",
  },
]);

project("hooks/telemetry-adapters/claude-code.mjs", [
  {
    stale: "promptReminder: true",
    from: "  promptReminder: true,",
    to: "  promptReminder: false,",
  },
]);

const reminderDoc = {
  stale: "false` in Copilot CLI",
  from: "always `false` in Copilot CLI",
  to: "always `false`; this copy does not add one",
};
project("hooks/telemetry-contract.mjs", [reminderDoc]);
project("docs/telemetry.md", [
  reminderDoc,
  {
    stale: "adds its routing reminder",
    from: block([
      "Session starts send no usage event. Only the Arcade operator's stop reports",
      "send subagent events. Claude Code adds its routing reminder on every prompt",
      "except short acknowledgements and background task results, whether or not",
      "telemetry is on. Copilot CLI has no routing reminder hook, so `reminder_sent`",
      "stays false there.",
    ]),
    to: block([
      "Session starts send no usage event. Only the Arcade operator's stop reports",
      "send subagent events. This copy does not add a per-prompt routing reminder, so",
      "`reminder_sent` stays false.",
    ]),
  },
  {
    stale: "routing hook still adds its reminder",
    from: block([
      "With telemetry opted out, the client still invokes its configured Node hooks.",
      "The telemetry hook exits before classifying the prompt or storing state. Claude",
      "Code's routing hook still adds its reminder. An environment variable cannot",
      "remove hooks from the manifest.",
    ]),
    to: block([
      "With telemetry opted out, the client still invokes its configured Node hooks.",
      "The telemetry hook exits before classifying the prompt or storing state. An",
      "environment variable cannot remove hooks from the manifest.",
    ]),
  },
  {
    stale: "session and subagent routing hooks",
    from: block([
      "Copilot's manifest is shared with VS Code's Copilot sessions, which support",
      "session and subagent routing hooks (see the [VS Code guide](install/vscode.md)).",
    ]),
    to: block([
      "Copilot's manifest is shared with VS Code's Copilot sessions, which get the",
      "session-start routing hook (see the [VS Code guide](install/vscode.md)).",
    ]),
  },
]);

project("dev/test/fixtures/telemetry/claude-code/event-cases.mjs", [
  {
    stale: "reminder_sent: true",
    from: 'reminder_sent: true',
    to: "reminder_sent: false",
  },
]);

project("dev/test/telemetry-foundation.test.mjs", [
  {
    stale: "subagent-start.mjs",
    from: '["session-start.mjs", "subagent-start.mjs", "user-prompt-submit.mjs"]',
    to: '["session-start.mjs"]',
  },
]);

project("dev/test/hooks.test.mjs", [
  {
    stale: "subagent-start skips arcade-operator",
    from: block([
      'test("subagent-start skips arcade-operator in every client\'s input format", () => {',
      "  for (const input of [",
      '    { agent_type: "arcade-operator" },',
      '    { agent_type: "arcade:arcade-operator" },',
      "    // Copilot CLI 1.0.88's SubagentStart input.",
      '    { agentName: "arcade:arcade-operator", agentDisplayName: "arcade-operator" },',
      "  ]) {",
      "    for (const host of Object.keys(HOSTS)) {",
      '      const result = runHook("subagent-start.mjs", input, ["--host", host]);',
      "      assert.equal(result.status, 0, result.stderr);",
      '      assert.equal(result.stdout, "", `${host} ${JSON.stringify(input)}`);',
      "    }",
      "  }",
      '  assert.notEqual(runHook("subagent-start.mjs", { agent_type: "Explore" }, ["--host", "claude-code"]).stdout, "");',
      '  assert.notEqual(runHook("subagent-start.mjs", { agentName: "general-purpose" }, ["--host", "copilot"]).stdout, "");',
      "});",
      "",
      "",
    ]),
    to: "",
  },
  {
    stale: "user-prompt-submit.mjs",
    from: 'for (const script of ["session-start.mjs", "user-prompt-submit.mjs", "subagent-start.mjs"])',
    to: 'for (const script of ["session-start.mjs"])',
  },
  {
    stale: "SubagentStart all support additionalContext",
    from: block([
      "  // code.claude.com/docs/en/hooks: SessionStart, UserPromptSubmit, SubagentStart all support additionalContext",
      '  "claude-code": ["SessionStart", "UserPromptSubmit", "SubagentStart"],',
      "  // cursor.com/docs/hooks.md: sessionStart adds additional_context; beforeSubmitPrompt and subagentStart can't add context.",
      "  // The CLI doesn't load the plugin's always-apply rule, so the session hook is the only way it gets the full rules.",
      '  cursor: ["sessionStart"],',
      "  // measured in Copilot CLI 1.0.88: SubagentStart runs and injects context; prompt hook output from config files is dropped",
      "  // docs.github.com/en/copilot/reference/hooks-reference: SubagentStart input uses agentName",
      '  copilot: ["SessionStart", "SubagentStart"],',
    ]),
    to: block([
      "  // code.claude.com/docs/en/hooks: SessionStart supports additionalContext.",
      "  // This copy ships only the session-start hook.",
      '  "claude-code": ["SessionStart"],',
      "  // cursor.com/docs/hooks.md: sessionStart adds additional_context.",
      "  // The CLI doesn't load the plugin's always-apply rule, so the session hook is the only way it gets the full rules.",
      '  cursor: ["sessionStart"],',
      "  // This copy's Copilot manifest runs the session-start hook only.",
      '  copilot: ["SessionStart"],',
    ]),
  },
  {
    stale: "per-prompt reminder and the skill",
    from: block([
      "// Each client gets its routing rules from one of these texts, and some get",
      "// only one: Cowork's main conversation gets only the per-prompt reminder and the skill, and",
      "// the Cursor IDE gets only the rule and the skill. Keep the core rules in each.",
    ]),
    to: block([
      "// Each client gets its routing rules from one of these texts. The session-start",
      "// hook, the Cursor rule, try-arcade, and arcade-operator carry them. Keep the core rules in each.",
    ]),
  },
]);

project("docs/install/copilot.md", [
  {
    stale: "routing rules at\nsession start and for subagents",
    from: block([
      "Hooks come from `com.github.copilot/hooks/hooks.json`: routing rules at",
      "session start and for subagents. Copilot CLI drops the output of prompt hooks",
      "from config files, so there's no per-prompt reminder here. VS Code's Copilot",
      "sessions use the same hook implementation and manifest for session and subagent",
      "routing guidance; see the [VS Code guide](vscode.md) for harness/version scope",
      "and validation limits.",
    ]),
    to: block([
      "Hooks come from `com.github.copilot/hooks/hooks.json`: routing rules at",
      "session start. VS Code's Copilot sessions use the same hook implementation and",
      "manifest; see the [VS Code guide](vscode.md) for harness/version scope and",
      "validation limits.",
    ]),
  },
]);

project("docs/install/vscode.md", [
  {
    stale: "or subagent starts",
    from: block([
      "In VS Code's **Copilot sessions**, Arcade adds routing guidance when a session",
      "or subagent starts. The shared `com.github.copilot/hooks/hooks.json` supplies",
      "`SessionStart` and `SubagentStart`; `${PLUGIN_ROOT}` locates the bundled scripts,",
      "and the Copilot adapter returns `additionalContext`.",
    ]),
    to: block([
      "In VS Code's **Copilot sessions**, Arcade adds routing guidance when a session",
      "starts. The shared `com.github.copilot/hooks/hooks.json` supplies",
      "`SessionStart`; `${PLUGIN_ROOT}` locates the bundled script,",
      "and the Copilot adapter returns `additionalContext`.",
    ]),
  },
]);

project("docs/support-matrix.md", [
  {
    stale: "to each prompt, and to",
    from: block([
      "Hooks add the routing rules at session start, to each prompt, and to",
      "subagents. In the Hooks column, ✅ means the session-start hook runs, so the",
      "full rules reach the main conversation. Partial means some hooks run but the",
      "session-start text doesn't reach the main conversation. The files are",
    ]),
    to: block([
      "Hooks add the routing rules at session start. In the Hooks column, ✅ means",
      "the session-start hook runs, so the full rules reach the main conversation.",
      "Partial means the session-start hook is configured but its text doesn't reach",
      "the main conversation. The files are",
    ]),
  },
  {
    stale: "prompt and subagent hooks but doesn't add",
    from: block([
      "⁴ Cowork runs the prompt and subagent hooks but doesn't add the session-start",
      "text, so its main conversation gets the short reminder and the skill, not the",
      "full rules.",
      "⁵ Copilot CLI drops the output of **routing** prompt hooks from config files,",
      "so the main conversation gets session and subagent hooks only. Telemetry still",
      "hooks `UserPromptSubmit` when enabled; `reminder_sent` is always `false` there.",
      "⁶ VS Code Copilot sessions use the shared Copilot hook implementation: this",
      "plugin supplies `SessionStart` and `SubagentStart` routing guidance through",
      "`com.github.copilot/hooks/hooks.json`. Support depends on the selected harness",
    ]),
    to: block([
      "⁴ Cowork does not add the session-start text, so its main conversation gets",
      "the skill, not the full rules.",
      "⁵ This copy's Copilot manifest runs the session-start hook only. Telemetry still",
      "hooks `UserPromptSubmit` when enabled; `reminder_sent` is always `false` there.",
      "⁶ VS Code Copilot sessions use the shared Copilot hook implementation: this",
      "plugin supplies `SessionStart` routing guidance through",
      "`com.github.copilot/hooks/hooks.json`. Support depends on the selected harness",
    ]),
  },
]);
