# Arcade

> **Try Arcade in your agent.** This plugin is for calling tools and getting
> started with Arcade — connect apps, call tools, and explore what Arcade can do.
> For team-wide features (custom tool allowlists, fine-tuned governance, connecting your IDP, etc.), use the
> `scale-arcade` skill and the [Arcade dashboard](https://app.arcade.dev).

Ask for what you want: email, calendar, Slack, issues, docs, and more.
Your agent picks the right tool across every app you've connected. Sign in
once in the browser without ever handing your agent a key.

[MCP Server](https://api.arcade.dev/mcp/arcade) ·
[Agent Plugins 1.0.0](https://agent-plugins.org) ·
[MIT](LICENSE)

---

## Install

Each client installs differently; the [install guide](docs/install/README.md)
has the one command for yours (Claude Code, Codex, Cursor, VS Code, Copilot
CLI, Claude Desktop).

### Tools only

Any MCP client (including OpenCode):

```text
https://api.arcade.dev/mcp/arcade
```

Cursor and VS Code also offer one-click MCP links (gateway only, no skills) in
the [install guides](docs/install/).

## What each client gets

Every client gets the Arcade gateway. How much of the rest it loads (skills,
the `arcade-operator` subagent, commands, hooks) depends on the client; see
the [support matrix](docs/support-matrix.md).

## Try it

- "What's on my calendar tomorrow?"
- "Summarize unread email from this week."
- "Draft a reply to that thread, then wait for me to send it."
- "What can Arcade do?"
- "We want this workflow on a team gateway. What should we set up?"
- `/try-arcade` or `/scale-arcade`
- `/arcade-status` — check the gateway, sign-in, and connected apps
- `/arcade-connect google` — connect an app ahead of time
- `/arcade-apps` — see or disconnect connected apps

Commands work in Cursor, Claude Code, and Cowork. The Cursor IDE doesn't list
them in the `/` menu; see the [support matrix](docs/support-matrix.md).

Your assistant speaks intent to Arcade. You see the useful result, a sign-in
link when an app isn't connected yet, and a confirmation prompt before
anything is sent, created, or deleted.

## Learn more

- [Install guides](docs/install/) — quick install + one page per client
- [Client support matrix](docs/support-matrix.md) — what each install gets
- [Arcade docs](https://docs.arcade.dev/en/home) — product, APIs, SDKs, and
  setup. Agents can start from [llms.txt](https://docs.arcade.dev/llms.txt).
- [Arcade dashboard](https://app.arcade.dev) — org rollout, project gateways,
  identity, and tool policy (see `scale-arcade`).
- [Architecture](ARCHITECTURE.md) — package layout and execution model.
- Privacy: tasks run through Arcade's hosted gateway and the apps you
  connect — [privacy policy](https://www.arcade.dev/privacy-policy).

## Plugin usage events (off in this build)

Claude Code and Copilot CLI include telemetry adapters, but **`TELEMETRY_ENABLED`
is `false`**: this package sends no usage events and generates no telemetry
hooks in client manifests. [docs/telemetry.md](docs/telemetry.md) describes
the event contract, what would be stored locally when enabled, opt-outs, and
the separate approval required before collection can be enabled. The Arcade MCP
gateway remains the canonical source for request and tool-call telemetry.
Adapter behavior is covered by in-process tests;
see [docs/telemetry.md](docs/telemetry.md) for what CI does and does not exercise.

## Develop

Agents editing this repo should read [AGENTS.md](AGENTS.md).
[ARCHITECTURE.md](ARCHITECTURE.md) lists the source files and what is
generated from them. The dev tooling (`package.json`, scripts, and tests)
lives in `dev/`, so installing the plugin doesn't install it.

```bash
cd dev
npm ci
npm run verify
```

`verify` runs:

- the tests: hand-written file checks, a stale-generated-file check,
  every hook command in every client's manifest, and the Claude plugin
  directory's documented rules (`dev/test/directory-policy.test.mjs`)
- `claude plugin validate`, then a real Claude Code install into a temporary
  config that fails if Claude Code ran a package install
  (`dev/scripts/verify-claude-install.mjs`)
- Cursor's plugin validator (`dev/scripts/verify-cursor.mjs` downloads it at a
  pinned commit)
- Codex and Copilot CLI checks (`dev/scripts/verify-codex.mjs`,
  `dev/scripts/verify-copilot.mjs`): neither client has a validate command, so
  these install the plugin into a temporary home and check that the client
  loaded every MCP server and skill

CI runs each of these as its own job (`.github/workflows/check.yml`). The
**`check`** job waits for all of them and, on pull requests, for Cursor
Bugbot. Branch protection on `main` requires `check`.

## Release

Release Please opens a release PR on `main` with version bumps across `VERSION`,
adapter manifests, and `CHANGELOG.md`. Merge that PR to tag `v{VERSION}` and
create the GitHub release.

Configure paths in `release-please-config.json`. The workflow lives at
`.github/workflows/release-please.yml`.

Each release also gets `arcade-chatgpt-{VERSION}.zip`, the package to upload
in OpenAI's plugin portal for the ChatGPT and Codex directory. It holds the
portable plugin only (`plugin.json` at the ZIP root, `mcp.json`, `skills/`,
the logo, and `LICENSE`), with no hooks or other clients' folders. Build it
locally with `npm run package:chatgpt` in `dev/` (writes `dist/` at the repo
root); the build fails if the `extensions.com.openai.interface` listing breaks
the portal's limits, such as the 30-character display name and subtitle
(`shortDescription`). See OpenAI's [submission guide](https://developers.openai.com/plugins/deploy/submission).

## License

[MIT](LICENSE). Copyright (c) 2024–Present Arcade AI.
