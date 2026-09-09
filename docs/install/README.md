# Install Arcade

> **Personal trial.** This plugin is for trying Arcade in your agent — personal
> use and evaluation. For org rollout (Okta, project gateways, tool policy),
> use the `scale-arcade` skill and the [Arcade dashboard](https://app.arcade.dev).

## Quick install (recommended)

If your agent supports [Agent Plugins](https://agent-plugins.org), install
from GitHub with one command. The CLI auto-detects Cursor, Claude Code, Codex,
VS Code, and other supported tools on your machine:

```bash
npx plugins add ArcadeAI/arcade-plugin
```

Install to one tool only:

```bash
npx plugins add ArcadeAI/arcade-plugin --target cursor
npx plugins add ArcadeAI/arcade-plugin --target claude-code
npx plugins add ArcadeAI/arcade-plugin --target codex
npx plugins add ArcadeAI/arcade-plugin --target vscode
```

From a local checkout while developing:

```bash
npx plugins add /path/to/arcade-plugin
```

Dry run (see what would install, without writing files):

```bash
npx plugins discover ArcadeAI/arcade-plugin
```

After install, reload your agent if needed. The first external service task
returns a browser sign-in link — approve it when prompted.

## Tools only

Need just the MCP gateway, without skills or the operator?

```text
https://api.bosslevel.dev/mcp/all-optimized
```

**Claude Desktop:** add `ArcadeAI/arcade-plugin` as a plugin marketplace
(see [claude-desktop.md](claude-desktop.md)). A custom connector or the
sample config is the tools-only fallback.

Cursor and VS Code also have one-click MCP install links in the
[README](../README.md).

## Per-client guides

| Client | Guide |
|---|---|
| Cursor | [cursor.md](cursor.md) |
| Claude Code / Cowork | [claude-code.md](claude-code.md) |
| Claude Desktop | [claude-desktop.md](claude-desktop.md) |
| VS Code | [vscode.md](vscode.md) |
| GitHub Copilot CLI | [copilot.md](copilot.md) |
| Codex / ChatGPT | [codex.md](codex.md) |
| OpenCode | [opencode.md](opencode.md) |
| Any MCP / Agent Plugins client | [agent-plugins.md](agent-plugins.md) |

What each client actually loads is in the [support matrix](../support-matrix.md).
