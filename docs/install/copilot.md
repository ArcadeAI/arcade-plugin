# Install in GitHub Copilot CLI

## Full plugin

```bash
copilot plugin install ArcadeAI/arcade-plugin
```

The cross-client CLI works too; it runs Copilot's own `copilot plugin`
commands for you:

```bash
npx plugins add ArcadeAI/arcade-plugin --target github-copilot
```

Restart or `/restart` your Copilot session after install.

Copilot CLI reads the portable Agent Plugins components (`plugin.json`,
`skills/`, and `mcp.json`) and its custom agent from
`com.github.copilot/agents/arcade-operator.agent.md`. You get 2 skills, the
gateway, and `arcade-operator`.

Hooks come from `com.github.copilot/hooks/hooks.json`: routing rules at
session start and for subagents. Copilot CLI drops the output of prompt hooks
from config files, so there's no per-prompt reminder here. VS Code reads the
same file; the hooks detect that it doesn't give them the plugin's path and do
nothing, so VS Code relies on the skills.

## Telemetry

The plugin sends a small set of usage events (session start, prompts, tool
calls, and subagent stops) to help us see whether the model uses Arcade when a
task needs it. For prompts, a yes/no guess at whether Arcade is relevant and
service category hints are sent — not the prompt text. No personal data is
included. See [docs/telemetry.md](../telemetry.md) for the full list of what
is sent.

To turn it off, set `ARCADE_PLUGIN_TELEMETRY=0` in your shell before starting
`copilot`:

```bash
export ARCADE_PLUGIN_TELEMETRY=0
```

`COPILOT_OFFLINE=true` also turns off telemetry (along with all other Copilot
network activity).

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
