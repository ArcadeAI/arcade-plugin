# Install in Claude Code

## Full plugin

```bash
npx plugins add ArcadeAI/arcade-plugin --target claude-code
```

Then enable the plugin if your client prompts you:

```bash
claude plugin
```

Claude Code reads `.claude-plugin/plugin.json`. Skills and `arcade-operator`
come from the default `skills/` and `agents/` folders. The gateway comes
from `clients/claude/mcp.json` (`type: "http"`).

The same folder works in Claude Cowork / Claude Code desktop once the plugin
is enabled there.

## Multiple Arcade MCP servers

This plugin registers one MCP server named **`arcade`** → `api.bosslevel.dev`.
If your host has other Arcade MCP connectors too, Claude may pick the wrong one
(same tool names, different gateway). In `/mcp`, confirm **`arcade`** is
connected and prefer disabling other Arcade connectors while testing this
plugin.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
