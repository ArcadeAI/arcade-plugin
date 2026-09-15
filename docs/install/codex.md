# Install in Codex or ChatGPT

Codex and ChatGPT share one plugin directory, so a single install shows up on
both surfaces. You get the Arcade gateway, both skills, and lifecycle hooks.
Codex does not load `arcade-operator`.

## Install

```bash
npx plugins add ArcadeAI/arcade-plugin --target codex
```

From a local checkout:

```bash
npx plugins add /path/to/arcade-plugin --target codex
```

You can also point Codex at this folder via a marketplace entry in
`~/.agents/plugins/marketplace.json` (or `.agents/plugins/marketplace.json`
in a repo):

```json
{
  "plugins": [
    {
      "name": "arcade-plugin",
      "source": "./path/to/arcade-plugin"
    }
  ]
}
```

## Verify

`try-arcade` and `scale-arcade` should appear as skills, and the `arcade`
MCP server should be connected.

### Trust plugin hooks

Codex does not run plugin-bundled hooks until you review and trust them.
After install, open `/hooks` in Codex and trust the Arcade plugin hooks.
Codex prints a startup warning when hooks still need review.

The plugin ships three hooks. Codex loads the shared Claude manifest
(`hooks/hooks.json`) plus the Codex adapter (`clients/codex/hooks/hooks.json`):

| Event | Purpose |
| --- | --- |
| `SessionStart` | Session routing guidance |
| `UserPromptSubmit` | Per-turn Arcade reminder |
| `SubagentStart` | Subagent routing guidance |

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
