# Architecture

This package is a portable Agent Plugin plus a small adapter per host. The
portable core is `plugin.json`, `mcp.json`, and `skills/`. Cursor, Claude, and
Copilot adapters live in `.cursor-plugin/`, `.claude-plugin/`, `clients/`, and
`com.github.copilot/`.
Commands, hooks, and the Cursor rule are host adapters, not portable
Agent Plugins components. The package still ships no credentials.

## Sources and generated files

Every client reads its own files from its own paths, so the repo has one file
per client where a client requires it. Those files are written by
`npm run generate` from a small set of sources. Nothing client-specific is
edited by hand except the command files.

| Source (edit these) | What it holds |
| --- | --- |
| `plugin.json`, `mcp.json`, `VERSION` | identity, gateway URL, version, Codex listing metadata |
| `hooks/routing-guidance.mjs` | the Arcade routing rules, as sentences |
| `hooks/hook-hosts.mjs` | which hook script runs on which event in which host |
| `agents/arcade-operator.agent.md` | the operator (except its generated rules block) |
| `skills/` | the skills (except the generated rules block in try-arcade) |

```text
sources above
        │
        ▼
scripts/generate-manifests.mjs
        │
        ├── .cursor-plugin/plugin.json, clients/cursor/mcp.json
        ├── .claude-plugin/plugin.json, marketplace.json, clients/claude/mcp.json
        ├── hooks/hooks.json (Claude Code), clients/cursor/hooks/hooks.json
        ├── clients/cursor/rules/arcade.mdc
        ├── com.github.copilot/agents/arcade-operator.agent.md
        └── the rules block in agents/arcade-operator.agent.md and skills/try-arcade/SKILL.md
        │
        ▼
npm run verify  (generate:check fails if any generated file was edited by hand)
```

`.gitattributes` marks the generated files so GitHub collapses them in pull
request diffs. Each hook command passes `--host <name>`, and the script
prints the output format that host reads (`hookSpecificOutput` for Claude
Code, `additional_context` for Cursor). JSON Schemas under
`schemas/host-adapters/` check the generated files against each client's
documented format.

After a version bump, run `node scripts/version.mjs <semver>` or
`npm run generate`. Release Please updates every version-bearing manifest,
and CI simulates that update before accepting the release configuration.

Codex lifecycle hooks are parked on branch `cursor/park-codex-hooks-gro-353-f8ad`.
Codex 0.154.0 and 0.155.1 read `extensions.com.openai.hooks`, then discard
plugin hooks for Agent Plugins packages
([`loader.rs` L955–956](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/core-plugins/src/loader.rs#L954-L964);
added in [openai/codex#37027](https://github.com/openai/codex/pull/37027);
tracked in [openai/codex#39895](https://github.com/openai/codex/issues/39895)).
Maintainer-facing agent guidance lives in [AGENTS.md](AGENTS.md).

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
├── com.github.copilot/
│   └── agents/arcade-operator.agent.md Copilot and VS Code projection
├── clients/
│   ├── cursor/
│   │   ├── mcp.json                    Cursor infers transport from url
│   │   ├── hooks/hooks.json            Cursor sessionStart
│   │   └── rules/arcade.mdc              always-apply: try Arcade first
│   ├── claude/mcp.json                 Claude needs type: http
│   └── claude-desktop/
│       └── claude_desktop_config.json  tools-only fallback
│
├── commands/                           arcade-apps, arcade-connect, arcade-status
├── hooks/                              hook scripts, routing rules, hook table
│
├── README.md                           customer-facing overview
├── ARCHITECTURE.md                     this file
├── LICENSE                             MIT
├── CHANGELOG.md
├── docs/
│   ├── support-matrix.md               what each client loads
│   ├── telemetry.md                    anonymous events sent from Claude Code
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
│  canonical tool-call records live here                       │
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

In Claude Code, `hooks/telemetry.mjs` also sends anonymous events on whether
the model used Arcade when a prompt looked like a task Arcade could do. It is
on by default, turned off with `ARCADE_PLUGIN_TELEMETRY=0`, and described in
[docs/telemetry.md](docs/telemetry.md). The network send runs in a detached
`hooks/telemetry-send.mjs`, so a turn never waits on the network.
