# Install in Cursor

## Full plugin

Arcade isn't in Cursor's public marketplace yet, so the install depends on your
Cursor plan.

### Individual plans

Clone this repository into Cursor's local plugin folder:

```bash
git clone https://github.com/ArcadeAI/arcade-plugin ~/.cursor/plugins/local/arcade-plugin
```

Reload Cursor (**Developer: Reload Window**), then open **Customize** and
confirm 2 skills, the `arcade-operator` agent, the `arcade` rule, and the
`arcade` MCP server. To update later, run `git pull` in that folder and reload.

Do not symlink to a folder outside `~/.cursor/plugins/local/` — Cursor ignores
external symlink targets.

### Teams and Enterprise

Local plugins are controlled by the admin setting **Allow Local Plugin
Imports** (off by default on Enterprise). When it's off, Cursor ignores
`~/.cursor/plugins/local` entirely. Use a team marketplace instead:

1. An admin opens **Dashboard → Plugins & MCPs → Team Marketplaces → Add
   Marketplace → Import from Repo** and pastes
   `https://github.com/ArcadeAI/arcade-plugin`.
2. Each person opens **Customize**, finds **Arcade**, and selects **Install**.

Either way, Cursor reads `.cursor-plugin/plugin.json` first, so it loads
`skills/`, `agents/`, `clients/cursor/rules/`, and `clients/cursor/mcp.json` —
not just the portable Agent Plugins core.

### Why not `npx plugins add --target cursor`

On macOS and Linux, `plugins` 1.3.4 does not write to Cursor's plugin folder.
It installs into Claude Code's (`~/.claude/plugins`) and relies on Cursor
reading that. Cursor only does when **Settings → Rules, Skills, Subagents →
Include third-party Plugins, Skills, and other configs** is on; with it off,
Cursor's log shows `claude=false` and Arcade doesn't load. Even with it on,
Cursor would get the Claude Code manifest, not the Cursor rule and hooks.

## Tools only (one click)

[![Install in Cursor](https://img.shields.io/badge/Cursor-one--click-000000)](https://cursor.com/install-mcp?name=arcade&config=eyJ1cmwiOiJodHRwczovL2FwaS5hcmNhZGUuZGV2L21jcC9hcmNhZGUifQ==)

This adds the gateway only — no skills.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
