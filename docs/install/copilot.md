# Install in GitHub Copilot CLI

## Full plugin

```bash
npx plugins add ArcadeAI/arcade-plugin --target copilot
```

Copilot CLI reads the Agent Plugins manifest (`plugin.json`, `skills/`,
`mcp.json`) and still discovers `agents/*.agent.md`, so you get 2 skills, the
gateway, and `arcade-operator`. Session hooks in `hooks/hooks.json` use
Claude Code's format and are not loaded by Copilot CLI — use the skills for
routing guidance instead.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
