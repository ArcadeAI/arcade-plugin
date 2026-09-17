import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
    name: "codex",
    manifest: "com.openai/hooks/hooks.json",
    rootToken: "PLUGIN_ROOT",
    stdinByEvent: {
      SessionStart: JSON.stringify({
        cwd: "/repo",
        hook_event_name: "SessionStart",
        model: "gpt-5",
        permission_mode: "default",
        session_id: "codex-smoke-1",
        source: "startup",
        transcript_path: null,
      }),
      UserPromptSubmit: JSON.stringify({
        cwd: "/repo",
        hook_event_name: "UserPromptSubmit",
        model: "gpt-5",
        permission_mode: "default",
        prompt: "What is on my calendar tomorrow?",
        session_id: "codex-smoke-1",
        transcript_path: null,
        turn_id: "turn-1",
      }),
      SubagentStart: JSON.stringify({
        agent_id: "agent-1",
        agent_type: "review",
        cwd: "/repo",
        hook_event_name: "SubagentStart",
        model: "gpt-5",
        permission_mode: "default",
        session_id: "codex-smoke-1",
        transcript_path: null,
        turn_id: "turn-1",
      }),
    },
  },
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
        prompt: "What is on my calendar tomorrow?",
      }),
      SubagentStart: JSON.stringify({
        hook_event_name: "SubagentStart",
        agent_type: "review",
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

export const runManifestHookSmoke = (root) => {
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
        env: { ...process.env, ...pluginRootEnv(root) },
      });

      if (result.status !== 0) {
        errors.push(
          `${adapter.name}: ${event} exited ${result.status} — ${result.stderr}`,
        );
        continue;
      }

      if (!result.stdout.trim()) {
        errors.push(`${adapter.name}: ${event} produced empty stdout`);
      }
    }
  }

  return errors;
};
