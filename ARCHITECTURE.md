# Architecture

This package is a portable Agent Plugin plus a small adapter per host. The
portable core is `plugin.json`, `mcp.json`, and `skills/`. Cursor and Claude
adapters live in `.cursor-plugin/`, `.claude-plugin/`, and `clients/`.
Commands, hooks, and the Cursor rule are host adapters, not portable
Agent Plugins components. The package still ships no credentials.

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
├── clients/
│   ├── cursor/
│   │   ├── mcp.json                    Cursor infers transport from url
│   │   ├── hooks/hooks.json            Cursor sessionStart
│   │   └── rules/arcade.mdc              always-apply: try Arcade first
│   └── claude/mcp.json                 Claude needs type: http
│   └── claude-desktop/
│       ├── mcpb/                       Claude Desktop .mcpb source
│       └── claude_desktop_config.json  manual config merge
│
├── commands/                           arcade-apps, arcade-connect, arcade-status
├── hooks/                              Claude Code session + per-turn hooks
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
`agents/` from the default folders. Every client can still run the workflow
directly through MCP without the operator.

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
│  https://api.bosslevel.dev/mcp/all-optimized                 │
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
model to self-report tokens, turns, or success, and it ships no telemetry hook.
If a host-specific hook later adds supplemental signals, it must be explicit,
opt-in, and documented as non-portable.
