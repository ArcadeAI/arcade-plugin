# Architecture

This package is a portable Agent Plugin plus a small adapter per host. The
portable core is `plugin.json`, `mcp.json`, and `skills/`. Cursor and Claude
adapters live in `.cursor-plugin/`, `.claude-plugin/`, and `clients/`.
Commands, hooks, and the Cursor rule are host adapters, not portable
Agent Plugins components. The package still ships no credentials.

## Portable contract → generate → validate

The standard Agent Plugins files—`plugin.json`, `mcp.json`, and `skills/`—are
the portable source of truth. `scripts/generate-manifests.mjs` reads the two
portable manifests and `VERSION`, then writes only the host projections:
client MCP adapters plus `.cursor-plugin/`, `.claude-plugin/`, and the optional
`.codex-plugin/` compatibility manifest.

Hook manifests stay hand-authored because each host has its own event schema:
`hooks/hooks.json` for shared Claude/Codex events,
`clients/claude/hooks/hooks.json` for Claude-only events,
`clients/cursor/hooks/hooks.json` for Cursor, and
`com.openai/hooks/hooks.json` for Codex-only events. Structural and behavioral
tests validate the split directly; no generated hash inventory sits between
the manifests and the runtime checks.

```text
plugin.json + mcp.json + VERSION
        │
        ▼
scripts/generate-manifests.mjs
        │
        ├── clients/*/mcp.json
        ├── .cursor-plugin/plugin.json
        ├── .claude-plugin/plugin.json, marketplace.json
        └── .codex-plugin/plugin.json
        │
        ▼
npm run generate:check  (in verify)  +  scripts/check.mjs
```

After a version bump, run `node scripts/version.mjs <semver>` or
`npm run generate` so host projections stay in sync. Release Please updates
every version-bearing manifest, and CI simulates that update before accepting
the release configuration.

Hook scripts live in `hooks/*.mjs`. Hook manifests are per client (`hooks/hooks.json`
for Claude and Codex session hooks, `clients/claude/hooks/hooks.json` for Claude
post-tool telemetry, `clients/cursor/hooks/hooks.json`,
`com.openai/hooks/hooks.json` for Codex `SubagentStart`). `scripts/check.mjs`
enforces that split. Maintainer-facing agent guidance lives in
[AGENTS.md](AGENTS.md) (read by Cursor, Claude Code, Codex, and others).

The customer-facing overview lives in [README.md](README.md). Interaction
rules live in the skills; the optional operator and observability boundary
are documented below.

## Package shape

```text
arcade-plugin/                            Agent Plugin 1.0  (v0.1.0)
│
├── plugin.json                         portable identity
├── mcp.json                            portable Streamable HTTP gateway
├── .cursor-plugin/plugin.json          Cursor Plugin (skills + operator)
├── .claude-plugin/plugin.json          Claude plugin (skills + operator)
├── .claude-plugin/marketplace.json     Claude Desktop / Code marketplace catalog
├── .codex-plugin/plugin.json           Codex compatibility fallback
├── clients/
│   ├── cursor/
│   │   ├── mcp.json                    Cursor infers transport from url
│   │   ├── hooks/hooks.json            Cursor sessionStart
│   │   └── rules/arcade.mdc              always-apply: try Arcade first
│   ├── claude/mcp.json                 Claude needs type: http
│   ├── claude-desktop/
│   │   └── claude_desktop_config.json  tools-only fallback
│   └── codex/                          (reserved)
│
├── com.openai/hooks/hooks.json         Codex lifecycle hook adapter
├── commands/                           arcade-apps, arcade-connect, arcade-status
├── hooks/                              shared hook scripts + Claude hook manifest
│
├── README.md                           customer-facing overview
├── ARCHITECTURE.md                     this file
├── LICENSE                             MIT
├── CHANGELOG.md
├── docs/
│   ├── support-matrix.md               what each client loads
│   └── install/                        one page per client
│
├── skills/                             from outcome, or invoked by name
│   ├── try-arcade/
│   │   ├── SKILL.md                    external service tasks
│   │   └── references/arcade-docs.md   other Arcade product questions
│   └── scale-arcade/
│       ├── SKILL.md                    org rollout guidance
│       └── references/arcade-docs.md   same docs entry points
│
└── agents/                             one copy, read by Cursor + Claude + Copilot CLI
    └── arcade-operator.agent.md        bounded discovery + execution
```

Agent Plugins clients load `plugin.json`, `mcp.json`, and `skills/`. Cursor
resolves `.cursor-plugin/plugin.json` first and also registers `agents/`.
Claude Code resolves `.claude-plugin/plugin.json` and discovers `skills/` and
`agents/` from the default folders. Claude Desktop adds this repository as a
plugin marketplace via `.claude-plugin/marketplace.json` (`source: "./"`).
Every client can still run the workflow directly through MCP without the
operator.

## Execution model

Skills should activate from the outcome the person asks for; they must not
require a `/do`-style command. Hosts that expose skills still let the user
invoke `/try-arcade` or `/scale-arcade` by name. When a compatible host can
delegate to `arcade-operator`, the parent agent keeps the user-facing
reasoning and hands tool discovery and execution to the operator. Otherwise
it follows the same Arcade discovery and execution loop itself.

```text
  user
   ├── describes an outcome
   └── or invokes /try-arcade · /scale-arcade
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  parent agent                                                │
│  user conversation · clarification · sign-in · confirmation  │
│                                                              │
│   external service tasks ──────► try-arcade                  │
│   team or org rollout ──────────► scale-arcade                │
│   other Arcade product/docs ───► docs.arcade.dev/llms.txt    │
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
                │ host has arcade-operator     │ no operator
                ▼                              ▼
        ┌───────────────┐              same loop
        │ arcade-       │              runs in parent
        │ operator      │
        └───────┬───────┘
                │
                ▼
        Arcade_SelectTools  ──►  Arcade_UseTool  ──►  result tool
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│  mcp.json  →  Streamable HTTP Gateway                        │
│  https://api.arcade.dev/mcp/arcade                           │
│                                                              │
│  only external capability boundary                           │
│  canonical telemetry lives here, not in the plugin           │
└──────────────────────────────────────────────────────────────┘
                │
                ▼
        connected apps (email, calendar, issues, chat, …)

  operator returns one of:
    completed | needs_auth | needs_confirmation | needs_clarification | failed
```

The parent remains responsible for user-facing clarification, sign-in, and
confirmation. The operator returns one bounded outcome instead of inventing
success or narrating tool internals.

## Observability boundary

The Arcade MCP server is the canonical place to record request, authentication,
tool-discovery, tool-call, and completion outcomes. This package does not ask a
model to self-report tokens, turns, or success.

Hook-capable hosts (Cursor, Claude Code, and Codex / ChatGPT) may emit
**supplemental** funnel telemetry from `hooks/telemetry.mjs`. That path is
explicit, non-portable, and separate from gateway truth.

| Layer | What it records | Identity |
| --- | --- | --- |
| Gateway MCP | Session start, tool calls, auth | Arcade `principalId` / `user_id` |
| Plugin hooks | Delivery friction, routing, Arcade MCP tool invocation | Hashed host session |

Plugin hook telemetry measures **delivery and friction** (session start, prompt
submit, routing context injection, bare-continuation skips, hook errors) and
**Arcade MCP tool invocation** (tool name and success/failure only). It does not
replace gateway truth for auth, request outcomes, or tool payloads.

Hook telemetry is off by default. Set `ARCADE_PLUGIN_TELEMETRY=1` to send events
to PostHog via `https://p.arcade.dev`. Payloads use an event-specific property
allowlist and never include prompt text, tool arguments, tool responses, paths,
or error messages. Session IDs are hashed before capture, and events disable
PostHog person profiles. The plugin does not create a persistent machine
identifier or write telemetry reports to disk.

Override the project key with `ARCADE_PLUGIN_POSTHOG_KEY` or the ingest host
with `ARCADE_PLUGIN_POSTHOG_HOST`. The detached sender has a two-second timeout,
and telemetry failures never change hook output or exit status.
