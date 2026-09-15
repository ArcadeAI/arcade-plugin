# Install in Claude Desktop

Add this repository as a plugin marketplace, then install Arcade. Claude
Desktop looks for `.claude-plugin/marketplace.json` — not a `.mcpb`
Desktop Extension, and not a one-click deeplink.

> **Personal trial.** Sign in with Arcade when prompted in the browser.

## Personal plugin install

**Customize → Plugins → Add marketplace → Add from a repository** → paste:

```text
ArcadeAI/arcade-plugin
```

Then install **Arcade** (`arcade@arcade`).

From Claude Code in the desktop app, or a terminal:

```bash
claude plugin marketplace add ArcadeAI/arcade-plugin
claude plugin install arcade@arcade
```

Chat gets tools and skills. Cowork and Code also get the operator,
commands, and hooks. There is no documented `claude://` link that adds a
marketplace; the steps above are the install.

## Organization install (ZIP upload)

An organization owner can upload Arcade for the team:

1. [Download the latest Claude plugin ZIP](https://github.com/ArcadeAI/arcade-plugin/releases/latest/download/arcade-claude.zip).
2. Open **Organization settings → Plugins → Add plugins → Upload a file**.
3. Choose a new or existing marketplace and upload
   `arcade-claude.zip` without extracting it.
4. Set Arcade's installation preference, such as **Installed by default**.

Cowork and Skills must both be enabled for the organization. The ZIP includes
the Claude manifest, MCP configuration, skills and references, operator,
commands, hooks, and license.

For updates, download and upload the latest ZIP with the same plugin name (`arcade`);
Claude replaces the previous version. ZIP uploads are updated manually.

To build from a checkout, run `npm run package:claude` (requires Node.js, Git,
and `zip`). The output is `dist/arcade-claude.zip`. New plugin files must be
tracked by Git to be included. Build outputs are not committed.

Claude's organization GitHub sync requires a **private or internal** marketplace
repository. This public repository can be used for personal installation above;
use ZIP upload or a private marketplace for organization distribution. See
[Anthropic's organization plugin guide](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization).

## Tools only

If you only want the gateway, skip the marketplace:

**Settings → Connectors → Add custom connector** → paste:

```text
https://api.arcade.dev/mcp/arcade
```

Or merge
[`clients/claude-desktop/claude_desktop_config.json`](../../clients/claude-desktop/claude_desktop_config.json)
into your `claude_desktop_config.json` and restart Claude Desktop fully.
The sample uses a pinned `mcp-remote` proxy to bridge to the hosted
gateway.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
- "What apps can Arcade use?"
