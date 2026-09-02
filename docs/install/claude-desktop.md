# Install in Claude Desktop

Claude Desktop Chat does not load this directory as an Agent Plugin. Use the
`.mcpb` extension for the full tool experience, or add the gateway as a remote
connector.

> **Staging deployment.** The gateway runs against Arcade staging. Sign in
> with your **staging** Arcade account (`cloud.bosslevel.dev`, not `arcade.dev`).

## One click: the `.mcpb` extension (recommended)

1. Download
   [`arcade-agents.mcpb`](https://github.com/ArcadeAI/arcade-plugin/releases/latest/download/arcade-agents.mcpb).
2. Double-click it (or drag it into the Claude Desktop window).
3. Click **Install**, then sign in with Arcade when prompted.

Requires Node.js (the bundle bridges Claude Desktop to the hosted server via
a pinned `mcp-remote` proxy).

The extension carries the MCP server and its instructions, so plain-language
requests like "what's on my calendar tomorrow?" work out of the box. Skills,
commands, and the operator subagent are Claude Code / Cowork plugin features
— see [claude-code.md](claude-code.md).

## Alternative: custom connector (paid plans)

**Settings → Connectors → Add custom connector** → paste:

```text
https://api.bosslevel.dev/mcp/all-optimized
```

Tools only; no extension needed.

## Alternative: config file

Merge
[`clients/claude-desktop/claude_desktop_config.json`](../../clients/claude-desktop/claude_desktop_config.json)
into your `claude_desktop_config.json` and restart Claude Desktop fully.

Extensions and connectors apply to Claude Desktop **Chat**. For Cowork and
Code in the desktop app, use the [Claude Code plugin](claude-code.md) instead.

## Rebuilding the bundle (maintainers)

```bash
node scripts/build-claude-desktop-mcpb.mjs
```

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser with your **staging** Arcade account.

## First steps

- "What's on my calendar tomorrow?"
- "What apps can Arcade use?"
