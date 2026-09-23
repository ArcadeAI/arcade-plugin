# Install in Cursor

## Full plugin (recommended)

Clone this repository into Cursor's local plugin folder:

```bash
git clone https://github.com/ArcadeAI/arcade-plugin ~/.cursor/plugins/local/arcade-plugin
```

Reload Cursor (**Developer: Reload Window**), then open **Customize** and
confirm 2 skills, the `arcade-operator` agent, and the `arcade` MCP server. To
update later, run `git pull` in that folder and reload.

Do not symlink to a folder outside `~/.cursor/plugins/local/` — Cursor ignores
external symlink targets.

Local plugin imports must be allowed (on Teams/Enterprise, that's the admin
setting **Allow Local Plugin Imports**, off by default on Enterprise).

Cursor reads `.cursor-plugin/plugin.json` first, so it loads `skills/`,
`agents/`, and `clients/cursor/mcp.json` — not just the portable Agent
Plugins core.

### Why not `npx plugins add --target cursor`

On macOS and Linux, `plugins` 1.3.4 does not write to Cursor's plugin folder.
It installs into Claude Code's (`~/.claude/plugins`) and relies on Cursor
reading that. Cursor only does when **Settings → Rules, Skills, Subagents →
Include third-party Plugins, Skills, and other configs** is on, and even then
it loads the Claude Code manifest, so the Cursor rule and Cursor hooks from
`.cursor-plugin/` don't load.

## Tools only (one click)

[![Install in Cursor](https://img.shields.io/badge/Cursor-one--click-000000)](https://cursor.com/install-mcp?name=arcade&config=eyJ1cmwiOiJodHRwczovL2FwaS5hcmNhZGUuZGV2L21jcC9hcmNhZGUifQ==)

This adds the gateway only — no skills.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
