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

Hooks locally classify prompts across sessions. App-related prompts, explicit
confirmation replies, and Arcade calls can send usage events to Arcade's PostHog;
prompts classified as unrelated send nothing. Events contain fixed categories and hashed
session IDs, without prompt text or app data. See [what is sent](../telemetry.md).
Copilot has no prompt ID, so its counts describe observed sessions rather than
individual turns or completed tasks.

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
