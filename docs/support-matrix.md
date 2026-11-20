# Client support matrix

Every install below connects to the same gateway,
`https://api.arcade.dev/mcp/arcade`. Sign-in happens in the
browser. The rows differ in how much of this plugin the client can load.

## Everything at a glance

| Client | Tools | Skills | Subagent | Commands | Rule | Hooks | Install |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **Cursor IDE / Cloud Agents** | ✅ | ✅ | ✅ | ✅¹ | ✅ | —² | [guide](install/cursor.md) |
| **Cursor CLI** | ✅ | ✅ | ✅ | ✅ | — | ✅³ | [guide](install/cursor.md) |
| **Claude Code (CLI and desktop Code tab)** | ✅ | ✅ | ✅ | ✅ | — | ✅⁴ | [guide](install/claude-code.md) |
| **Claude Cowork** | ✅ | ✅ | ✅ | ✅ | — | Partial⁴ | [guide](install/claude-code.md) |
| **GitHub Copilot CLI** | ✅ | ✅ | ✅ | — | — | ✅⁵ | [guide](install/copilot.md) |
| **VS Code (Copilot sessions)** | ✅ | ✅ | ✅ | — | — | ✅⁶ | [guide](install/vscode.md) |
| **Codex / ChatGPT local runtime** | ✅ | ✅ | — | — | — | —⁷ | [guide](install/codex.md) |
| **OpenCode** | ✅ | — | — | — | — | — | [guide](install/opencode.md) |
| **Claude Desktop** | ✅ | ✅ | — | — | — | — | [guide](install/claude-desktop.md) |
| **Grok Bot**⁸ | ✅ | ✅ | — | — | — | — | [guide](install/grok-bot.md) |
| **Any MCP client** | ✅ | — | — | — | — | — | [guide](install/agent-plugins.md) |

Hooks add the routing rules at session start, to each prompt, and to
subagents. In the Hooks column, ✅ means the session-start hook runs, so the
full rules reach the main conversation. Partial means some hooks run but the
session-start text doesn't reach the main conversation. The files are
`.claude-plugin/hooks.json` (direct Claude marketplace installs),
`clients/cursor/hooks/hooks.json` (Cursor CLI), and
`com.github.copilot/hooks/hooks.json` (Copilot CLI and VS Code Copilot sessions).

Telemetry adapters are separate from routing. **`TELEMETRY_ENABLED` is false**
in this build, so manifests include no telemetry hooks and nothing is sent.
The Claude Directory bundle excludes the adapters. Development wiring comes
from `plugin/hooks/hook-hosts.mjs`:

| Client adapter | Telemetry events (when enabled) |
| --- | --- |
| Claude Code | `UserPromptSubmit`, `PreToolUse` on `^(?:mcp__plugin_arcade_arcade__\|mcp__claude_ai_arcade__)`, MCP `PostToolUse` / `PostToolUseFailure`, built-in `WebFetch` / `WebSearch` / listed `Bash` CLIs, Arcade operator `SubagentStop` |
| Copilot CLI | `UserPromptSubmit`, MCP `PostToolUse` / `PostToolUseFailure` (`<server>-<tool>`), Arcade operator `SubagentStop` with `subagent_session` (no `PreToolUse`, no `turn`, no built-in tools) |

Session start sends no telemetry event. No other adapter in this package sends telemetry. See
[what's sent and its limits](telemetry.md).

¹ The Cursor IDE (3.21.18) lists the commands on the plugin page but not in
the `/` menu. Other plugins' commands don't appear there either.
² The IDE (3.21.18) and Cloud Agents don't run plugin hooks, so the
always-apply rule carries the full session rules. Cloud Agents run repo, team,
and enterprise hooks only; they get the rule and the skill.
³ Session hook only. The CLI runs the session hook (full rules) but doesn't
load the always-apply rule.
⁴ Applies to direct installs from the GitHub marketplace. Cowork does not
inject the session-start context into the main conversation. Claude Directory
installs use the routing instructions in `try-arcade` without hooks.
⁵ Copilot CLI drops the output of **routing** prompt hooks from config files,
so the main conversation gets session and subagent hooks only. Telemetry still
hooks `UserPromptSubmit` when enabled; `reminder_sent` is always `false` there.
⁶ VS Code Copilot sessions use the shared Copilot hook implementation: this
plugin supplies `SessionStart` and `SubagentStart` routing guidance through
`com.github.copilot/hooks/hooks.json`. Support depends on the selected harness
and VS Code version; see the [VS Code guide](install/vscode.md) for sources and
validation limits.
⁷ Blocked upstream; see [codex.md](install/codex.md).
⁸ Skills and the MCP connector only. The connector namespace is not always
named `arcade`. See [grok-bot.md](install/grok-bot.md).

Skills are `try-arcade` and `scale-arcade`. The subagent is
`arcade-operator`. In Cursor the commands are `/arcade-apps`,
`/arcade-connect`, and `/arcade-status`. In Claude Code they appear as
`/arcade:arcade-apps`, `/arcade:arcade-connect`, and
`/arcade:arcade-status`.

Only skills and MCP servers are portable component types in
[Agent Plugins](https://agent-plugins.org) 1.0. Commands, the operator,
hooks, and the Cursor rule are client-specific, which is why those columns
thin out.

## Where each client finds the pieces

Files a client needs at its own path are generated from shared sources (see
[ARCHITECTURE.md](../ARCHITECTURE.md)). In this repository those files live
under `plugin/`. The Claude Directory bundle uses generated copies in `clients/claude/`.
Paths in the table are relative to `plugin/`, except for Claude, marketplace,
and local-clone paths.

| Piece | File | Read by |
|---|---|---|
| Skills | `skills/` (Claude Directory: `clients/claude/skills/`) | every client with skills |
| MCP server | `mcp.json` | VS Code, Copilot CLI, Codex |
| MCP server | inline in `.cursor-plugin/plugin.json` or `.claude-plugin/plugin.json` | Cursor / Claude |
| Operator | `agents/arcade-operator.agent.md` | Cursor, Claude Code, Cowork |
| Operator (generated copy) | `com.github.copilot/agents/arcade-operator.agent.md` | Copilot CLI, VS Code |
| Commands | `commands/arcade-*.md` | Cursor, Claude Code, Cowork |
| Rule | `clients/cursor/rules/arcade.mdc` | Cursor IDE / Cloud Agents |
| Marketplace | `.claude-plugin/marketplace.json` (source `./plugin`) | Claude Desktop, Cowork, Claude Code |
| Marketplace | `.agents/plugins/marketplace.json` (source `./plugin`) | Codex |
| Marketplace | `.cursor-plugin/marketplace.json` (source `plugin`) | Cursor team marketplace import |
| Local clone | `.cursor-plugin/plugin.json` and `.cursor-plugin/hooks.json` at the repo root, pointing into `plugin/` | Cursor local loader |
| Codex listing | `plugin.json` → `extensions.com.openai.interface` | Codex |

Claude Desktop installs this repo as a plugin marketplace (see
[claude-desktop.md](install/claude-desktop.md)): add
`ArcadeAI/arcade-plugin`, then install `arcade@arcade`. Chat gets tools
and skills. A custom connector with the gateway URL is the tools-only
fallback. There is no `.mcpb` Desktop Extension.

## Tools-only installs

A one-click MCP link (or pasting the gateway URL) connects tools only. Skills
and the operator need the plugin install. Cursor and VS Code links are in
[cursor.md](install/cursor.md) and [vscode.md](install/vscode.md); any other
MCP client can use `https://api.arcade.dev/mcp/arcade`.
