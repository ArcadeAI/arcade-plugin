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

Do not add Arcade's client-specific hook wiring to `hooks/hooks.json`.
`SubagentStart` is intentionally wired only for Codex because Codex cannot load
the custom `arcade-operator`; it belongs in `com.openai/hooks/hooks.json` and
must use `${PLUGIN_ROOT}`.

`scripts/check.mjs` enforces this split. Run `npm run verify` after editing a
hook manifest.

More context: [ARCHITECTURE.md](ARCHITECTURE.md#portable-contract--generate--validate).
