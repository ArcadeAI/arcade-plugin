# Install in Codex or the ChatGPT local runtime

Codex and the ChatGPT local runtime share one plugin directory, so a single
local install shows up on both surfaces. You get the Arcade gateway, both
skills, and lifecycle hooks. Installing the plugin on the web does not deploy
hook scripts.

Arcade is not in OpenAI's public Plugins Directory. Add it from GitHub with
one of the install paths below.

Codex does not load `arcade-operator` from the plugin. OpenAI plugins can ship
skills, MCP, and hooks, but not custom agent roles yet
([codex#36855](https://github.com/openai/codex/issues/36855)). Use the
`arcade:try-arcade` skill instead. If you spawn a built-in subagent (`worker`,
`explorer`, etc.), `SubagentStart` still injects Arcade routing guidance.

## Install

**Cross-client CLI (stages the plugin and registers a local marketplace):**

```bash
npx plugins add ArcadeAI/arcade-plugin --target codex
codex plugin add arcade@plugins-cli
```

From a local checkout:

```bash
npx plugins add /path/to/arcade-plugin --target codex
codex plugin add arcade@plugins-cli
```

`npx plugins add` alone caches the plugin and enables it in `config.toml`, but
Codex still needs `codex plugin add` before skills show up in sessions.

**OpenAI-native CLI (uses the repo's marketplace manifest):**

```bash
codex plugin marketplace add ArcadeAI/arcade-plugin
codex plugin add arcade@arcade
```

## Verify

1. **Start a new Codex session** (or a new chat in ChatGPT desktop). Installs
   are not retroactive to open sessions.
2. Run **`/plugins`** and confirm `arcade` is installed and enabled (Space
   toggles enablement).
3. Confirm the **`arcade`** MCP server is connected.
4. Skills appear as **`arcade:try-arcade`** and **`arcade:scale-arcade`**. Codex
   does not expose plugin skills as `/slash` commands. Use **`@Arcade`** plus a
   plain-language ask, or **`$arcade:try-arcade`** / **`$arcade:scale-arcade`**
   for explicit skill invocation.

### Trust plugin hooks

Codex does not run plugin-bundled hooks until you review and trust them.
After install, open **`/hooks`** in Codex and trust the Arcade plugin hooks.
Codex prints a startup warning when hooks still need review.

The plugin ships three hooks in `com.openai/hooks/hooks.json`. Root
`plugin.json` selects that adapter through `extensions.com.openai.hooks`.
Listing metadata such as the **Arcade** display name lives in
`extensions.com.openai.interface`. The `.codex-plugin/plugin.json` file carries
the hooks path only as a legacy fallback when the OpenAI extension object is
absent.

| Event | Purpose |
| --- | --- |
| `SessionStart` | Session routing guidance |
| `UserPromptSubmit` | Per-turn Arcade reminder |
| `SubagentStart` | Subagent routing guidance |

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- `@Arcade` — "How do I use Arcade?"
- `$arcade:try-arcade` — explicit skill invocation
- "What's on my calendar tomorrow?"
