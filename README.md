<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/arcade-wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/arcade-wordmark-light.svg">
    <img alt="Arcade" src="assets/arcade-wordmark-light.svg" width="340">
  </picture>
</p>

<h3 align="center">Plugin</h3>

<p align="center">
  Let any agent use Arcade. Ask for what you want and the right tool runs
  <br>across every app you've connected.
  <br>App sign-in happens in the browser. No API keys.
</p>

<p align="center">
  <a href="https://api.arcade.dev/mcp/arcade"><img alt="Endpoint" src="https://img.shields.io/badge/endpoint-api.arcade.dev%2Fmcp%2Farcade-ff5c37"></a>
  <a href="https://agent-plugins.org"><img alt="Agent Plugins 1.0.0" src="https://img.shields.io/badge/Agent_Plugins-1.0.0-4f46e5"></a>
  <a href="CHANGELOG.md"><img alt="Version" src="https://img.shields.io/github/v/release/ArcadeAI/arcade-plugin?label=version&color=555"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-555"></a>
</p>

---

> **Try Arcade in your agent.** This plugin is for calling tools and getting
> started with Arcade — connect apps, call tools, and explore what Arcade can do.
> For team-wide features (custom tool allowlists, fine-tuned governance, connecting your IDP, etc.), use the
> `scale-arcade` skill and the [Arcade dashboard](https://app.arcade.dev).

## Install

Every client below gets the same `arcade` MCP server at
`https://api.arcade.dev/mcp/arcade`. What else comes with it depends on the
client — the full breakdown is in the [support matrix](docs/support-matrix.md).

| Client | Install | Instructions |
|---|---|---|
| **Cursor** | [![Install in Cursor](https://img.shields.io/badge/Cursor-one--click-000000)](https://cursor.com/install-mcp?name=arcade&config=eyJ1cmwiOiJodHRwczovL2FwaS5hcmNhZGUuZGV2L21jcC9hcmNhZGUifQ==) | [cursor.md](docs/install/cursor.md) |
| **Claude Code** | [![Install in Claude Code](https://img.shields.io/badge/Claude_Code-install-d97757?logo=claude&logoColor=white)](docs/install/claude-code.md) | [claude-code.md](docs/install/claude-code.md) |
| **Claude Desktop** | [![Install in Claude Desktop](https://img.shields.io/badge/Claude_Desktop-marketplace-d97757?logo=claude&logoColor=white)](docs/install/claude-desktop.md) | [claude-desktop.md](docs/install/claude-desktop.md) |
| **VS Code** | [![Install in VS Code](https://img.shields.io/badge/VS_Code-one--click-0098FF?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=arcade&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.arcade.dev%2Fmcp%2Farcade%22%7D) | [vscode.md](docs/install/vscode.md) |
| **GitHub Copilot CLI** | [![Install in Copilot CLI](https://img.shields.io/badge/Copilot_CLI-install-24292e?logo=githubcopilot&logoColor=white)](docs/install/copilot.md) | [copilot.md](docs/install/copilot.md) |
| **Codex / ChatGPT** | [![Install in Codex](https://img.shields.io/badge/Codex_·_ChatGPT-install-000000?logo=openai&logoColor=white)](docs/install/codex.md) | [codex.md](docs/install/codex.md) |
| **OpenCode** | [![Install in OpenCode](https://img.shields.io/badge/OpenCode-install-333333?logo=iterm2&logoColor=white)](docs/install/opencode.md) | [opencode.md](docs/install/opencode.md) |
| **Grok Bot** | [![Install in Grok Bot](https://img.shields.io/badge/Grok_Bot-install-111111)](docs/install/grok-bot.md) | [grok-bot.md](docs/install/grok-bot.md) |
| **Any MCP client** | `https://api.arcade.dev/mcp/arcade` | [agent-plugins.md](docs/install/agent-plugins.md) |

Cursor and VS Code one-click badges add the gateway only. The linked guide
installs the skills too.

This repository is already the Claude marketplace. From Claude Code:

```bash
claude plugin marketplace add ArcadeAI/arcade-plugin
claude plugin install arcade@arcade
```

For Claude Code and GitHub Copilot CLI, you can also use the cross-client CLI:

```bash
npx plugins add ArcadeAI/arcade-plugin
```

It does not finish Cursor, VS Code, or Codex by itself. Use the linked guides
for those; the [install guide](docs/install/README.md#about-npx-plugins-add)
explains the CLI's limits. The marketplace name is `arcade`. If you already
installed an `arcade` marketplace from another repository, do not add this
one too: Claude treats them as the same marketplace and the second install
replaces the first. Use one install source per client to avoid duplicates.

### Install the ChatGPT ZIP

This path requires a ChatGPT account with plugin upload access. For a managed workspace, an eligible owner or admin uploads the plugin; members install it from their workspace's plugin directory.

1. Open [Arcade's official plugin releases](https://github.com/ArcadeAI/arcade-plugin/releases) in your browser.
2. Expand **Assets** on a release that includes the ChatGPT plugin and download `arcade-chatgpt-{VERSION}.zip`. Do not use GitHub's **Source code (zip)** download. If the ChatGPT ZIP is absent, that release does not include it. Keep the file compressed.
3. Open [ChatGPT on the web](https://chatgpt.com) in the account and workspace where you want to install Arcade. Use the plugin upload option available to your account and select the downloaded ZIP. For eligible workspace owners and admins, the path is **Admin console → your workspace → Plugins → Add → Upload plugin**.
4. Select **Install plugin** if prompted, then connect Arcade and sign in when prompted.

If you don't see an upload option, check your account's access or ask your workspace admin. Uploading a ZIP to an ordinary chat does not install it. This installation flow is separate from submitting a plugin for public publication.

Upload availability and where a plugin can run are separate. Plugins marked **Desktop only** require the ChatGPT desktop app.

See [OpenAI's plugin installation guide](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt).

## What each client gets

| | Tools | Skills | Subagent | Commands | Rule | Hooks |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Cursor IDE / Cloud Agents** | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **Cursor CLI** | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| **Claude Code** | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| **Claude Cowork** | ✅ | ✅ | ✅ | ✅ | — | partial |
| **GitHub Copilot CLI** | ✅ | ✅ | ✅ | — | — | ✅ |
| **VS Code (Copilot sessions)** | ✅ | ✅ | ✅ | — | — | ✅ |
| **Codex / ChatGPT local runtime** | ✅ | ✅ | — | — | — | — |
| **OpenCode** | ✅ | — | — | — | — | — |
| **Claude Desktop** | ✅ | ✅ | — | — | — | — |
| **Grok Bot** | ✅ | ✅ | — | — | — | — |
| **Any MCP client** | ✅ | — | — | — | — | — |

Skills are `try-arcade` and `scale-arcade`. The subagent is `arcade-operator`.
Commands, hooks, and the Cursor rule are client-specific. Routing-hook
support, client-version limits, and partial behavior are detailed in the
[support matrix](docs/support-matrix.md).

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

- [Plugin docs](https://docs.arcade.dev/en/get-started/agent-plugin) —
  prerequisites, install for each client, and connecting apps.
  [What's included](https://docs.arcade.dev/en/get-started/agent-plugin/whats-included)
  lists what each client gets.
- [Install guides](docs/install/) — quick install + one page per client
- [Client support matrix](docs/support-matrix.md) — what each install gets
- [Arcade docs](https://docs.arcade.dev/en/home) — product, APIs, SDKs, and
  setup. Agents can start from [llms.txt](https://docs.arcade.dev/llms.txt).
- [Arcade dashboard](https://app.arcade.dev) — org rollout, project gateways,
  identity, and tool policy (see `scale-arcade`).
- [Architecture](ARCHITECTURE.md) — package layout and execution model.
- Privacy: tasks run through Arcade's hosted gateway and the apps you
  connect — [privacy policy](https://www.arcade.dev/privacy-policy),
  [terms of service](https://www.arcade.dev/terms-of-service/).
- Support: [support@arcade.dev](mailto:support@arcade.dev).

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
lives in `dev/`, so installing the plugin doesn't install its packages.

```bash
cd dev
npm ci
npm run verify
```

Before the first `verify`, run the command in the "Download Cursor's
validator" step of `.github/workflows/check.yml` from `dev/`. Cursor publishes
its validator without a license, so the repository keeps no copy and no script
downloads it.

`verify` runs:

- the tests: hand-written file checks, a stale-generated-file check,
  every hook command in every client's manifest, and the Claude plugin
  directory's documented rules (`dev/test/directory-policy.test.mjs`)
- `claude plugin validate`, then a real Claude Code install into a temporary
  config that fails if Claude Code ran a package install
  (`dev/scripts/verify-claude-install.mjs`)
- Cursor's plugin validator (`dev/scripts/verify-cursor.mjs` checks the
  downloaded copy's hash, then runs it)
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
