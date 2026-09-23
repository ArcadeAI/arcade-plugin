# Agent guidance for this repository

This file is for agents editing **arcade-plugin** itself. End-user routing
rules live in skills and `clients/cursor/rules/arcade.mdc`.

## Generated files

Most client-specific files are generated. Edit the source, then run
`npm run generate`; `npm run verify` fails if a generated file was edited by
hand. [ARCHITECTURE.md](ARCHITECTURE.md#sources-and-generated-files) lists
the sources and outputs, and `.gitattributes` lists every generated file.

- Routing rules: `hooks/routing-guidance.mjs`. Never edit the rules text in
  the Cursor rule, arcade-operator, or try-arcade directly.
- Hooks: `hooks/hook-hosts.mjs` lists each hook script and the event name each
  host uses for it. Add a hook or a host there; don't write `hooks.json` by
  hand.

`hooks/subagent-start.mjs` skips injection when `agent_type` is
`arcade-operator` or a plugin-scoped name ending in `:arcade-operator`.

**Codex hooks are parked** on branch `cursor/park-codex-hooks-gro-353-f8ad`.
Codex 0.154.0 and 0.155.1 parse `extensions.com.openai.hooks` but the loader discards them for `AgentPlugin` format
([`loader.rs` L954–956](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/core-plugins/src/loader.rs#L954-L956);
[openai/codex#37027](https://github.com/openai/codex/pull/37027),
[openai/codex#39895](https://github.com/openai/codex/issues/39895)). Do not
drop root `$schema` to force hooks; that breaks Agent Plugins conformance.

More context: [ARCHITECTURE.md](ARCHITECTURE.md#portable-contract--generate--validate).
