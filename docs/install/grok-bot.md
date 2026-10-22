# Install in Grok Bot

Grok Bot uses this plugin's skills and the MCP connector. It does not run
hooks, commands, or agents.

The skills are `try-arcade` and `scale-arcade`. The connector is:

```text
https://api.arcade.dev/mcp/arcade
```

Inside Grok Bot, that connector shows up as an MCP namespace. The namespace
exposes `Arcade_ListApps`, `Arcade_SelectTools`, and `Arcade_UseTool`. Its
name is not always `arcade`. A team connector may use another name, such as
`Arcade Full-Suite`. `try-arcade` calls `Arcade_SelectTools` and
`Arcade_UseTool` on whichever namespace exposes those tools.

## Install or connect

Grok Bot installs this plugin from this repository. Which git ref it installs
is not verified here. The working assumption is `main`.

The official submission route for the Grok Bot marketplace is
[Submit a plugin](https://x.ai/bot/marketplace/submit-a-plugin). This page
does not confirm that Arcade is listed there.

Grok Bot's own docs describe how connectors are installed and how a team
allows them. This repository has not re-checked those screens, so the click
path lives on those pages:

- [Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) —
  Connect an app
- [Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications) —
  where installed plugins are listed
- [Grok Bot for teams and enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises) —
  team connector policy
- [Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting) — a plugin
  will not install or authenticate

## OAuth

No API keys. Sign-in happens in the browser, and each app is separate.

The gateway returns a browser sign-in link the first time a task needs an app
that is not connected. Connecting one app does not connect the others. That
is this plugin's behavior. How Grok Bot presents that per-app link has not
been verified here.

Grok Bot's docs say a plugin may still need browser authentication, and that
OAuth tokens for connectors stay on the connector backend
([teams and enterprises](https://docs.x.ai/grok-bot/teams-and-enterprises),
[settings](https://docs.x.ai/grok-bot/settings-and-notifications)). On a Team
Bot, a plugin that signs in with an account uses the person talking to the
Bot. Each teammate connects their own account the first time they need it
([Team Bots](https://docs.x.ai/grok-bot/team-bots)).

## Not supported

Hooks do not run. Commands (`/arcade-status`, `/arcade-connect`,
`/arcade-apps`) do not run. The `arcade-operator` agent does not run.

## First steps

- "What's on my calendar tomorrow?"
- "What apps can Arcade use?"
