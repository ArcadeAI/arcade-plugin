#!/usr/bin/env node
// Projects the omnimcp tree to the state in arcadeai-labs/omnimcp#8. The source
// plugin keeps its full hook set; sync calls this after copying a release.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const destination = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: configure-omnimcp-tree.mjs <destination>");

const read = (file) => readFileSync(join(destination, file), "utf8");
const write = (file, content) => writeFileSync(join(destination, file), content, "utf8");

const replaceOnce = (file, from, to) => {
  const text = read(file);
  if (text.split(from).length !== 2) throw new Error(`expected one ${JSON.stringify(from)} in ${file}`);
  write(file, text.replace(from, to));
};

replaceOnce(
  "hooks/hook-hosts.mjs",
  `  // Copilot CLI. PascalCase names put it in its VS Code-compatible mode
  // (snake_case SessionStart input; SubagentStart still sends camelCase
  // agentName in 1.0.88); it drops prompt-hook output, so it has no prompt
  // reminder hook. The other events it lists run only telemetry.
  // VS Code Copilot sessions use the shared Copilot hook implementation and
  // this manifest for session/subagent context (see docs/install/vscode.md).`,
  `  // Copilot CLI. PascalCase names put it in its VS Code-compatible mode
  // (snake_case SessionStart input). This copy ships only the session-start
  // hook. The other events it lists run only telemetry.
  // VS Code Copilot sessions use the shared Copilot hook implementation and
  // this manifest for session context (see docs/install/vscode.md).`,
);
replaceOnce(
  "hooks/hook-hosts.mjs",
  `  { script: "session-start.mjs", event: "SessionStart" },
  // Copilot CLI drops prompt-hook output, so only Claude Code runs this one.
  { script: "user-prompt-submit.mjs", event: "UserPromptSubmit", hosts: ["claude-code"] },
  { script: "subagent-start.mjs", event: "SubagentStart" },`,
  `  { script: "session-start.mjs", event: "SessionStart" },`,
);
replaceOnce(
  "hooks/telemetry-adapter.mjs",
  "Whether the client runs user-prompt-submit.mjs.",
  "Whether prompt events set reminder_sent.",
);
replaceOnce("hooks/telemetry-adapters/claude-code.mjs", "  promptReminder: true,", "  promptReminder: false,");
replaceOnce(
  "hooks/telemetry-contract.mjs",
  "boolean, whether the routing reminder was added (always `false` in Copilot CLI)",
  "boolean, whether the routing reminder was added (always `false`; this copy does not add one)",
);
replaceOnce(
  "dev/test/fixtures/telemetry/claude-code/event-cases.mjs",
  'reminder_sent: true',
  "reminder_sent: false",
);

replaceOnce(
  "dev/test/hooks.test.mjs",
  `test("subagent-start skips arcade-operator in every client's input format", () => {
  for (const input of [
    { agent_type: "arcade-operator" },
    { agent_type: "arcade:arcade-operator" },
    // Copilot CLI 1.0.88's SubagentStart input.
    { agentName: "arcade:arcade-operator", agentDisplayName: "arcade-operator" },
  ]) {
    for (const host of Object.keys(HOSTS)) {
      const result = runHook("subagent-start.mjs", input, ["--host", host]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", \`\${host} \${JSON.stringify(input)}\`);
    }
  }
  assert.notEqual(runHook("subagent-start.mjs", { agent_type: "Explore" }, ["--host", "claude-code"]).stdout, "");
  assert.notEqual(runHook("subagent-start.mjs", { agentName: "general-purpose" }, ["--host", "copilot"]).stdout, "");
});

`,
  "",
);
replaceOnce(
  "dev/test/hooks.test.mjs",
  'for (const script of ["session-start.mjs", "user-prompt-submit.mjs", "subagent-start.mjs"]) {',
  'for (const script of ["session-start.mjs"]) {',
);
replaceOnce(
  "dev/test/hooks.test.mjs",
  `const EXPECTED_EVENTS = {
  // code.claude.com/docs/en/hooks: SessionStart, UserPromptSubmit, SubagentStart all support additionalContext
  "claude-code": ["SessionStart", "UserPromptSubmit", "SubagentStart"],
  // cursor.com/docs/hooks.md: sessionStart adds additional_context; beforeSubmitPrompt and subagentStart can't add context.
  // The CLI doesn't load the plugin's always-apply rule, so the session hook is the only way it gets the full rules.
  cursor: ["sessionStart"],
  // measured in Copilot CLI 1.0.88: SubagentStart runs and injects context; prompt hook output from config files is dropped
  // docs.github.com/en/copilot/reference/hooks-reference: SubagentStart input uses agentName
  copilot: ["SessionStart", "SubagentStart"],
};`,
  `const EXPECTED_EVENTS = {
  // code.claude.com/docs/en/hooks: SessionStart supports additionalContext.
  // This copy ships only the session-start hook.
  "claude-code": ["SessionStart"],
  // cursor.com/docs/hooks.md: sessionStart adds additional_context.
  // The CLI doesn't load the plugin's always-apply rule, so the session hook is the only way it gets the full rules.
  cursor: ["sessionStart"],
  // This copy's Copilot manifest runs the session-start hook only.
  copilot: ["SessionStart"],
};`,
);
replaceOnce(
  "dev/test/hooks.test.mjs",
  `// Each client gets its routing rules from one of these texts, and some get
// only one: Cowork's main conversation gets only the per-prompt reminder and the skill, and
// the Cursor IDE gets only the rule and the skill. Keep the core rules in each.`,
  `// Each client gets its routing rules from one of these texts. The session-start
// hook, the Cursor rule, try-arcade, and arcade-operator carry them. Keep the core rules in each.`,
);
replaceOnce(
  "dev/test/telemetry-foundation.test.mjs",
  'for (const script of ["session-start.mjs", "subagent-start.mjs", "user-prompt-submit.mjs"]) {',
  'for (const script of ["session-start.mjs"]) {',
);

replaceOnce(
  "docs/install/copilot.md",
  `Hooks come from \`com.github.copilot/hooks/hooks.json\`: routing rules at
session start and for subagents. Copilot CLI drops the output of prompt hooks
from config files, so there's no per-prompt reminder here. VS Code's Copilot
sessions use the same hook implementation and manifest for session and subagent
routing guidance; see the [VS Code guide](vscode.md) for harness/version scope
and validation limits.`,
  `Hooks come from \`com.github.copilot/hooks/hooks.json\`: routing rules at
session start. VS Code's Copilot sessions use the same hook implementation and
manifest; see the [VS Code guide](vscode.md) for harness/version scope and
validation limits.`,
);
replaceOnce(
  "docs/install/vscode.md",
  `In VS Code's **Copilot sessions**, Arcade adds routing guidance when a session
or subagent starts. The shared \`com.github.copilot/hooks/hooks.json\` supplies
\`SessionStart\` and \`SubagentStart\`; \`\${PLUGIN_ROOT}\` locates the bundled scripts,`,
  `In VS Code's **Copilot sessions**, Arcade adds routing guidance when a session
starts. The shared \`com.github.copilot/hooks/hooks.json\` supplies
\`SessionStart\`; \`\${PLUGIN_ROOT}\` locates the bundled script,`,
);
replaceOnce(
  "docs/support-matrix.md",
  `Hooks add the routing rules at session start, to each prompt, and to
subagents. In the Hooks column, ✅ means the session-start hook runs, so the
full rules reach the main conversation. Partial means some hooks run but the
session-start text doesn't reach the main conversation. The files are`,
  `Hooks add the routing rules at session start. In the Hooks column, ✅ means
the session-start hook runs, so the full rules reach the main conversation.
Partial means the session-start hook is configured but its text doesn't reach
the main conversation. The files are`,
);
replaceOnce(
  "docs/support-matrix.md",
  `⁴ Cowork runs the prompt and subagent hooks but doesn't add the session-start
text, so its main conversation gets the short reminder and the skill, not the
full rules.
⁵ Copilot CLI drops the output of **routing** prompt hooks from config files,
so the main conversation gets session and subagent hooks only. Telemetry still
hooks \`UserPromptSubmit\` when enabled; \`reminder_sent\` is always \`false\` there.
⁶ VS Code Copilot sessions use the shared Copilot hook implementation: this
plugin supplies \`SessionStart\` and \`SubagentStart\` routing guidance through`,
  `⁴ Cowork does not add the session-start text, so its main conversation gets
the skill, not the full rules.
⁵ This copy's Copilot manifest runs the session-start hook only. Telemetry still
hooks \`UserPromptSubmit\` when enabled; \`reminder_sent\` is always \`false\` there.
⁶ VS Code Copilot sessions use the shared Copilot hook implementation: this
plugin supplies \`SessionStart\` routing guidance through`,
);
replaceOnce(
  "docs/telemetry.md",
  `Session starts send no usage event. Only the Arcade operator's stop reports
send subagent events. Claude Code adds its routing reminder on every prompt
except short acknowledgements and background task results, whether or not
telemetry is on. Copilot CLI has no routing reminder hook, so \`reminder_sent\`
stays false there.`,
  `Session starts send no usage event. Only the Arcade operator's stop reports
send subagent events. This copy does not add a per-prompt routing reminder, so
\`reminder_sent\` stays false.`,
);
replaceOnce(
  "docs/telemetry.md",
  `With telemetry opted out, the client still invokes its configured Node hooks.
The telemetry hook exits before classifying the prompt or storing state. Claude
Code's routing hook still adds its reminder. An environment variable cannot
remove hooks from the manifest.`,
  `With telemetry opted out, the client still invokes its configured Node hooks.
The telemetry hook exits before classifying the prompt or storing state. An
environment variable cannot remove hooks from the manifest.`,
);
replaceOnce(
  "docs/telemetry.md",
  `Copilot's manifest is shared with VS Code's Copilot sessions, which support
session and subagent routing hooks (see the [VS Code guide](install/vscode.md)).`,
  `Copilot's manifest is shared with VS Code's Copilot sessions, which get the
session-start routing hook (see the [VS Code guide](install/vscode.md)).`,
);

for (const script of ["hooks/user-prompt-submit.mjs", "hooks/subagent-start.mjs"]) {
  rmSync(join(destination, script));
}

const sessionStartOnly = (file) => {
  const manifest = JSON.parse(read(file));
  const sessionStart = manifest.hooks?.SessionStart;
  if (!Array.isArray(sessionStart) || sessionStart.length === 0) {
    throw new Error(`${file} is missing SessionStart`);
  }
  manifest.hooks = { SessionStart: sessionStart };
  write(file, `${JSON.stringify(manifest, null, 2)}\n`);
};
sessionStartOnly(".claude-plugin/hooks.json");
sessionStartOnly("com.github.copilot/hooks/hooks.json");

const isRoutingCommand = (command) =>
  command.includes("/hooks/user-prompt-submit.mjs") || command.includes("/hooks/subagent-start.mjs");

const dropRoutingHooks = (file) => {
  const manifest = JSON.parse(read(file));
  for (const [event, entries] of Object.entries(manifest.hooks)) {
    const retained = entries.flatMap((entry) => {
      if (Array.isArray(entry.hooks)) {
        const hooks = entry.hooks.filter((hook) => !isRoutingCommand(hook.command));
        return hooks.length === 0 ? [] : [{ ...entry, hooks }];
      }
      return isRoutingCommand(entry.command) ? [] : [entry];
    });
    if (retained.length === 0) delete manifest.hooks[event];
    else manifest.hooks[event] = retained;
  }
  write(file, `${JSON.stringify(manifest, null, 2)}\n`);
};
dropRoutingHooks("dev/test/fixtures/telemetry/claude-code/hooks.enabled.json");
dropRoutingHooks("dev/test/fixtures/telemetry/copilot-cli/hooks.enabled.json");

const { fillTelemetryTables } = await import(pathToFileURL(join(destination, "dev/scripts/telemetry-docs.mjs")));
write("docs/telemetry.md", fillTelemetryTables(read("docs/telemetry.md")));
