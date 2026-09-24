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

## Develop

Agents editing this repo should read [AGENTS.md](AGENTS.md).
[ARCHITECTURE.md](ARCHITECTURE.md) lists the source files and what is
generated from them.

```bash
npm ci
npm run verify
```

`verify` runs the tests (hand-written file checks, a stale-generated-file
check, and every hook command in every client's manifest), then
`plugins discover` and `claude plugin validate`.

CI runs the same steps (`.github/workflows/check.yml`). On pull requests the
**`complete`** job also waits for Cursor Bugbot; make `complete` the only
required status check.

## Release

Release Please opens a release PR on `main` with version bumps across `VERSION`,
adapter manifests, and `CHANGELOG.md`. Merge that PR to tag `v{VERSION}` and
create the GitHub release. The workflow opens that PR with `GITHUB_TOKEN`,
which doesn't start other workflows, so it then starts `check` on the release
branch itself.

Configure paths in `release-please-config.json`. The workflow lives at
`.github/workflows/release-please.yml`.

## License

[MIT](LICENSE). Copyright (c) 2024–Present Arcade AI.
