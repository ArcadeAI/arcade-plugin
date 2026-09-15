# Client support matrix

Every install below connects to the same gateway,
`https://api.arcade.dev/mcp/arcade`. Sign-in happens in the
browser. The rows differ in how much of this plugin the client can load.

## Everything at a glance

| Client | Tools | Skills | Subagent | Commands | Rule | Hooks | Install |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **Cursor** | ✅ | 2 | ✅ | 3 | ✅ | ✅ | [guide](install/cursor.md) |
| **Claude Code** | ✅ | 2 | ✅ | 3 | — | 2 | [guide](install/claude-code.md) |
| **Claude Cowork / desktop** | ✅ | 2 | ✅ | 3 | — | 2 | [guide](install/claude-code.md) |
| **GitHub Copilot CLI** | ✅ | 2 | ✅ | — | — | — | [guide](install/copilot.md) |
| **VS Code** | ✅ | 2 | — | — | — | — | [guide](install/vscode.md) |
| **Codex / ChatGPT** | ✅ | 2 | — | — | — | ✅ 3 | [guide](install/codex.md) |
| **OpenCode** | ✅ | — | — | — | — | — | [guide](install/opencode.md) |
| **Claude Desktop** | ✅ | 2 | — | — | — | — | [guide](install/claude-desktop.md) |
| **Any MCP client** | ✅ | — | — | — | — | — | [guide](install/agent-plugins.md) |

Skills are `try-arcade` and `scale-arcade`. The subagent is
`arcade-operator`. Commands are `/arcade-apps`, `/arcade-connect`, and
`/arcade-status`.

Only skills and MCP servers are portable component types in
[Agent Plugins](https://agent-plugins.org) 1.0. Commands, the operator,
hooks, and the Cursor rule are client-specific, which is why those columns
thin out.

## How the same components reach each client

There is one copy of each component, at the location the most clients
already read:

| Component | Location | Read by |
|---|---|---|
| Skills | `skills/` | Every client with a skill system |
| MCP server | `mcp.json` | Agent Plugins clients (VS Code, Copilot CLI, Codex) |
| MCP server | `clients/cursor/mcp.json` | Cursor (via `.cursor-plugin/`) |
| MCP server | `clients/claude/mcp.json` | Claude Code (via `.claude-plugin/`) |
| Marketplace catalog | `.claude-plugin/marketplace.json` | Claude Desktop, Cowork, Claude Code |
| Desktop config | `clients/claude-desktop/claude_desktop_config.json` | Claude Desktop Chat (tools-only fallback) |
| Subagent | `agents/arcade-operator.agent.md` | Cursor, Claude Code, Copilot CLI |
| Commands | `commands/` | Cursor, Claude Code |
| Hooks | `hooks/hooks.json` | Claude Code |
| Hooks | `clients/cursor/hooks/hooks.json` | Cursor |
| Hooks | `com.openai/hooks/hooks.json` | Codex / ChatGPT (`SubagentStart`) |
| Codex adapter | `.codex-plugin/plugin.json` | Codex / ChatGPT |
| Rule | `clients/cursor/rules/` | Cursor |

The subagent filename ends in `.agent.md` so Copilot CLI can discover it.
Claude Code and Cursor accept any `.md`. Cursor now loads `agents/` because
`.cursor-plugin/plugin.json` points at it. VS Code still stays on the
portable core when it sees a root `plugin.json` with the Agent Plugins
`$schema`.

Claude's adapter uses `clients/claude/mcp.json` with `type: "http"`. Cursor
infers transport from `url` in `clients/cursor/mcp.json`.

Copilot CLI does not load `hooks/hooks.json`. Claude Code runs
`SessionStart` and `UserPromptSubmit` from that file. Codex loads the
`hooks/hooks.json` for session and prompt hooks plus
`com.openai/hooks/hooks.json` for `SubagentStart`.
Copilot's native hook schema differs; skills provide routing guidance on
that client.

Claude Desktop installs this repo as a plugin marketplace (see
[claude-desktop.md](install/claude-desktop.md)): add
`ArcadeAI/arcade-plugin`, then install `arcade@arcade`. Chat gets tools
and skills. A custom connector or the sample config remains the
tools-only fallback. There is no `.mcpb` Desktop Extension.

## Agent Plugins clients

These read root `plugin.json` and load the portable component types.

| | Cursor | VS Code | Copilot CLI | Codex / ChatGPT |
|---|---|---|---|---|
| **MCP tools** | ✅ | ✅ | ✅ | ✅ |
| **Skills (2)** | ✅ | ✅ | ✅ | ✅ |
| **Operator** | ✅ (`.cursor-plugin`) | — | ✅ (`agents/*.agent.md`) | — | — |

## Tools-only installs

A one-click MCP deeplink (or pasting the gateway URL) connects tools only.
Skills and the operator require installing this directory as a plugin.

- [Cursor](https://cursor.com/install-mcp?name=arcade&config=eyJ1cmwiOiJodHRwczovL2FwaS5hcmNhZGUuZGV2L21jcC9hcmNhZGUifQ==)
- [VS Code](https://vscode.dev/redirect/mcp/install?name=arcade&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.arcade.dev%2Fmcp%2Farcade%22%7D)
- OpenCode, Claude Desktop (connector fallback), any MCP client: `https://api.arcade.dev/mcp/arcade`
