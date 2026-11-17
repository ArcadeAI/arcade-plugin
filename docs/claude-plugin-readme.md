# Arcade

Use your connected apps from Claude. Ask for an outcome in plain English:
check your calendar, summarize email, find an issue, or draft a Slack reply.
Arcade finds the tools and runs them through its hosted MCP gateway at
https://api.arcade.dev/mcp/arcade.

Install Arcade from the Claude plugin directory, or run this in Claude Code:

```text
/plugin install arcade --marketplace ArcadeAI/arcade-plugin
```

Sign in with Arcade in your browser when prompted. Connect each app in the browser
when the task needs it. An Arcade account and the relevant app permissions
are required.

Claude loads the `try-arcade` and `scale-arcade` skills, the `arcade-operator`
agent where supported, and the `arcade-status`, `arcade-connect`, and
`arcade-apps` commands. Skills contain the routing and authorization
instructions. This plugin contains no hooks, executable scripts, local
dependencies, or client telemetry.

Requests and tool inputs go to Arcade's gateway and the apps you connect.
Claude asks for confirmation before changes outside the conversation. The
gateway's data handling is covered by Arcade's
[privacy policy](https://www.arcade.dev/privacy-policy/) and
[terms of service](https://www.arcade.dev/terms-of-service/).

Try “What's on my calendar tomorrow?” or invoke `/try-arcade`.
If Arcade needs sign-in, follow the browser link and confirm when finished.
If the gateway is unavailable, check the Arcade connection in Claude's MCP
settings. For help, see the [documentation](https://docs.arcade.dev/) or
contact [support@arcade.dev](mailto:support@arcade.dev).
