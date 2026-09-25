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

Commands work in Cursor, Claude Code, and Cowork. In Claude Code they start
with `arcade:`, for example `/arcade:arcade-status`. The Cursor IDE doesn't
list them in the `/` menu; see the [support matrix](docs/support-matrix.md).
In other clients, ask your agent instead, for example "Connect my Google
account through Arcade."

Your assistant speaks intent to Arcade. You see the useful result, a sign-in
link when an app isn't connected yet, and a confirmation prompt before
anything is sent, created, or deleted.

## Before you start

- An Arcade account ([app.arcade.dev](https://app.arcade.dev)). Your client
  opens a browser sign-in the first time it connects to the gateway.
- Each app (Google, Slack, GitHub, and so on) gets its own browser sign-in,
  either the first time a task needs it or ahead of time. To connect one
  ahead of time, ask your agent to connect it. In clients with commands you
  can also run `/arcade-connect` (`/arcade:arcade-connect` in Claude Code).
- Node.js on your `PATH`, for the hook scripts in Claude Code, the Cursor CLI,
  and Copilot CLI.

## What data goes where

- Your agent sends each task to Arcade's gateway,
  `https://api.arcade.dev/mcp/arcade`. The gateway calls the apps you
  connected, using the access you approved when you signed in, and returns
  the result to your agent. Your agent never gets your app credentials.
- The hook scripts run on your machine. They add Arcade's routing rules to
  the model's context.
- Arcade's [privacy policy](https://www.arcade.dev/privacy-policy) covers
  what Arcade stores and for how long.

## Troubleshooting

- **Arcade asks you to sign in, or the `arcade` server shows zero tools.**
  The `arcade` MCP server isn't signed in. Sign in from your client's MCP
  settings (`/mcp` in Claude Code). In VS Code, run **MCP: List Servers**,
  choose `arcade`, then **Start Server** and sign in.
- **The `arcade` server is missing or fails to connect.** This is a setup or
  connection problem, not a sign-in problem. Check that the plugin is
  installed and enabled and that `arcade` is listed in your client's MCP
  settings. Then check [status.arcade.dev](https://status.arcade.dev) and any
  proxy or firewall between you and `api.arcade.dev`. The plugin reports the
  error instead of finishing the task another way.
- **An app isn't connected.** Open the sign-in link Arcade returns, or ask
  your agent to connect the app. In clients with commands,
  `/arcade-connect <app>` does the same and `/arcade-status` shows what's
  connected (`/arcade:arcade-connect` and `/arcade:arcade-status` in Claude
  Code).
- **An update doesn't show up.** In Claude Code, run
  `claude plugin marketplace update arcade`, then
  `claude plugin update arcade@arcade`, then restart Claude Code. For a local
  Cursor install, run `git pull` in the plugin folder and reload the window.
  In Copilot CLI, run `copilot plugin update arcade`, then `/restart`.
- **Hooks don't run in the Cursor IDE, VS Code, or Codex.** That's a client
  limit, not a broken install; the skills and the gateway still work. See the
  [support matrix](docs/support-matrix.md).

## Support

- Bugs in this plugin: [GitHub issues](https://github.com/ArcadeAI/arcade-plugin/issues)
- Questions and community help: [Arcade Discord](https://discord.gg/GUZEMpEZ9p)
- Email support (paid plans) and sales: [Contact us](https://docs.arcade.dev/en/resources/contact-us)
- Service status: [status.arcade.dev](https://status.arcade.dev)
- Security reports: [SECURITY.md](SECURITY.md)
- [Terms of service](https://www.arcade.dev/terms) ·
  [Privacy policy](https://www.arcade.dev/privacy-policy)

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
create the GitHub release.

Configure paths in `release-please-config.json`. The workflow lives at
`.github/workflows/release-please.yml`.

## License

[MIT](LICENSE). Copyright (c) 2024–Present Arcade AI.
