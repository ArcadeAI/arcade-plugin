# Arcade

> **Try Arcade in your agent.** This plugin is for personal trials and getting
> started — connect apps, run tasks, and explore what Arcade can do. For
> org-wide rollout (Okta, tool allowlists, project gateways), use the
> `scale-arcade` skill and the [Arcade dashboard](https://app.arcade.dev).

Ask for what you want — email, calendar, Slack, issues, docs, and more.
Your agent picks the right tool across every app you've connected. Sign in
once in the browser — without ever handing your agent a key.

[Endpoint](https://api.bosslevel.dev/mcp/all-optimized) ·
[Agent Plugins 1.0.0](https://agent-plugins.org) ·
[v0.1.0](CHANGELOG.md) ·
[MIT](LICENSE)

---

## Install

### Full plugin

**Cursor, Claude Code, VS Code, GitHub Copilot CLI, Codex / ChatGPT**

```bash
npx plugins add ArcadeAI/arcade-plugin
```

Add `--target cursor` (or `claude-code`, `vscode`, `codex`, `copilot`) to
install to one client. See [install guides](docs/install/) for details.

### Claude Desktop

[Download `arcade.mcpb`](https://github.com/ArcadeAI/arcade-plugin/releases/latest/download/arcade.mcpb)
and double-click to install — or add the gateway as a connector.
[Guide →](docs/install/claude-desktop.md)

### Tools only

Any MCP client (including OpenCode):

```text
https://api.bosslevel.dev/mcp/all-optimized
```

Cursor and VS Code also offer one-click MCP links (gateway only, no skills) in
the [install guides](docs/install/).

## What each client gets

| | Tools | Skills | Subagent | Commands | Rule | Hooks |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Cursor** | ✅ | ✅ 2 | ✅ | ✅ 3 | ✅ | ✅ |
| **Claude Code** | ✅ | ✅ 2 | ✅ | ✅ 3 | — | ✅ 2 |
| **Claude Cowork / desktop** | ✅ | ✅ 2 | ✅ | ✅ 3 | — | ✅ 2 |
| **GitHub Copilot CLI** | ✅ | ✅ 2 | ✅ | — | — | — |
| **VS Code** | ✅ | ✅ 2 | — | — | — | — |
| **Codex / ChatGPT** | ✅ | ✅ 2 | — | — | — | — |
| **OpenCode** | ✅ | — | — | — | — | — |
| **Claude Desktop** | ✅ | — | — | — | — | — |
| **Any MCP client** | ✅ | — | — | — | — | — |

Skills are `try-arcade` and `scale-arcade`. The operator is
`arcade-operator`. Commands are `/arcade-apps`, `/arcade-connect`, and
`/arcade-status`. Cursor also gets an always-on rule and a session hook;
Claude Code gets session and per-turn hooks. Full detail is in the
[support matrix](docs/support-matrix.md).

## Try it

- "What's on my calendar tomorrow?"
- "Summarize unread email from this week."
- "Draft a reply to that thread, then wait for me to send it."
- "What can Arcade do?"
- "We want this workflow on a team gateway — what should we set up?"
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

```bash
npm ci
npm run verify
```

`verify` runs structural checks, JSON Schema validation, hook/manifest
tests, `plugins discover`, and `claude plugin validate` (pinned in
`package.json` devDependencies; CI uses Node 22.23.2).

CI runs the same steps on push and pull request (`.github/workflows/check.yml`).

Tagged releases (`v*`) build and attach `arcade.mcpb` for Claude
Desktop (`.github/workflows/release.yml`). Build locally with `npm run build:mcpb`.

## License

[MIT](LICENSE). Copyright (c) 2024–Present Arcade AI.
