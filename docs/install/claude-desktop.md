# Install in Claude Desktop

Claude Desktop Chat does not load this directory as an Agent Plugin. Add the
gateway as a remote connector or merge the sample config below.

> **Personal trial.** Sign in with Arcade when prompted in the browser.

## Custom connector (recommended)

**Settings → Connectors → Add custom connector** → paste:

```text
https://api.bosslevel.dev/mcp/all-optimized
```

This is the **staging** gateway (`api.bosslevel.dev`). A production endpoint
will replace it at public launch.

Tools only — no skills, commands, or operator subagent. For those, use the
[Claude Code plugin](claude-code.md) in Cowork or Code.

## Config file

Merge
[`clients/claude-desktop/claude_desktop_config.json`](../../clients/claude-desktop/claude_desktop_config.json)
into your `claude_desktop_config.json` and restart Claude Desktop fully. The
sample uses a pinned `mcp-remote` proxy to bridge Claude Desktop to the hosted
gateway.

Connectors and config apply to Claude Desktop **Chat**. For Cowork and Code in
the desktop app, use the [Claude Code plugin](claude-code.md) instead.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- "What apps can Arcade use?"
