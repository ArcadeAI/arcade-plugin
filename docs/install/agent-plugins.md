# Install in any MCP client

Any client that can call a Streamable HTTP MCP server can use Arcade tools:

```text
https://api.arcade.dev/mcp/arcade
```

That path is tools only.

Clients that implement [Agent Plugins](https://agent-plugins.org) 1.0 can
install the full plugin:

```bash
npx plugins add ArcadeAI/arcade-plugin
```

That loads `plugin.json`, `skills/`, and `mcp.json` — `try-arcade`,
`scale-arcade`, and the gateway.

The operator is not a portable Agent Plugins component. Claude Code and Cursor
load the canonical file in `agents/`; Copilot CLI and VS Code load its generated
projection in `com.github.copilot/agents/`. Other clients run the same loop in
the parent skill.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade` (when the client loaded skills)
