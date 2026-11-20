# Install in Claude Code

## Full plugin

**Anthropic-native (matches Claude Code docs):**

```bash
claude plugin marketplace add ArcadeAI/arcade-plugin
claude plugin install arcade@arcade
```

Then in Claude Code run **`/reload-plugins`**.

Verify with `claude plugin list` or **`/plugin`**, then **`/reload-plugins`**
if the session was already open.

The GitHub marketplace installs `plugin/` with the gateway, skills, operator,
commands, and routing hooks for session start, prompt submit, and subagent start.

Claude Directory installs use a separate bundle without hooks. Invoke
`/try-arcade` when Claude does not select the skill automatically.

For the desktop marketplace install, see [Claude Desktop](claude-desktop.md).

## Multiple Arcade MCP servers

This plugin registers one MCP server named **`arcade`** → `api.arcade.dev`.
If your host has other Arcade MCP connectors too, Claude may pick the wrong one
(same tool names, different gateway). In `/mcp`, confirm **`arcade`** is
connected and prefer disabling other Arcade connectors while testing this
plugin.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
