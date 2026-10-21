#!/usr/bin/env node
// Applies the small, directory-specific compatibility profile required by the
// Claude plugin listing. Keep the source plugin's broader client support
// intact; sync calls this after copying a release tree into omnimcp.

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

// The source plugin retains these hooks for its full Claude Code integration
// and Copilot retains SubagentStart. omnimcp ships the previously approved
// SessionStart-only Claude profile.
replaceOnce(
  "hooks/hook-hosts.mjs",
  '  // Copilot CLI drops prompt-hook output, so only Claude Code runs this one.\n  { script: "user-prompt-submit.mjs", event: "UserPromptSubmit", hosts: ["claude-code"] },\n  { script: "subagent-start.mjs", event: "SubagentStart" },',
  '  // omnimcp ships SessionStart-only for Claude Code; preserve Copilot subagent context.\n  { script: "subagent-start.mjs", event: "SubagentStart", hosts: ["copilot"] },',
);
replaceOnce("hooks/telemetry-adapters/claude-code.mjs", "  promptReminder: true,", "  promptReminder: false,");
replaceOnce(
  "hooks/telemetry-contract.mjs",
  "boolean, whether the routing reminder was added (always `false` in Copilot CLI)",
  "boolean, whether the routing reminder was added (always `false`; this copy does not add one)",
);

rmSync(join(destination, "hooks/user-prompt-submit.mjs"));

const manifestPath = ".claude-plugin/hooks.json";
const manifest = JSON.parse(read(manifestPath));
const sessionStart = manifest.hooks?.SessionStart;
if (!Array.isArray(sessionStart) || sessionStart.length === 0) {
  throw new Error(`${manifestPath} is missing SessionStart`);
}
manifest.hooks = { SessionStart: sessionStart };
write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const telemetryFixturePath = "dev/test/fixtures/telemetry/claude-code/hooks.enabled.json";
const telemetryFixture = JSON.parse(read(telemetryFixturePath));
for (const [event, groups] of Object.entries(telemetryFixture.hooks)) {
  const retainedGroups = groups
    .map((group) => ({
      ...group,
      hooks: group.hooks.filter((hook) => !hook.command.includes("/hooks/user-prompt-submit.mjs") && !hook.command.includes("/hooks/subagent-start.mjs")),
    }))
    .filter((group) => group.hooks.length > 0);
  if (retainedGroups.length === 0) delete telemetryFixture.hooks[event];
  else telemetryFixture.hooks[event] = retainedGroups;
}
write(telemetryFixturePath, `${JSON.stringify(telemetryFixture, null, 2)}\n`);

const { fillTelemetryTables } = await import(pathToFileURL(join(destination, "dev/scripts/telemetry-docs.mjs")));
write("docs/telemetry.md", fillTelemetryTables(read("docs/telemetry.md")));
