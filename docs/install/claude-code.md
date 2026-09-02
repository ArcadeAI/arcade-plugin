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

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser with your **staging** Arcade account.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
