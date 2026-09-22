# Architecture

This package is a portable Agent Plugin plus a small adapter per host. The
portable core is `plugin.json`, `mcp.json`, and `skills/`. Cursor, Claude, and
Copilot adapters live in `.cursor-plugin/`, `.claude-plugin/`, `clients/`, and
`com.github.copilot/`.
Commands, hooks, and the Cursor rule are host adapters, not portable
Agent Plugins components. The package still ships no credentials.

## Portable contract → generate → validate

The standard Agent Plugins files—`plugin.json`, `mcp.json`, and `skills/`—are
the portable source of truth. The canonical operator lives under `agents/`.
`scripts/generate-manifests.mjs` reads those sources and `VERSION`, then writes
only the host projections: client MCP adapters, `.cursor-plugin/`,
`.claude-plugin/`, the optional `.codex-plugin/` compatibility manifest, and
the Copilot operator projection under `com.github.copilot/`.

Hook manifests stay hand-authored because each host has its own event schema:
`hooks/hooks.json` for Claude, `clients/cursor/hooks/hooks.json` for Cursor,
for each host. Strict repository-owned JSON
Schemas validate the documented subset used by each adapter, while structural
and behavioral tests validate path tokens, event ownership, and hook output.

```text
plugin.json + mcp.json + agents/ + VERSION
        │
        ▼
scripts/generate-manifests.mjs
        │
        ├── clients/*/mcp.json
        ├── .cursor-plugin/plugin.json
        ├── .claude-plugin/plugin.json, marketplace.json
        ├── .codex-plugin/plugin.json
        └── com.github.copilot/agents/arcade-operator.agent.md
        │
        ▼
npm run verify  (check.mjs, generate:check, schemas, tests)
```

After a version bump, run `node scripts/version.mjs <semver>` or
`npm run generate` so host projections stay in sync. Release Please updates
every version-bearing manifest, and CI simulates that update before accepting
the release configuration.

Hook scripts live in `hooks/*.mjs`. Hook manifests are per client:
`hooks/hooks.json` for Claude and `clients/cursor/hooks/hooks.json` for Cursor.
Codex lifecycle hooks are parked on branch `cursor/park-codex-hooks-gro-353-f8ad`.
Codex 0.154.0 and 0.155.1 parse `extensions.com.openai.hooks` and the `.codex-plugin`
fallback into `manifest.paths.hooks`, then discards them at load time for
`AgentPlugin` format ([`loader.rs` L954–956](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/core-plugins/src/loader.rs#L954-L956);
gate introduced in [openai/codex#37027](https://github.com/openai/codex/pull/37027);
tracked in [openai/codex#39895](https://github.com/openai/codex/issues/39895)).
`scripts/check.mjs` enforces that split. Maintainer-facing agent guidance lives
in [AGENTS.md](AGENTS.md) (read by Cursor, Claude Code, Codex, and others).

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
├── com.github.copilot/
│   └── agents/arcade-operator.agent.md Copilot and VS Code projection
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
└── agents/                             canonical Cursor + Claude operator
    └── arcade-operator.agent.md        bounded discovery + execution
```

Agent Plugins clients load `plugin.json`, `mcp.json`, and `skills/`. Cursor
resolves `.cursor-plugin/plugin.json` first and also registers `agents/`.
Claude Code resolves `.claude-plugin/plugin.json` and discovers `skills/` and
`agents/` from the default folders. Claude Desktop adds this repository as a
plugin marketplace via `.claude-plugin/marketplace.json` (`source: "./"`).
Copilot CLI and VS Code discover the generated operator under the Agent
Plugins client extension directory `com.github.copilot/agents/`.
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
model to self-report tokens, turns, or success, and it ships no telemetry hook.
If a host-specific hook later adds supplemental signals, it must be explicit,
opt-in, and documented as non-portable.
