# Install in Codex or the ChatGPT local runtime

Codex and the ChatGPT local runtime share one plugin directory, so a single
local install shows up on both surfaces. You get the Arcade gateway and both
skills. Installing the plugin on the web does not deploy hook scripts.

Arcade is not in OpenAI's public Plugins Directory. Add it from GitHub with
one of the install paths below.

Codex does not load `arcade-operator` from the plugin. OpenAI plugins can ship
skills and MCP, but not custom agent roles yet
([codex#36855](https://github.com/openai/codex/issues/36855)). Use the
`arcade:try-arcade` skill instead.

**Lifecycle hooks are not active on Codex today.** Codex 0.154.0 skips plugin
hooks for Agent Plugin packages that ship a root `plugin.json`
([openai/codex#39895](https://github.com/openai/codex/issues/39895)). Use
`@Arcade` or `$arcade:try-arcade` for routing guidance until upstream fixes
that loader gap. The Codex hook adapter lives on branch
`cursor/park-codex-hooks-gro-353-f8ad` for when that lands.

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

Listing metadata such as the **Arcade** display name lives in
`extensions.com.openai.interface` on the portable manifest. The generated
`.codex-plugin/plugin.json` mirrors that `interface` object for legacy loaders.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- `@Arcade` — "How do I use Arcade?"
- `$arcade:try-arcade` — explicit skill invocation
- "What's on my calendar tomorrow?"
