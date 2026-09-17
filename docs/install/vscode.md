# Install in VS Code

## Full plugin (recommended)

```bash
npx plugins add ArcadeAI/arcade-plugin --target vscode
```

Enable agent plugins in VS Code if needed (`chat.plugins.enabled`).

VS Code loads root `plugin.json` as an Agent Plugin: 2 skills, the gateway,
and `arcade-operator` from `com.github.copilot/agents/`. It does not read the
`.cursor-plugin/` adapter.

If you already installed the plugin via Copilot CLI, VS Code may auto-discover
it from `~/.copilot/installed-plugins/`. Install in one place.

### Alternative: install from source folder

1. Set `chat.plugins.enabled` to `true` (Preview).
2. Command Palette → **Chat: Install Plugin From Source**.
3. Choose this folder.

## Tools only (one click)

[![Install in VS Code](https://img.shields.io/badge/VS_Code-one--click-0098FF?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=arcade&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.arcade.dev%2Fmcp%2Farcade%22%7D)

This adds the gateway only — no skills.

## Sign in

No API keys. The first task that touches an app returns a sign-in link;
approve it in the browser when prompted.

## First steps

- "What's on my calendar tomorrow?"
- `/try-arcade`
