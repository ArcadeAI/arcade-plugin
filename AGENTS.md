# Agent guidance for this repository

For agents editing **arcade-plugin** itself.

Client-specific files are generated. Edit the source, run `npm run generate`,
then `npm run verify` (it fails if a generated file was edited by hand).
[ARCHITECTURE.md](ARCHITECTURE.md) lists the sources; `.gitattributes` lists
every fully generated file. `skills/try-arcade/SKILL.md` and
`agents/arcade-operator.agent.md` are hand-written except
for a marked rules block.

- Routing rules: edit `hooks/routing-guidance.mjs`, never the rules text in
  the Cursor rule, arcade-operator, or try-arcade.
- Hooks: add a hook or a client in `hooks/hook-hosts.mjs`, never in a
  `hooks.json`. A new client also needs its expected output in
  `test/hooks.test.mjs`.
- Telemetry: `hooks/telemetry-contract.mjs` defines every event, property,
  and allowed value; change them there only. The builder sends nothing else,
  `npm run generate` writes the tables in `docs/telemetry.md`, and the tests
  check every built event against its schema and the telemetry rows in
  `hooks/hook-hosts.mjs` against its hooks. `telemetry.mjs` prints nothing,
  and only `telemetry-send.mjs` may touch the
  network (a test enforces both). Telemetry files start with `// @ts-check`
  and `npm run typecheck` runs `tsc` on them; nothing is compiled.
- Telemetry runs in Claude Code only. It reads Claude Code's hook input and
  keeps its one file, the `arcade-used` flag, in Claude Code's plugin data
  folder. Nothing that lasts across sessions is sent. Cursor, Copilot CLI, and
  VS Code need their own input mapping and a place for the flag first.
- Codex hooks are blocked upstream ([docs/install/codex.md](docs/install/codex.md)).
  Don't remove the root `$schema` to force them; that breaks Agent Plugins
  conformance.
