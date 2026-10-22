<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/arcade-wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/arcade-wordmark-light.svg">
    <img alt="Arcade" src="assets/arcade-wordmark-light.svg" width="340">
  </picture>
</p>

# Arcade

Let any agent use Arcade. Ask for what you want and the right tool runs
across every app you have connected. Sign-in happens in the browser. This
plugin does not ask for an API key.

The gateway is `https://api.arcade.dev/mcp/arcade`. The skills are
`try-arcade` and `scale-arcade`. Clients that load agents also get
`arcade-operator`. Cursor, Claude Code, and Cowork load the commands
`/arcade-status`, `/arcade-connect`, and `/arcade-apps`.

In Claude Code:

```text
/plugin install arcade --marketplace ArcadeAI/arcade-plugin
```

Install steps for each client are in the repository:
<https://github.com/ArcadeAI/arcade-plugin/blob/main/docs/install/README.md>.
Product docs: <https://docs.arcade.dev/en/get-started/agent-plugin>.

This directory is licensed under the MIT License. See [LICENSE](LICENSE).
