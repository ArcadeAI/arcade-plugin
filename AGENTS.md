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

Claude Code runs `SubagentStart` from `hooks/hooks.json` with
`${CLAUDE_PLUGIN_ROOT}` so built-in subagents get routing guidance when
`arcade-operator` is not used. `hooks/subagent-start.mjs` skips injection when
`agent_type` is `arcade-operator` or a plugin-scoped name ending in
`:arcade-operator`.

Claude Code also runs `hooks/telemetry.mjs` from `hooks/hooks.json` on nine
events. Rules for it:

- No hook in `hooks/hooks.json` is `async`. Claude Code kills async hooks
  when a session exits, and an async hook's `systemMessage` goes to the
  model instead of the user. `scripts/check.mjs` enforces this.
- `telemetry.mjs` prints nothing except the one-time notice on
  `SessionStart`.
- Never do network I/O in the hook process. Hand each send to the detached
  `hooks/telemetry-send.mjs` so the hook returns in about 60 ms.
- A new event property goes in the allowlist in `hooks/telemetry-events.mjs`
  and in [docs/telemetry.md](docs/telemetry.md). Anything not on the
  allowlist is dropped before sending.
- Telemetry is left out of the Cursor manifest for now. Cursor waits on
  almost every hook, so it would slow each tool call, and it passes the
  user's email to every hook.

**Codex hooks are parked** on branch `cursor/park-codex-hooks-gro-353-f8ad`.
Codex 0.154.0 and 0.155.1 parse `extensions.com.openai.hooks` (and the `.codex-plugin`
fallback) but the loader discards them for `AgentPlugin` format
([`loader.rs` L954–956](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/core-plugins/src/loader.rs#L954-L956);
[openai/codex#37027](https://github.com/openai/codex/pull/37027),
[openai/codex#39895](https://github.com/openai/codex/issues/39895)). Do not
drop root `$schema` to force hooks; that breaks Agent Plugins conformance.

`scripts/check.mjs` enforces this split. Run `npm run verify` after editing a
hook manifest.

More context: [ARCHITECTURE.md](ARCHITECTURE.md#portable-contract--generate--validate).
