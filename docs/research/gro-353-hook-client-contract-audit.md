# GRO-353 hook and client contract audit

Checked 2026-09-17 against the current PR #9 worktree and first-party
documentation, schemas, and source repositories. This note distinguishes the
portable Agent Plugins contract from each host's adapter contract.

## Executive result

The Claude, Cursor, and OpenAI hook adapters now use the documented event names,
command locations, path variables, and output shapes. The main discrepancy found
during the audit was the Copilot/VS Code custom-agent location: an Agent Plugins
1.0 package does not expose root `agents/` to those clients. The current worktree
fixes that with a generated `com.github.copilot/agents/` projection and updates
the support matrix accordingly.

| Client | Result | Important qualification |
| --- | --- | --- |
| Cursor IDE/CLI | Confirmed | `.cursor-plugin/plugin.json`, `sessionStart`, `${CURSOR_PLUGIN_ROOT}`, and `{ "additional_context": ... }` match Cursor's contract. Plugin hooks are not a Cursor Cloud Agents configuration source. |
| Claude Code CLI / Code desktop | Confirmed | Default plugin directories, custom agent, commands, and both hooks are supported. Code desktop uses the same engine and shared configuration as the CLI. |
| Claude Cowork | Confirmed | Synced plugins load skills, agents, hooks, and MCP servers in the Cowork environment. Claude Desktop Chat remains a separate, smaller surface. |
| Claude Desktop Chat | Confirmed | The marketplace plugin provides tools and skills; the repo does not claim hooks or a custom agent in Chat. |
| Copilot CLI / VS Code | Confirmed after correction | Agent Plugins 1.0 custom agents must be under `com.github.copilot/agents/`; the generated projection now satisfies this. Root `hooks/hooks.json` is not a Copilot hook adapter. |
| Codex / ChatGPT local execution | Confirmed | `extensions.com.openai.hooks`, `${PLUGIN_ROOT}`, and the three OpenAI hook events are valid. `SubagentStart` injects context but cannot cancel startup. |
| OpenCode / generic MCP clients | Confirmed at claimed scope | The repo claims only the hosted MCP endpoint, not host-specific skills, hooks, or agents. |

## Portable contract

Agent Plugins 1.0 standardizes only `skills/` and root `mcp.json`. Agents,
commands, rules, and hooks are intentionally client-specific. Client data goes
under a reverse-domain key in `extensions`, with client files in a same-named
top-level directory. The canonical schema only requires each extension value to
be an object; it cannot validate the meaning of `extensions.com.openai` or
`extensions.com.github.copilot`. See the [1.0 specification](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md),
[client-extension guidance](https://agent-plugins.org/plugin-authors/client-extensions),
and [canonical JSON Schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json).

That means root schema validation is necessary but insufficient. The repository
needs separate host-adapter validation for every non-portable component.

## Cursor

Cursor's native plugin manifest is `.cursor-plugin/plugin.json`; its documented
fields include `agents`, `skills`, `commands`, `rules`, `hooks`, and
`mcpServers`. The repo's explicit paths are valid. Cursor hook manifests use
`version: 1`, lower-camel event names, and a flat command entry. The current
`sessionStart` contract is:

- common input fields such as `conversation_id`, `hook_event_name`,
  `cursor_version`, and `workspace_roots`;
- event fields `session_id`, `is_background_agent`, and `composer_mode`;
- output fields `env` and/or `additional_context`;
- fire-and-forget startup semantics, so the hook cannot block the agent loop.

The shared script now recognizes the current event-specific fields rather than
depending only on an older `cursor_version` fixture, while deliberately not
treating the cross-host `session_id` field alone as proof of Cursor. Its
`{ "additional_context": ... }` output is correct. See Cursor's
[Hooks reference](https://cursor.com/docs/hooks#sessionstart) and
[Plugins reference](https://cursor.com/docs/reference/plugins). Cursor's own
plugins also demonstrate `${CURSOR_PLUGIN_ROOT}` in hook commands, including the
[Advisor hook manifest](https://github.com/cursor/plugins/blob/main/advisor/hooks/hooks.json).

Cloud scope matters: Cursor documents project, team, and enterprise hooks as
Cloud Agent sources, not locally installed plugin hooks, and says `sessionStart`
is unavailable in hosted Cloud Agents. Therefore the matrix's Cursor hook check
should be read as IDE/CLI plugin support, not hosted Cloud Agent support.

## Claude

Claude plugins discover `skills/`, `agents/`, `commands/`, and
`hooks/hooks.json` by default. `${CLAUDE_PLUGIN_ROOT}` is the documented plugin
path variable. `SessionStart` and `UserPromptSubmit` are valid event names, and
the nested `hookSpecificOutput.hookEventName` plus `additionalContext` response
is correct. Exit `0` is the right non-blocking result. See Anthropic's
[plugin reference](https://code.claude.com/docs/en/plugins-reference) and
[hooks reference](https://code.claude.com/docs/en/hooks).

Current Claude `SessionStart` sources are `startup`, `resume`, `clear`,
`compact`, and `fork`. The worktree now includes all five, so routing context is
re-injected after compaction and forked sessions. Claude also supports a
`SubagentStart` event, but omitting it here is intentional: the shipped
`arcade-operator` already receives its dedicated instructions. This is a design
choice, not a Claude limitation.

`agents/arcade-operator.agent.md` uses the common `name` and `description`
frontmatter and a `.agent.md` filename accepted by the covered agent hosts. The
Claude manifest may omit explicit agent, skill, command, and hook paths because
those are default locations.

The support-matrix split is accurate after renaming the combined row to
"Claude Cowork / Code desktop." Anthropic documents Code desktop as the same
underlying Claude Code engine with shared hooks, skills, and plugin management:
[Desktop application](https://code.claude.com/docs/en/desktop#coming-from-the-cli).
Synced plugins load their skills, agents, hooks, and MCP servers into Cowork's
session environment: [synced plugins](https://code.claude.com/docs/en/plugins-reference#synced-plugins).
Claude Desktop Chat is a separate surface; Anthropic's current product guidance
exposes skills in Chat while subagents and hooks run in Cowork. See
[Use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude).

## GitHub Copilot CLI and VS Code

The root `$schema` opts this package into Agent Plugins 1.0 semantics. GitHub's
official reference says those semantics do not discover client-specific agents
from root `agents/`; Copilot components instead live at fixed paths under
`com.github.copilot/`, including `com.github.copilot/agents/` and
`com.github.copilot/hooks/hooks.json`. Root `agents/` is a legacy-plugin
convention. See the [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference#components)
and VS Code's [Agent Plugins documentation](https://code.visualstudio.com/docs/agent-customization/agent-plugins).

Before this audit, the repo claimed Copilot CLI discovered
`agents/arcade-operator.agent.md`; that claim was incorrect. The current
worktree generates `com.github.copilot/agents/arcade-operator.agent.md` from the
canonical source and checks it for drift. This makes the operator claim accurate
for both Copilot CLI and VS Code.

The repo correctly does not claim Copilot hooks. Copilot's native format is a
different adapter: it uses version 1 and event names such as
`userPromptSubmitted`, with its own command and output fields. See GitHub's
[hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference).

## OpenAI / Codex

OpenAI's portable-package extension accepts a `hooks` path under
`extensions.com.openai`; `./com.openai/hooks/hooks.json` is valid and resolves
inside the plugin root. `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are the documented
variables for plugin hooks. The fallback `.codex-plugin/plugin.json` is used only
when the root `extensions.com.openai` object is absent; the two sources are not
merged. Do not rely on fallback-only display metadata in current loaders. See
[Package your plugin](https://developers.openai.com/plugins/build/plugins),
[Hooks](https://learn.chatgpt.com/docs/hooks), and the first-party
[manifest parser](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/agent_plugin_manifest.rs).

`SessionStart`, `UserPromptSubmit`, and `SubagentStart` are supported. The
configured matchers are correct for the released contract:

- `SessionStart`: `startup|resume|clear|compact`;
- `UserPromptSubmit`: matcher omitted because it is ignored;
- `SubagentStart`: `*`, matching all `agent_type` strings.

The scripts emit the documented `hookSpecificOutput` shapes and exit `0`.
`SubagentStart.additionalContext` is placed in the new subagent's developer
context, but neither `continue: false` nor a nonzero exit prevents creation.
Official generated schemas define the exact inputs and outputs, including the
[SubagentStart input](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/subagent-start.command.input.schema.json)
and [SubagentStart output](https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/subagent-start.command.output.schema.json).
The canonical hook manifest types are in
[`hook_config.rs`](https://github.com/openai/codex/blob/main/codex-rs/config/src/hook_config.rs).

Codex currently supports built-in and user-configured subagents but does not
load a custom agent role from an installed plugin. The matrix therefore
correctly shows no shipped operator for Codex and uses `SubagentStart` to give
routing guidance to whatever subagent starts. See OpenAI's
[Subagents documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Validation and adherence

The current worktree addresses the highest-value enforcement gaps:

1. It validates each of the three shipped hook manifests against a strict,
   repository-owned host schema instead of checking raw strings only.
2. It runs `claude plugin validate . --strict`.
3. It generates and drift-checks the Copilot/VS Code namespaced agent.
4. It validates the canonical Agent Plugins manifests independently.

Recommended follow-ups:

- Vendor or pin OpenAI's generated input/output schemas and validate each hook
  fixture and captured stdout against the event-specific schema. Manifest
  validation alone cannot detect a wrong response shape.
- Add schema-conformant Cursor input fixtures containing both its common fields
  and the current `sessionStart` fields. Keep the minimal event-field regression
  test because it protects host detection.
- Keep the local Claude/Cursor schemas narrow and cite a checked date because
  neither host currently publishes a stable, complete JSON Schema for every
  plugin hook surface. Review those schemas when pinned client versions change.
- Add install/discovery smoke tests with pinned host CLIs where available. JSON
  Schema can validate syntax but cannot prove that a client actually discovers
  a component at runtime.
- Treat support-matrix capability data as generated or testable data so a
  component cannot be claimed unless its host path exists and the corresponding
  adapter validation passes.
- Qualify Cursor hooks as IDE/CLI support in user-facing prose if Cloud Agents
  become an advertised install target.

No additional implementation discrepancy was found in the current worktree.
The OpenAI extension-precedence note and Cursor Cloud scope are documentation
constraints worth retaining in future changes.
