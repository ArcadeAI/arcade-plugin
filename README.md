# Arcade

Arcade lets your AI agent read and act in your apps, such as Gmail, Google
Calendar, Slack, GitHub, Linear, and Notion. You sign in to each app in your
browser, and your agent doesn't receive the credentials. The plugin tells your
agent to ask you before it sends, creates, updates, or deletes anything.

## Install

Follow the [install guide](docs/install/README.md) for your client: Claude
Code, Codex, Cursor, VS Code, GitHub Copilot CLI, or Claude Desktop.

Other MCP clients can add the gateway directly. This gives them Arcade's tools
without the plugin's skills, commands, and hooks:

```text
https://api.arcade.dev/mcp/arcade
```

## Before you start

- An Arcade account from [app.arcade.dev](https://app.arcade.dev).
- Node.js on your `PATH` in Claude Code, the Cursor CLI, and Copilot CLI,
  which run the plugin's hook scripts with it.

## Try it

Ask your agent:

- "What's on my calendar tomorrow?"
- "Summarize unread email from this week."
- "Draft a reply to that thread, then wait for me to send it."

The first time a task needs an app, Arcade returns a sign-in link for it. You
don't need an API key.

Cursor, Claude Code, and Cowork also have commands: `/arcade-status` shows
sign-in and connected apps, `/arcade-connect google` connects an app ahead of
time, and `/arcade-apps` lists or disconnects apps. In Claude Code, add the
`arcade:` prefix, as in `/arcade:arcade-status`. The Cursor IDE doesn't show
them in the `/` menu. The [support matrix](docs/support-matrix.md) lists what
each client loads.

## What data goes where

- Your agent sends each task to Arcade's gateway. The gateway calls your
  connected apps with the access you approved and returns the result.
- The hook scripts run on your machine and add Arcade's routing rules to the
  model's context.
- Arcade's [privacy policy](https://www.arcade.dev/privacy-policy) covers what
  Arcade stores and for how long.

## Troubleshooting

- **Arcade asks you to sign in, or the `arcade` server shows zero tools:**
  sign in from your client's MCP settings (`/mcp` in Claude Code). In VS Code,
  run **MCP: List Servers**, choose `arcade`, then **Start Server**.
- **The `arcade` server is missing or fails to connect:** check that the
  plugin is installed and enabled. Then check
  [status.arcade.dev](https://status.arcade.dev) and any proxy or firewall
  that blocks `api.arcade.dev`.
- **An app isn't connected:** open the sign-in link Arcade returns, or ask
  your agent to connect the app.
- **An update doesn't show up:** in Claude Code, run
  `claude plugin marketplace update arcade` and
  `claude plugin update arcade@arcade`, then restart Claude Code. In Copilot
  CLI, run `copilot plugin update arcade`, then `/restart`. For a local Cursor
  install, run `git pull` in the plugin folder and reload the window.
- **Hooks don't run in the Cursor IDE, VS Code, or Codex:** those clients
  don't run plugin hooks. Skills and the gateway still work.

## For teams

To roll Arcade out to a team with a shared gateway, a chosen set of tools, and
sign-in through your identity provider, use the
[Arcade dashboard](https://app.arcade.dev) or ask your agent to use
`scale-arcade`.

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
