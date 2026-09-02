# Install in Codex or ChatGPT

Codex and ChatGPT share one plugin directory, so a single install shows up on
both surfaces. You get the Arcade gateway and both skills. Codex does not
load `arcade-operator`.

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

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser with your **staging** Arcade account.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
