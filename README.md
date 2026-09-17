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

### Full plugin

#### Cursor, Claude Code, VS Code, GitHub Copilot CLI, Codex / ChatGPT local runtime

```bash
npx plugins add ArcadeAI/arcade-plugin
```

Add `--target cursor` (or `claude-code`, `vscode`, `codex`, `copilot`) to
install to one client. See [install guides](docs/install/) for details.

### Claude Desktop

Add this repository as a plugin marketplace, then install Arcade.
[Guide →](docs/install/claude-desktop.md)

### Tools only

Any MCP client (including OpenCode):

```text
https://api.arcade.dev/mcp/arcade
```

Cursor and VS Code also offer one-click MCP links (gateway only, no skills) in
the [install guides](docs/install/).

## What each client gets

| Client | MCP | Skills | Subagents | Commands | Rules | Hooks |
| --- | :--: | :--: | :--: | :--: | :--: | :--: |
| **Cursor** | ✅ | ✅ 2 | ✅ | ✅ 3 | ✅ | ✅ |
| **Claude Code** | ✅ | ✅ 2 | ✅ | ✅ 3 | — | ✅ 3 |
| **Claude Cowork / Code desktop** | ✅ | ✅ 2 | ✅ | ✅ 3 | — | ✅ 3 |
| **GitHub Copilot CLI** | ✅ | ✅ 2 | ✅ | — | — | — |
| **VS Code** | ✅ | ✅ 2 | ✅ | — | — | — |
| **Codex / ChatGPT local runtime** | ✅ | ✅ 2 | — | — | — | ✅ 3 |
| **OpenCode** | ✅ | — | — | — | — | — |
| **Claude Desktop** | ✅ | ✅ 2 | — | — | — | — |
| **Any MCP client** | ✅ | — | — | — | — | — |

Skills are `try-arcade` and `scale-arcade`. The operator is
`arcade-operator`. Commands are `/arcade-apps`, `/arcade-connect`, and
`/arcade-status`. Cursor also gets an always-on rule and a session hook.
Claude Code and Cowork get session, per-turn, and subagent hooks. Copilot CLI and VS Code
load the operator from their namespaced adapter. Codex and the ChatGPT local
runtime get the same three lifecycle hooks (trust via `/hooks`). Web
installation does not deploy hook scripts. Claude Desktop Chat
loads tools and skills from the plugin marketplace. Full detail is
in the [support matrix](docs/support-matrix.md).

## Try it

- "What's on my calendar tomorrow?"
- "Summarize unread email from this week."
- "Draft a reply to that thread, then wait for me to send it."
- "What can Arcade do?"
- "We want this workflow on a team gateway. What should we set up?"
- `/try-arcade` or `/scale-arcade`
- `/arcade-status` — check the gateway, sign-in, and connected apps
- `/arcade-connect google` — connect an app ahead of time

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

Agents editing this repo should read [AGENTS.md](AGENTS.md) for hook adapter
rules. [ARCHITECTURE.md](ARCHITECTURE.md) covers the full contract and layout.

```bash
npm ci
npm run verify
```

`verify` runs structural checks, generated-manifest drift checks, JSON Schema
validation, hook contract validation, manifest-command hook smoke,
hook/manifest tests, `plugins discover`,
`claude plugin validate`, and Codex/Cursor adapter smoke scripts (pinned in
`package.json` devDependencies; CI uses Node 22.23.2).

CI runs the same steps on push and pull request (`.github/workflows/check.yml`).
Pull requests finish with a **`complete`** job that aggregates workflow jobs,
waits for **`Cursor Bugbot`** to finish with **`success`**, and follows the
aggregate pattern in
[evantahler/botholomew](https://github.com/evantahler/botholomew/blob/main/.github/workflows/ci.yml).
Use **`complete`** as the only required status check in branch protection.

## Release

Release Please opens a release PR on `main` with version bumps across `VERSION`,
adapter manifests, and `CHANGELOG.md`. Merge that PR to tag `v{VERSION}` and
create the GitHub release.

Configure paths in `release-please-config.json`. The workflow lives at
`.github/workflows/release-please.yml`.

## License

[MIT](LICENSE). Copyright (c) 2024–Present Arcade AI.
