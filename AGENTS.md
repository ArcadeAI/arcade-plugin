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
  and allowed value; change them there only. Client-specific hook input mapping
  lives only in `hooks/telemetry-adapters/<host>.mjs`. Wire a client through
  `HOSTS.telemetry` in `hooks/hook-hosts.mjs` (generated manifests follow
  that source). `telemetry.mjs` prints nothing; only `telemetry-send.mjs` may
  touch the network (a test enforces both). `TELEMETRY_ENABLED` in
  `hooks/telemetry-config.mjs` stays `false` without separate approval; while
  false, `npm run generate` writes no telemetry hooks. Reporting and maintained
  docs for exports live in `scripts/telemetry-report.mjs` and
  `docs/telemetry.md`.
- Codex hooks are blocked upstream ([docs/install/codex.md](docs/install/codex.md)).
  Don't remove the root `$schema` to force them; that breaks Agent Plugins
  conformance.
