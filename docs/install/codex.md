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
Codex prints a startup warning when hooks still need review.

The plugin wires session and prompt hooks from `hooks/hooks.json` (shared with
Claude Code; Codex resolves `${CLAUDE_PLUGIN_ROOT}` as a compatibility alias)
and `SubagentStart` from `com.openai/hooks/hooks.json` with `${PLUGIN_ROOT}`.
Root `plugin.json` selects both adapters through
`extensions.com.openai.hooks`; `.codex-plugin/plugin.json` lists the same paths
as a compatibility fallback.

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
