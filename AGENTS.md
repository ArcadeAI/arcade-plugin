# Agent guidance for this repository

This file is for agents editing **arcade-plugin** itself. End-user routing
rules live in skills and `clients/cursor/rules/arcade.mdc`.

## Hook adapter discipline

Hook **scripts** are shared under `hooks/*.mjs`. Hook **manifests** (`hooks.json`)
are per-host adapters, same as MCP configs and Cursor rules.

| Host | Manifest | Declared in |
| --- | --- | --- |
| Claude Code | `hooks/hooks.json` | default discovery |
| Cursor | `clients/cursor/hooks/hooks.json` | `.cursor-plugin/plugin.json` |
| Codex / ChatGPT local runtime | `com.openai/hooks/hooks.json` | `plugin.json` → `extensions.com.openai.hooks` |

Do not add Codex-only hook wiring to `hooks/hooks.json`. `SubagentStart` in
`com.openai/hooks/hooks.json` must use `${PLUGIN_ROOT}`. Claude Code also runs
`SubagentStart` from `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` so
built-in subagents get routing guidance when `arcade-operator` is not used.
`hooks/subagent-start.mjs` skips injection when `agent_type` is
`arcade-operator` or a plugin-scoped name ending in `:arcade-operator`.

`scripts/check.mjs` enforces this split. Run `npm run verify` after editing a
hook manifest.

More context: [ARCHITECTURE.md](ARCHITECTURE.md#portable-contract--generate--validate).
