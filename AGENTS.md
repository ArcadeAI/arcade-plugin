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
| Codex / ChatGPT | `hooks/hooks.json` + `com.openai/hooks/hooks.json` | `.codex-plugin/plugin.json` (array) |

Do not add client-specific hook events to `hooks/hooks.json`. Codex-only events
such as `SubagentStart` belong in `com.openai/hooks/hooks.json` and must use
`${PLUGIN_ROOT}`.

`scripts/check.mjs` and `contract/inventory.json` enforce this split. After
editing hook manifests, run `npm run generate` so inventory digests stay current.

More context: [ARCHITECTURE.md](ARCHITECTURE.md#contract--generate--validate).
