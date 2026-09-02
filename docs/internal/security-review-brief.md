# Arcade Plugin — Security Review Brief

**Repo:** https://github.com/ArcadeAI/arcade-plugin  
**Plugin PR:** https://github.com/ArcadeAI/arcade-plugin/pull/1 (initial plugin)  
**Security policy PR:** https://github.com/ArcadeAI/arcade-plugin/pull/2 (stacked)  
**Status:** Internal review — personal trial plugin  
**Reviewer:** ___________________  
**Date:** ___________________

---

## Executive summary

This repository ships an agent plugin for AI agent hosts (Cursor, Claude Code, VS Code, Copilot CLI, Codex, Claude Desktop). It is configuration and instructions only — skills, rules, commands, hooks, and MCP wiring.

**Who installs it:** Anyone with a compatible AI agent — not necessarily a developer. Installers are potential **Arcade Operators** who add the plugin to their agent host for personal trials; org rollout is configured separately in the Arcade dashboard.

It does not:

- Run a server
- Store customer data
- Ship or request API keys / OAuth tokens
- Include plugin-side telemetry

When someone uses the plugin, their AI agent connects to Arcade's hosted MCP gateway (https://api.bosslevel.dev/mcp/all-optimized). If the user asks the agent to do something that requires Arcade tools — email, calendar, Slack, issues, etc. — those calls go through the gateway after the user signs in via browser OAuth.

**Bottom line:** The repo itself does not touch customer data. Third-party data is only accessed when the user directs the agent and has already authorized the relevant services through Arcade.

---

## What this repo is

This is not an application, service, or SDK. It is a **distribution package** that teaches compatible AI agent hosts how to use Arcade — and wires them to Arcade's hosted MCP gateway.

Think of it in three layers:

### 1. Behavior (what the agent is told to do)

Markdown and config that shape agent behavior. No code runs here.

- skills/ — when to use Arcade, how to handle sign-in, confirmations, errors
- agents/ — optional arcade-operator subagent for bounded tool execution
- commands/ — slash commands for status, connect, and app management
- clients/cursor/rules/ — Cursor-only always-on routing rule

Security posture: static text only. Review for prompt-injection resistance and unsafe instructions (e.g. skipping confirmation before writes).

### 2. Integration (how the agent reaches Arcade)

JSON configs that register one MCP server named arcade pointing at the plugin gateway.

- mcp.json — portable Agent Plugins definition
- clients/cursor/mcp.json — Cursor transport adapter
- clients/claude/mcp.json — Claude Code transport adapter (type: http)
- clients/claude-desktop/ — Claude Desktop .mcpb bundle + manual config example

Security posture: config only, no secrets. All paths must resolve to the same documented endpoint (https://api.bosslevel.dev/mcp/all-optimized). No alternate or hidden servers.

### 3. Host adapters (how each client loads the package)

Thin manifests per tool — same repo, different entry points.

- .cursor-plugin/plugin.json — Cursor: skills, agents, commands, rules, hooks, MCP
- .claude-plugin/plugin.json — Claude Code: MCP adapter only (skills/agents auto-discovered)
- clients/claude-desktop/mcpb/ — Claude Desktop: separate install path, tools only

Security posture: JSON wiring only. Validated in CI so manifests cannot reference missing files or drift from the portable core.

### What actually executes code?

| Runs | Where | Network? | When |
| --- | --- | --- | --- |
| hooks/session-start.mjs | User's device (local plugin install) | No | Cursor / Claude Code session start |
| hooks/user-prompt-submit.mjs | User's device (local plugin install) | No | Claude Code per-turn (not Cursor) |
| mcp-remote (via npx) | User's device (local plugin install) | Yes → gateway only | Claude Desktop only |
| Arcade MCP gateway | Arcade hosted | Yes | When agent calls tools (out of repo scope) |

Everything else is text or JSON read by the host agent at install/load time.

### What this repo does NOT include

- Arcade's gateway service, auth system, or OAuth flows for third-party services
- Customer data storage or processing
- API keys, tokens, or credentials
- Plugin-side telemetry or analytics
- Production npm/runtime dependencies (dev-only toolchain for CI schema validation and smoke tests)

### Install vs runtime (reviewer mental model)

**Install:** `npx plugins add` (or equivalent) copies plugin files onto the **user's device** — wherever their AI agent host stores plugins. The installer does not need to be a developer; they only need permission to install into their agent (Cursor, Claude Desktop, etc.). The repo/package itself makes no network call during install.

**Runtime:** The host agent reads those local files, optionally runs hooks, and — when it invokes Arcade MCP tools — calls the gateway. Data only leaves the user's session when the agent makes a tool call and the user has authorized the underlying service through Arcade.

---

## Repo layout (file-by-file reference)

Detailed inventory for reviewers who want to trace every path. The conceptual model is in "What this repo is" above.

### Portable core (all Agent Plugins clients)

| Path | Purpose | Network at runtime? | Notes |
| --- | --- | --- | --- |
| plugin.json | Plugin identity, version, description | No | Agent Plugins 1.0 manifest |
| mcp.json | MCP server definition (streamable-http → plugin gateway) | Config only | Same endpoint for VS Code, Copilot CLI, Codex |
| skills/ | try-arcade, scale-arcade instructions | No | Text only |
| agents/ | arcade-operator subagent definition | No | Text only; used by Cursor, Claude Code, Copilot CLI |
| commands/ | Slash commands (arcade-apps, arcade-connect, arcade-status) | No | Text only; Cursor + Claude Code |

### Cursor adapter

| Path | Purpose | Network at runtime? | Notes |
| --- | --- | --- | --- |
| .cursor-plugin/plugin.json | Cursor manifest — points at skills, agents, commands, rules, hooks, MCP | No | Cursor reads this instead of inferring paths |
| clients/cursor/mcp.json | MCP config for Cursor (url-only transport) | Config only | Loaded via .cursor-plugin |
| clients/cursor/hooks/hooks.json | sessionStart hook registration | No | Runs hooks/session-start.mjs via ${CURSOR_PLUGIN_ROOT} |
| clients/cursor/rules/arcade.mdc | Always-on rule: route external service tasks through Arcade | No | Injected into every Cursor session |

Cursor-only extras: always-apply rule + session hook. No per-turn hook (Claude has that).

### Claude Code / Cowork adapter

| Path | Purpose | Network at runtime? | Notes |
| --- | --- | --- | --- |
| .claude-plugin/plugin.json | Claude manifest — points at clients/claude/mcp.json | No | Skills/agents auto-discovered from default folders |
| clients/claude/mcp.json | MCP config for Claude (type: http) | Config only | Same gateway URL, Claude-specific transport field |
| hooks/hooks.json | SessionStart + UserPromptSubmit hook registration | No | Runs shared hooks via ${CLAUDE_PLUGIN_ROOT} |
| hooks/session-start.mjs | Injects routing guidance at session start | No | stdin → JSON; no network |
| hooks/user-prompt-submit.mjs | Per-turn routing reminder (Claude only) | No | Suppresses bare acknowledgements like "yes thanks" |

Claude does not load the Cursor rule or clients/cursor/hooks.

### Claude Desktop adapter (separate install path)

Claude Desktop does not load this repo as an Agent Plugin. It uses a bundled extension instead.

| Path | Purpose | Network at runtime? | Notes |
| --- | --- | --- | --- |
| clients/claude-desktop/mcpb/manifest.json | .mcpb extension metadata | No | Built artifact attached to GitHub Releases |
| clients/claude-desktop/mcpb/server/index.js | Placeholder entry point (schema requirement) | No | Not executed in normal use; mcp_config is authoritative |
| clients/claude-desktop/claude_desktop_config.json | Manual config merge example | Config only | Alternative to .mcpb install |
| clients/claude-desktop/arcade.mcpb | Built extension (gitignored) | N/A | Produced by CI/release workflow |

At runtime on Claude Desktop, the extension runs:

npx -y mcp-remote@0.1.38 → api.bosslevel.dev

mcp-remote is pinned but fetched via npx at install time. Supply-chain review recommended.

Claude Desktop gets tools only — no skills, commands, operator, or hooks.

### What each client actually loads

| Client | Portable core | Cursor adapter | Claude adapter | Desktop .mcpb |
| --- | --- | --- | --- | --- |
| Cursor | Yes | Yes | — | — |
| Claude Code / Cowork | Yes | — | Yes | — |
| VS Code / Copilot CLI / Codex | Yes (partial) | — | — | — |
| Claude Desktop | — | — | — | Yes (tools only) |
| OpenCode / any MCP client | MCP URL only | — | — | — |

Full matrix: docs/support-matrix.md

---

## Trust boundaries

User's device → AI agent host (Cursor, Claude, etc.) reads local plugin files (skills, rules, hooks)

AI agent host → MCP → api.bosslevel.dev (plugin gateway)

Gateway → OAuth → third-party apps (Gmail, Slack, etc.)

Hooks do not call the network.

Only external capability boundary in the plugin: https://api.bosslevel.dev/mcp/all-optimized

---

## Data handling

| Data type | In this repo? | At runtime (when plugin is used)? |
| --- | --- | --- |
| Customer / end-user data | No | Only when the agent invokes an Arcade tool that reads or writes a third-party service — flows through the gateway, not this repo |
| API keys / OAuth tokens | No | Handled by Arcade in browser; tokens live in gateway, not in plugin |
| User prompts / chat with host agent | No | Handled by the AI agent host (Cursor, Claude, etc.) under that product's policies |
| Telemetry | No plugin telemetry | Documented: observability is on the MCP gateway, not in this package |
| Secrets / .env | Not committed | N/A |

---

## Security controls in the design

- [ ] No credentials in source — plugin instructs agents not to ask for tokens/API keys
- [ ] Confirmation before writes — skills require explicit user approval before send/create/delete
- [ ] Bounded operator subagent — stops at auth, confirmation, or failure boundaries
- [ ] Hooks are fail-open — never block sessions; only inject static guidance text (no network, no file writes)
- [ ] .gitignore excludes .env, node_modules/, built .mcpb artifacts
- [ ] CI checks — structural validation, schema validation, hook tests, plugin discovery smoke test
- [ ] Apache-2.0 license
- [ ] SECURITY.md (PR #2) — private vulnerability reporting path

---

## In scope for this security review

- [ ] No secrets accidentally committed
- [ ] Gateway URL matches the documented plugin endpoint
- [ ] Hook behavior is safe (no network, no exfiltration, no file writes)
- [ ] MCP config points only to the documented Arcade endpoint
- [ ] Client adapter manifests (.cursor-plugin, .claude-plugin, clients/*) point only at expected local paths and the plugin gateway
- [ ] Cursor rule and hooks contain only static guidance (no dynamic exfiltration)
- [ ] Claude hooks (session-start, user-prompt-submit) behavior reviewed
- [ ] Claude Desktop .mcpb / mcp-remote bridge acceptable
- [ ] Branch protection / PR approval workflow is in place
- [ ] Private repo access is appropriately restricted

## Out of scope (separate review tracks)

- Vulnerabilities in the Arcade MCP gateway or Arcade platform infrastructure
- OAuth flows, data retention, and access controls on connected third-party apps
- End-user and organizational policies for AI agent hosts (Cursor, Claude, enterprise admin controls)
- GA readiness and public marketplace distribution (this package is framed for personal trial use)

---

## Known flags / open items

| Item | Notes | Risk | Recommendation |
| --- | --- | --- | --- |
| Plugin gateway | Points at api.bosslevel.dev | Users may confuse trial plugin with org deployment | Document personal-trial scope; org rollout via dashboard |
| Private repo | npx plugins add requires GitHub auth | Fine for internal use | Public only when ready for external distribution |
| CI toolchain | Pinned via package-lock (plugins, claude-code CLI, ajv); Node 22.23.2 in workflows; Agent Plugins schemas vendored locally | Drift if unpinned | Bump versions in constants.mjs + devDependencies together |
| Third-party services (i.e. the services an Arcade tool connects to) | User-authorized data via OAuth | Data processing via Arcade platform | Review under existing Arcade privacy/DPA |
| No live gateway integration tests | CI validates structure, not runtime gateway behavior. That is not its responsibility. | Gateway regressions not caught here | Leave as-is |

---

## Privacy / compliance pointers

- Privacy policy: https://www.arcade.dev/privacy-policy
- When users authorize services and the agent invokes Arcade tools, processing happens through Arcade's gateway — assess under internal data classification and vendor review for Arcade (internal Arcade Operators today; external users when publicly distributed)
- This repo alone does not create a new data store or subprocess customer PII

---

## Suggested approval framing

Approve the plugin package as personal-trial tooling: static agent config + MCP wiring to the documented gateway, no embedded secrets, no plugin-side telemetry.

Separate sign-off required for: public distribution, org rollout policies, and organizational policies for who may install AI agent plugins (including internal employee AI-agent usage policies).

---

## Reviewer sign-off

| Question | Yes | No | Notes |
| --- | --- | --- | --- |
| Comfortable with repo contents for personal trial use? | ☐ | ☐ | |
| Comfortable with plugin gateway endpoint? | ☐ | ☐ | |
| Comfortable with client adapters (.cursor-plugin, .claude-plugin, clients/*)? | ☐ | ☐ | |
| Comfortable with mcp-remote supply-chain approach? | ☐ | ☐ | |
| Any blockers before merge? | ☐ | ☐ | |

**Decision:** ☐ Approved  ☐ Approved with conditions  ☐ Not approved

**Reviewer name / date:** _________________________________

**Conditions (if any):** _________________________________
