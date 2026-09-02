# Install in any MCP client

Any client that can call a Streamable HTTP MCP server can use Arcade tools:

```text
https://api.bosslevel.dev/mcp/all-optimized
```

That path is tools only.

Clients that implement [Agent Plugins](https://agent-plugins.org) 1.0 can
install the full plugin:

```bash
npx plugins add ArcadeAI/arcade-plugin
```

That loads `plugin.json`, `skills/`, and `mcp.json` — `try-arcade`,
`scale-arcade`, and the gateway.

The operator file in `agents/` is not a portable Agent Plugins component.
Hosts that already scan `agents/` (Claude Code, Copilot CLI) pick it up;
everyone else runs the same loop in the parent skill.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade` (when the client loaded skills)
