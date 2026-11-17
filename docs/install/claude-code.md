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

The marketplace installs `clients/claude/`. Its `.claude-plugin/plugin.json`
declares the gateway. Skills, `arcade-operator`, and commands load from the
folder's default `skills/`, `agents/`, and `commands/` paths.

Claude installs contain no hooks, executable scripts, or telemetry. The
`try-arcade` skill supplies routing and authorization instructions. Invoke
`/try-arcade` when Claude does not select it automatically.

The same folder works in Claude Cowork and Claude Code desktop. In Claude
Desktop Chat, add this GitHub repository as a marketplace — see
[claude-desktop.md](claude-desktop.md).

## Multiple Arcade MCP servers

This plugin registers one MCP server named **`arcade`** → `api.arcade.dev`.
If your host has other Arcade MCP connectors too, Claude may pick the wrong one
(same tool names, different gateway). In `/mcp`, confirm **`arcade`** is
connected and prefer disabling other Arcade connectors while testing this
plugin.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
