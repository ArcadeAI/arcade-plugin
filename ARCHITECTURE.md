# Architecture

This package is a portable Agent Plugin plus a small adapter per host. The
portable core is `plugin.json`, `mcp.json`, and `skills/`. Cursor and Claude
adapters live in `.cursor-plugin/`, `.claude-plugin/`, and `clients/`.
Commands, hooks, and the Cursor rule are host adapters, not portable
Agent Plugins components. The package still ships no credentials.

## Contract → generate → validate

`contract/plugin.contract.json` is the single source of truth for plugin
identity, gateway wiring, host component paths, and marketplace metadata.
`scripts/generate-manifests.mjs` reads the contract and `VERSION`, then writes
every host manifest (`plugin.json`, `mcp.json`, client MCP adapters, and
`.cursor-plugin/`, `.claude-plugin/`, `.codex-plugin/` plugin manifests). It
also writes `contract/inventory.json` (SHA256 of each generated manifest plus
declared component paths) and `contract/identity.json` (plugin version and
inventory digest).

Hook manifest JSON files stay hand-authored (`hooks/hooks.json`,
`clients/cursor/hooks/hooks.json`, `com.openai/hooks/hooks.json`). The
contract declares where hosts load them; `contract/inventory.json` records a
SHA256 digest per hook manifest so `npm run generate:check` catches drift.

```text
contract/plugin.contract.json
        │
        ▼
scripts/generate-manifests.mjs  ← VERSION
        │
        ├── plugin.json, mcp.json, clients/*/mcp.json
        ├── .cursor-plugin/plugin.json
        ├── .claude-plugin/plugin.json, marketplace.json
        ├── .codex-plugin/plugin.json
        └── contract/identity.json, contract/inventory.json
        │
        ▼
npm run generate:check  (in verify)  +  scripts/check.mjs
```

After a version bump, run `node scripts/version.mjs <semver>` or
`npm run generate` so manifests and contract artifacts stay in sync. CI fails
when generated output drifts.

Hook scripts live in `hooks/*.mjs`. Hook manifests are per client (`hooks/hooks.json`
for Claude and Codex session hooks, `clients/cursor/hooks/hooks.json`,
`com.openai/hooks/hooks.json` for Codex `SubagentStart`). `scripts/check.mjs`
enforces that split.

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
├── .codex-plugin/plugin.json           Codex hooks + portable MCP
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
├── com.openai/hooks/hooks.json         Codex SubagentStart extension
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

Hook-capable hosts (Cursor and Claude Code today) may emit **supplemental**
funnel telemetry from `hooks/telemetry.mjs`. That path is explicit,
non-portable, and separate from gateway truth.

| Layer | What it records | Identity |
| --- | --- | --- |
| Gateway MCP | Session start, tool calls, auth | Arcade `principalId` / `user_id` |
| Plugin hooks | Host session start, prompt submit | Hashed host session + `install_id` |

Hook telemetry sends anonymized events to PostHog via `https://p.arcade.dev`.
Payloads never include prompt text or tool arguments. Opt out with
`ARCADE_PLUGIN_TELEMETRY=0`. Override the project key with
`ARCADE_PLUGIN_POSTHOG_KEY` or the ingest host with `ARCADE_PLUGIN_POSTHOG_HOST`.

Each machine gets a stable `install_id` in `~/.arcade-plugin/install-id` (or
`ARCADE_PLUGIN_INSTALL_ID`) so hook events can later be joined to gateway MCP
events on the same install. Gateway correlation is a follow-up on the Engine
side.
