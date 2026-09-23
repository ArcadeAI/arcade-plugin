import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { HOSTS } from "../hooks/hook-hosts.mjs";

const readJson = (root, relativePath) =>
  JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

export const extractHookCommands = (hooksJson) => {
  const commands = [];
  for (const [event, groups] of Object.entries(hooksJson.hooks ?? {})) {
    for (const group of groups) {
      if (typeof group.command === "string") {
        commands.push({ event, command: group.command });
        continue;
      }
      for (const hook of group.hooks ?? []) {
        if (typeof hook.command === "string") {
          commands.push({ event, command: hook.command });
        }
      }
    }
  }
  return commands;
};

export const MANIFEST_HOOK_ADAPTERS = [
  {
    name: "claude-code",
    stdinByEvent: {
      SessionStart: JSON.stringify({
        hook_event_name: "SessionStart",
        session_id: "claude-smoke-1",
        source: "startup",
      }),
      UserPromptSubmit: JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: "What is on my calendar tomorrow?",
      }),
      SubagentStart: JSON.stringify({
        hook_event_name: "SubagentStart",
        agent_type: "review",
      }),
      PostToolUse: JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "mcp__plugin_arcade_arcade__Gmail_ListEmails",
      }),
      PostToolUseFailure: JSON.stringify({
        hook_event_name: "PostToolUseFailure",
        tool_name: "mcp__plugin_arcade_arcade__Gmail_ListEmails",
      }),
      SubagentStop: JSON.stringify({
        hook_event_name: "SubagentStop",
        agent_type: "arcade:arcade-operator",
      }),
    },
  },
  {
    name: "cursor",
    stdinByEvent: {
      sessionStart: JSON.stringify({
        hook_event_name: "sessionStart",
        conversation_id: "conv-smoke-1",
        cursor_version: "1.0.0",
        workspace_roots: ["/repo"],
        session_id: "cursor-smoke-1",
        is_background_agent: false,
        composer_mode: "agent",
      }),
    },
  },
];

const pluginRootEnv = (root) => ({
  PLUGIN_ROOT: root,
  CLAUDE_PLUGIN_ROOT: root,
  CURSOR_PLUGIN_ROOT: root,
});

export const runManifestHookSmoke = (root) => {
  const errors = [];

  for (const adapter of MANIFEST_HOOK_ADAPTERS) {
    const { manifest, rootVariable } = HOSTS[adapter.name];
    const hooksJson = readJson(root, manifest);
    const commands = extractHookCommands(hooksJson);

    for (const { event, command } of commands) {
      const stdin = adapter.stdinByEvent[event];
      if (stdin === undefined) {
        errors.push(
          `${adapter.name}: missing stdin fixture for ${event} in ${manifest}`,
        );
        continue;
      }

      const resolved = command.replaceAll(`\${${rootVariable}}`, root);
      if (resolved.includes("${")) {
        errors.push(
          `${adapter.name}: unresolved path token in ${event} command: ${command}`,
        );
        continue;
      }

      const result = spawnSync(resolved, {
        shell: true,
        input: stdin,
        encoding: "utf8",
        cwd: root,
        // Telemetry off, so the smoke run never writes install files or sends.
        env: { ...process.env, ...pluginRootEnv(root), ARCADE_PLUGIN_TELEMETRY: "0" },
      });

      if (result.status !== 0) {
        errors.push(
          `${adapter.name}: ${event} exited ${result.status} — ${result.stderr}`,
        );
        continue;
      }

      // Telemetry prints nothing on most events; the routing hooks must always print.
      if (command.includes("hooks/telemetry.mjs")) continue;

      if (!result.stdout.trim()) {
        errors.push(`${adapter.name}: ${event} produced empty stdout`);
      }
    }
  }

  return errors;
};
