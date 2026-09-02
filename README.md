# Arcade Agents (staging preview)

> **Internal staging preview.** This plugin connects to Arcade's staging
> gateway (`api.bosslevel.dev`). Sign in with your **staging** account on
> `cloud.bosslevel.dev`. It is not a production release — do not distribute
> it as one.

Ask for what you want. The right Arcade tool runs across every app you've
connected. App sign-in happens in the browser. No API keys.

[Endpoint](https://api.bosslevel.dev/mcp/all-optimized) ·
[Agent Plugins 1.0.0](https://agent-plugins.org) ·
[v0.1.0](CHANGELOG.md) ·
[Apache-2.0](LICENSE)

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

[Download `arcade-agents.mcpb`](https://github.com/ArcadeAI/arcade-plugin/releases/latest/download/arcade-agents.mcpb)
and double-click to install — or add the gateway as a connector.
[Guide →](docs/install/claude-desktop.md)

### Tools only

Any MCP client (including OpenCode):

```text
https://api.bosslevel.dev/mcp/all-optimized
```

Cursor and VS Code also offer one-click MCP links (gateway only, no skills) in
the [install guides](docs/install/).

> **Staging deployment.** The gateway currently runs against Arcade staging,
> so sign in with your **staging** Arcade account (the sign-in page is served
> by `cloud.bosslevel.dev`, not `arcade.dev`).

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
- [Arcade staging dashboard](https://cloud.bosslevel.dev) — manage staging
  projects and gateways for this plugin.
- [Arcade production dashboard](https://app.arcade.dev) — configure
  production gateways when you graduate a proven workflow (see
  `scale-arcade`).
- [Architecture](ARCHITECTURE.md) — package layout and execution model.
- Privacy: tasks run through Arcade's hosted gateway and the apps you
  connect — [privacy policy](https://www.arcade.dev/privacy-policy).

## Develop

```bash
npm ci
npm run verify
```

`verify` runs structural checks, JSON Schema validation, hook/manifest
tests, `npx plugins discover`, and Claude plugin validation.

CI runs the same steps on push and pull request (`.github/workflows/check.yml`).

Tagged releases (`v*`) build and attach `arcade-agents.mcpb` for Claude
Desktop (`.github/workflows/release.yml`). Build locally with `npm run build:mcpb`.

## License

[Apache-2.0](LICENSE). Copyright (c) 2024–Present Arcade AI.
