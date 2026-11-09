# Install in Hermes Agent

[Hermes Agent](https://github.com/NousResearch/hermes-agent) reads Agent
Plugins packages, so it loads this plugin's skills and the MCP gateway. It
does not run hooks, commands, or agents.

The skills are `try-arcade` and `scale-arcade`. The gateway is:

```text
https://api.arcade.dev/mcp/arcade
```

Checked with Hermes 0.23.0 and plugin 0.9.2.

## Install

`hermes plugins install ArcadeAI/arcade-plugin` does not work yet. It clones
the repository root, but the package lives in `plugin/`, so Hermes finds no
manifest. It still prints "Installed". Copy `plugin/` into Hermes's plugins
directory instead:

```bash
git clone https://github.com/ArcadeAI/arcade-plugin.git
cp -R arcade-plugin/plugin "${HERMES_HOME:-$HOME/.hermes}/plugins/arcade"
hermes plugins enable arcade
```

Check it:

```bash
hermes plugins list
hermes plugins doctor "${HERMES_HOME:-$HOME/.hermes}/plugins/arcade" --ci
```

The list shows `arcade` 0.9.2 as enabled. The doctor passes and reports no
tools and no hooks: the tools come from the gateway, not from Python code.

To update, pull the clone and copy `plugin/` again.

## Gateway only

To skip the skills, add the gateway as an MCP server:

```bash
hermes mcp add arcade --url https://api.arcade.dev/mcp/arcade
```

## OAuth

Sign-in happens in the browser the first time Hermes connects to the gateway.
If it does not open, run:

```bash
hermes mcp login arcade
```

Sign-in through this plugin's server is not verified here. An Arcade
gateway's OAuth flow has completed in Hermes 0.20.0 when added with
`hermes mcp add`.

## First steps

- "What's on my calendar tomorrow?"
- "What apps can Arcade use?"
