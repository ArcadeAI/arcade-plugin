# Install Arcade

> **Staging preview.** Every install path below connects to
> `api.bosslevel.dev`. Use your **staging** Arcade account
> (`cloud.bosslevel.dev`). This package is for internal evaluation — not a
> production marketplace release.

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

After install, reload your agent if needed. The first connected-app task
returns a browser sign-in link — use your **staging** Arcade account.

## Tools only

Need just the MCP gateway, without skills or the operator?

```text
https://api.bosslevel.dev/mcp/all-optimized
```

**Claude Desktop:** download
[`arcade.mcpb`](https://github.com/ArcadeAI/arcade-plugin/releases/latest/download/arcade.mcpb)
(double-click to install) or use the connector URL above.

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
