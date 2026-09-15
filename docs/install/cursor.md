# Install in Cursor

## Full plugin (recommended)

```bash
npx plugins add ArcadeAI/arcade-plugin --target cursor
```

Reload the window if needed. Open **Customize** and confirm 2 skills, the
`arcade-operator` agent, and the `arcade` MCP server.

### Advanced: local checkout

Copy or symlink this repository to:

```text
~/.cursor/plugins/local/arcade-plugin
```

Use this when developing the plugin itself. Local plugin imports must be
allowed (on Teams/Enterprise, that's an admin setting).

Cursor reads `.cursor-plugin/plugin.json` first, so it loads `skills/`,
`agents/`, and `clients/cursor/mcp.json` — not just the portable Agent
Plugins core.

## Tools only (one click)

[![Install in Cursor](https://img.shields.io/badge/Cursor-one--click-000000)](https://cursor.com/install-mcp?name=arcade&config=eyJ1cmwiOiJodHRwczovL2FwaS5hcmNhZGUuZGV2L21jcC9hcmNhZGUifQ==)

This adds the gateway only — no skills.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
