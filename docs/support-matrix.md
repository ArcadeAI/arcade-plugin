# Client support matrix

Every install below connects to the same gateway,
`https://api.arcade.dev/mcp/arcade`. Sign-in happens in the
browser. The rows differ in how much of this plugin the client can load.

Machine-readable capability data lives in
[`support-matrix.capabilities.json`](support-matrix.capabilities.json) and is
checked in CI.

## Everything at a glance

| Client | Tools | Skills | Subagent | Commands | Rule | Hooks | Install |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **Cursor** | ✅ | 2 | ✅ | 3 | ✅ | ✅¹ | [guide](install/cursor.md) |
| **Claude Code** | ✅ | 2 | ✅ | 3 | — | 3 | [guide](install/claude-code.md) |
| **Claude Cowork / Code desktop** | ✅ | 2 | ✅ | 3 | — | 3 | [guide](install/claude-code.md) |
| **GitHub Copilot CLI** | ✅ | 2 | ✅ | — | — | — | [guide](install/copilot.md) |
| **VS Code** | ✅ | 2 | ✅ | — | — | — | [guide](install/vscode.md) |
| **Codex / ChatGPT local runtime** | ✅ | 2 | — | — | — | ✅² 3 | [guide](install/codex.md) |
| **OpenCode** | ✅ | — | — | — | — | — | [guide](install/opencode.md) |
| **Claude Desktop** | ✅ | 2 | — | — | — | — | [guide](install/claude-desktop.md) |
| **Any MCP client** | ✅ | — | — | — | — | — | [guide](install/agent-plugins.md) |

¹ Cursor plugin hooks apply to the IDE and CLI. Cloud Agents load hooks from
project, team, or enterprise settings instead.

² Codex runs plugin hooks only after you trust them in `/hooks`.

Skills are `try-arcade` and `scale-arcade`. The subagent is
`arcade-operator`. In Cursor the commands are `/arcade-apps`, `/arcade-connect`,
and `/arcade-status`. In Claude Code they appear as `/arcade:arcade-apps`,
`/arcade:arcade-connect`, and `/arcade:arcade-status`.

Only skills and MCP servers are portable component types in
[Agent Plugins](https://agent-plugins.org) 1.0. Commands, the operator,
hooks, and the Cursor rule are client-specific, which is why those columns
thin out.

## How the same components reach each client

Portable components stay shared. Client-specific projections are generated
where a host requires a different discovery path:

| Component | Location | Read by |
|---|---|---|
| Skills | `skills/` | Every client with a skill system |
| MCP server | `mcp.json` | Agent Plugins clients (VS Code, Copilot CLI, Codex) |
| MCP server | `clients/cursor/mcp.json` | Cursor (via `.cursor-plugin/`) |
| MCP server | `clients/claude/mcp.json` | Claude Code (via `.claude-plugin/`) |
| Marketplace catalog | `.claude-plugin/marketplace.json` | Claude Desktop, Cowork, Claude Code |
| Desktop config | `clients/claude-desktop/claude_desktop_config.json` | Claude Desktop Chat (tools-only fallback) |
| Subagent source | `agents/arcade-operator.agent.md` | Cursor, Claude Code |
| Subagent projection | `com.github.copilot/agents/arcade-operator.agent.md` | Copilot CLI, VS Code |
| Commands | `commands/arcade-*.md` | Cursor, Claude Code |
| Hooks | `hooks/hooks.json` | Claude Code |
| Hooks | `clients/cursor/hooks/hooks.json` | Cursor IDE / CLI |
| Hooks | `com.openai/hooks/hooks.json` | Codex / ChatGPT local runtime |
| OpenAI extension | `plugin.json` → `extensions.com.openai` | Codex / ChatGPT local runtime |
| Codex listing metadata | `plugin.json` → `extensions.com.openai.interface` | Codex / ChatGPT local runtime |
| Codex fallback | `.codex-plugin/plugin.json` | Legacy loaders without `extensions.com.openai` |
| Rule | `clients/cursor/rules/` | Cursor |

Claude Code and Cursor load the canonical file under `agents/`. Copilot CLI
and VS Code apply Agent Plugins 1.0 semantics and load custom agents from the
`com.github.copilot/agents/` client extension directory. That file is generated
from the canonical operator, and `npm run generate:check` rejects drift.

Claude's adapter uses `clients/claude/mcp.json` with `type: "http"`. Cursor
infers transport from `url` in `clients/cursor/mcp.json`.

Copilot CLI does not load `hooks/hooks.json`. Claude Code runs
`SessionStart`, `UserPromptSubmit`, and `SubagentStart` from that file. Codex
runs the same three lifecycle hooks from `com.openai/hooks/hooks.json`, selected
by the portable manifest's OpenAI extension.
Copilot's native hook schema differs; skills provide routing guidance on
that client.

Claude Desktop installs this repo as a plugin marketplace (see
[claude-desktop.md](install/claude-desktop.md)): add
`ArcadeAI/arcade-plugin`, then install `arcade@arcade`. Chat gets tools
and skills. A custom connector or the sample config remains the
tools-only fallback. There is no `.mcpb` Desktop Extension.

## Agent Plugins clients

These read root `plugin.json` and load the portable component types.

| | Cursor | VS Code | Copilot CLI | Codex / ChatGPT local runtime |
|---|---|---|---|---|
| **MCP tools** | ✅ | ✅ | ✅ | ✅ |
| **Skills (2)** | ✅ | ✅ | ✅ | ✅ |
| **Operator** | ✅ (`.cursor-plugin`) | ✅ (`com.github.copilot`) | ✅ (`com.github.copilot`) | — (use `try-arcade`) |

## Tools-only installs

A one-click MCP deeplink (or pasting the gateway URL) connects tools only.
Skills and the operator require installing this directory as a plugin.

- [Cursor](https://cursor.com/install-mcp?name=arcade&config=eyJ1cmwiOiJodHRwczovL2FwaS5hcmNhZGUuZGV2L21jcC9hcmNhZGUifQ==)
- [VS Code](https://vscode.dev/redirect/mcp/install?name=arcade&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.arcade.dev%2Fmcp%2Farcade%22%7D)
- OpenCode, Claude Desktop (connector fallback), any MCP client: `https://api.arcade.dev/mcp/arcade`
