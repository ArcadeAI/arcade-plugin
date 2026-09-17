# Install in Codex or the ChatGPT local runtime

Codex and the ChatGPT local runtime share one plugin directory, so a single
local install shows up on both surfaces. You get the Arcade gateway, both
skills, and lifecycle hooks. Installing the plugin on the web does not deploy
hook scripts.

Codex does not load `arcade-operator` from the plugin. OpenAI plugins can ship
skills, MCP, and hooks, but not custom agent roles yet
([codex#36855](https://github.com/openai/codex/issues/36855)). Use `/try-arcade`
or ask Codex to follow the try-arcade skill for the same workflow. If you spawn
a built-in subagent (`worker`, `explorer`, etc.), `SubagentStart` still injects
Arcade routing guidance.

## Install

```bash
npx plugins add ArcadeAI/arcade-plugin --target codex
```

From a local checkout:

```bash
npx plugins add /path/to/arcade-plugin --target codex
```

## Verify

`try-arcade` and `scale-arcade` should appear as skills, and the `arcade`
MCP server should be connected.

### Trust plugin hooks

Codex does not run plugin-bundled hooks until you review and trust them.
After install, open `/hooks` in Codex and trust the Arcade plugin hooks.
Codex prints a startup warning when hooks still need review. CI runs
`validate:manifest-hooks` to execute the wired `${PLUGIN_ROOT}` commands from
`com.openai/hooks/hooks.json`. That proves path substitution and stdout work in
the repo. It does not replace trusting hooks in your local Codex session.

The plugin ships three hooks in `com.openai/hooks/hooks.json`. Root
`plugin.json` selects that adapter through `extensions.com.openai.hooks`.
Listing metadata such as the **Arcade** display name lives in
`extensions.com.openai.interface`. The `.codex-plugin/plugin.json` file carries
the hooks path only as a legacy fallback when the OpenAI extension object is
absent. Every Codex command uses `${PLUGIN_ROOT}` so local installs continue
to resolve after vendor-specific packaging.

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
