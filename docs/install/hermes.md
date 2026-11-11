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

## OAuth

Hermes signs in only to servers marked `auth: oauth`, and a plugin's
`mcp.json` cannot set that. The plugin's `arcade` server loads with its URL
alone, and `hermes mcp login arcade` reports `Server 'arcade' not found in
config`.

Add the gateway to your own config under the same name. Your entry replaces
the plugin's, and the skills still load:

```bash
hermes mcp add arcade --url https://api.arcade.dev/mcp/arcade --auth oauth
hermes mcp login arcade
```

Sign-in happens in the browser. Hermes then lists the gateway's tools and
asks whether to enable them.

If `mcp add` says `MCP SDK auth module not available`, or the connection
fails with `mcp.client.streamable_http is not available`, the MCP SDK is
missing from the dependency environment this Hermes home runs from.
Installing a plugin builds that environment from Hermes's base packages, and
the SDK is the optional `mcp` extra. Add it with:

```bash
hermes pm install --extra mcp
```

That command also checks Hermes's tool set first, and stops if ffmpeg,
node, npm or ripgrep are missing from your PATH.

## If sign-in times out

The browser sign-in has to finish within about five minutes. After that the
callback page shows 404 and `mcp add` asks whether to save the entry anyway.
If you save it, Hermes writes it with `enabled: false`, so the gateway's tools
never load. Turn it back on and sign in again:

```bash
hermes config set mcp_servers.arcade.enabled true
hermes mcp login arcade
```

## After you update the plugin

Hermes's gateway process (`hermes gateway run`, which also serves the TUI's
turns) loads plugins once and keeps them until it stops. Copy the new
`plugin/` in, then restart it so the next turn uses the new version:

```bash
hermes gateway stop
```

The next `hermes` session starts it again.

## Running more than one agent

Each Hermes home signs in to one gateway, and a gateway exposes only the tools
enabled on it. Give each agent, or each group of agents doing one job, its own
gateway with the tools that job needs. A call to a tool that is not on the
gateway fails with "tool not found, it is not enabled for this gateway".

To give each agent its own identity in the apps it uses, sign each one in as
its own Arcade user. On Arcade's default OAuth apps this fails with
`user_mismatch`, because those apps always check the signed-in Arcade user.
Use your own OAuth apps and a custom user verifier for per-agent identities.
One shared user works on the default apps.

## Approvals

Gateway calls reach Hermes as `mcp__arcade__Arcade_UseTool`, so Hermes's own
approval card can gate them. A plugin's `pre_tool_call` hook can return an
approval for calls that change something (sending, merging, paying). Set a
`rule_key` per action, not per tool, so that "always allow" on one action does
not cover every call that goes through `Arcade_UseTool`.

## Gateway only

To skip the skills, run only the two commands above.

## First steps

- "What's on my calendar tomorrow?"
- "What apps can Arcade use?"
