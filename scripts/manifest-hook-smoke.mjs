import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

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
    name: "claude",
    manifest: "hooks/hooks.json",
    rootToken: "CLAUDE_PLUGIN_ROOT",
    stdinByEvent: {
      SessionStart: JSON.stringify({
        hook_event_name: "SessionStart",
        session_id: "claude-smoke-1",
        source: "startup",
      }),
      UserPromptSubmit: JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "claude-smoke-1",
        prompt_id: "claude-smoke-prompt-1",
        prompt: "What is on my calendar tomorrow?",
      }),
      SubagentStart: JSON.stringify({
        hook_event_name: "SubagentStart",
        session_id: "claude-smoke-1",
        prompt_id: "claude-smoke-prompt-1",
        agent_type: "review",
      }),
      PreToolUse: JSON.stringify({
        hook_event_name: "PreToolUse",
        session_id: "claude-smoke-1",
        prompt_id: "claude-smoke-prompt-1",
        tool_name: "Skill",
        tool_input: { skill: "arcade:try-arcade" },
      }),
      PostToolUse: JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "claude-smoke-1",
        prompt_id: "claude-smoke-prompt-1",
        tool_name: "mcp__plugin_arcade_arcade__Gmail_ListEmails",
        tool_input: {},
        tool_response: {},
      }),
      PostToolUseFailure: JSON.stringify({
        hook_event_name: "PostToolUseFailure",
        session_id: "claude-smoke-1",
        prompt_id: "claude-smoke-prompt-1",
        tool_name: "mcp__plugin_arcade_arcade__Gmail_ListEmails",
        tool_input: {},
        error: "authorization required",
      }),
      SubagentStop: JSON.stringify({
        hook_event_name: "SubagentStop",
        session_id: "claude-smoke-1",
        prompt_id: "claude-smoke-prompt-1",
        agent_type: "arcade:arcade-operator",
        last_assistant_message: "status: completed",
      }),
      Stop: JSON.stringify({
        hook_event_name: "Stop",
        session_id: "claude-smoke-1",
        prompt_id: "claude-smoke-prompt-1",
      }),
      SessionEnd: JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "claude-smoke-1",
        reason: "other",
      }),
    },
  },
  {
    name: "cursor",
    manifest: "clients/cursor/hooks/hooks.json",
    rootToken: "CURSOR_PLUGIN_ROOT",
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

// Port 9 (discard) on loopback, so telemetry never reaches the network.
const telemetryEnv = (dataDir) => ({
  ARCADE_PLUGIN_TELEMETRY_HOST: "http://127.0.0.1:9",
  CLAUDE_PLUGIN_DATA: dataDir,
});

export const runManifestHookSmoke = (root) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "arcade-hook-smoke-"));
  try {
    return runAdapters(root, dataDir);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
};

const runAdapters = (root, dataDir) => {
  const errors = [];

  for (const adapter of MANIFEST_HOOK_ADAPTERS) {
    const hooksJson = readJson(root, adapter.manifest);
    const commands = extractHookCommands(hooksJson);

    for (const { event, command } of commands) {
      const stdin = adapter.stdinByEvent[event];
      if (stdin === undefined) {
        errors.push(
          `${adapter.name}: missing stdin fixture for ${event} in ${adapter.manifest}`,
        );
        continue;
      }

      const resolved = command.replaceAll(`\${${adapter.rootToken}}`, root);
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
        env: { ...process.env, ...pluginRootEnv(root), ...telemetryEnv(dataDir) },
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
