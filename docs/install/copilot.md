# Install in GitHub Copilot CLI

## Full plugin

```bash
npx plugins add ArcadeAI/arcade-plugin --target copilot
```

Native alternative:

```bash
copilot plugin install ArcadeAI/arcade-plugin
```

Restart or `/restart` your Copilot session after install.

Copilot CLI reads the portable Agent Plugins components (`plugin.json`,
`skills/`, and `mcp.json`) and its custom agent from
`com.github.copilot/agents/arcade-operator.agent.md`. You get 2 skills, the
gateway, and `arcade-operator`.

Copilot and VS Code load plugin hooks only from
`com.github.copilot/hooks/hooks.json`. Arcade lifecycle hooks live in
`hooks/hooks.json` (Claude Code) and `com.openai/hooks/hooks.json` (Codex), so
use the skills for routing guidance on Copilot CLI.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
