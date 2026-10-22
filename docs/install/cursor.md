# Install in Cursor

## Full plugin

Arcade isn't in Cursor's public marketplace yet, so the install depends on your
Cursor plan.

The plugin directory in this repository is `plugin/`. Cursor's marketplace
manifest (`.cursor-plugin/marketplace.json` at the repository root) points at
that directory. The logo file is `plugin/assets/logo.png`.

### Individual plans

Cursor loads each folder under `~/.cursor/plugins/local` as a plugin root. It
looks for `.cursor-plugin/plugin.json`, then `.claude-plugin/plugin.json`, then
`plugin.json` in that folder
([Test plugins locally](https://cursor.com/docs/plugins)).

Clone this repository into that folder. The root `.cursor-plugin/plugin.json`
points skills, agents, commands, rules, and the logo into `plugin/`.
`.cursor-plugin/hooks.json` runs the session hook from `plugin/hooks/`.

```bash
mkdir -p ~/.cursor/plugins/local
git clone https://github.com/ArcadeAI/arcade-plugin.git ~/.cursor/plugins/local/arcade-plugin
```

Reload Cursor (**Developer: Reload Window**), then open **Customize** and
confirm 2 skills, the `arcade-operator` agent, the `arcade` rule, and the
`arcade` MCP server. To update later, run `git pull` in that clone and reload.

Copying only `plugin/` into `~/.cursor/plugins/local/arcade` also works. That
copy loads `plugin/.cursor-plugin/plugin.json`. Team **Import from Repo** reads
`.cursor-plugin/marketplace.json`, whose source is `plugin`.

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

**Import from Repo** reads `.cursor-plugin/marketplace.json` at the repository
root. Its source is `plugin`, so Cursor loads `plugin/.cursor-plugin/plugin.json`
([how resolution works](https://cursor.com/docs/reference/plugins)). That
installs `skills/`, the operator, and the gateway, the same components as the
local copy above, including the pieces beyond the portable Agent Plugins core.
The IDE and Cloud Agents also load the always-apply rule.
The CLI runs the session hook instead and does not load the rule.

## Tools only (one click)

[![Install in Cursor](https://img.shields.io/badge/Cursor-one--click-000000)](https://cursor.com/install-mcp?name=arcade&config=eyJ1cmwiOiJodHRwczovL2FwaS5hcmNhZGUuZGV2L21jcC9hcmNhZGUifQ==)

This adds the gateway only — no skills.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
