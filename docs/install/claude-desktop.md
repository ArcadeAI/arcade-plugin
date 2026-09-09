# Install in Claude Desktop

Add this repository as a plugin marketplace, then install Arcade. Claude
Desktop looks for `.claude-plugin/marketplace.json` — not a `.mcpb`
Desktop Extension, and not a one-click deeplink.

> **Personal trial.** Sign in with Arcade when prompted in the browser.

## Plugin (recommended)

**Customize → Plugins → Add marketplace → Add from a repository** → paste:

```text
ArcadeAI/arcade-plugin
```

Then install **Arcade** (`arcade@arcade`).

From Claude Code in the desktop app, or a terminal:

```bash
claude plugin marketplace add ArcadeAI/arcade-plugin
claude plugin install arcade@arcade
```

Chat gets tools and skills. Cowork and Code also get the operator,
commands, and hooks. There is no documented `claude://` link that adds a
marketplace; the steps above are the install.

This is the **staging** gateway (`api.bosslevel.dev`). A production endpoint
will replace it at public launch.

## Tools only

If you only want the gateway, skip the marketplace:

**Settings → Connectors → Add custom connector** → paste:

```text
https://api.bosslevel.dev/mcp/all-optimized
```

Or merge
[`clients/claude-desktop/claude_desktop_config.json`](../../clients/claude-desktop/claude_desktop_config.json)
into your `claude_desktop_config.json` and restart Claude Desktop fully.
The sample uses a pinned `mcp-remote` proxy to bridge to the hosted
gateway.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
- "What apps can Arcade use?"
