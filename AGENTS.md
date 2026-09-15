# Agent guidance for this repository

This file is for agents editing **arcade-plugin** itself. End-user routing
rules live in skills and `clients/cursor/rules/arcade.mdc`.

## Hook adapter discipline

Hook **scripts** are shared under `hooks/*.mjs`. Hook **manifests** (`hooks.json`)
are per-host adapters, same as MCP configs and Cursor rules.

| Host | Manifest | Declared in |
| --- | --- | --- |
| Claude Code | `hooks/hooks.json` + `clients/claude/hooks/hooks.json` | `.claude-plugin/plugin.json` (array) |
| Cursor | `clients/cursor/hooks/hooks.json` | `.cursor-plugin/plugin.json` |
| Codex / ChatGPT | `hooks/hooks.json` + `com.openai/hooks/hooks.json` | `plugin.json` extension + `.codex-plugin/plugin.json` fallback |

`hooks/hooks.json` is shared by Claude Code and Codex for **session and prompt**
hooks only.

- Claude-only events (for example `PostToolUse`) go in
  `clients/claude/hooks/hooks.json`.
- Codex-only events (for example `SubagentStart`) go in
  `com.openai/hooks/hooks.json` and must use `${PLUGIN_ROOT}`.

`scripts/check.mjs` enforces this split. After editing hook manifests, run
`npm run verify`.

More context: [ARCHITECTURE.md](ARCHITECTURE.md#portable-contract--generate--validate).
