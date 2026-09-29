# Plugin telemetry

The Arcade plugin sends scoped usage events to Arcade's PostHog by default.
Claude Code and Copilot CLI hooks locally classify prompts across sessions to
recognize app-related work. Prompts classified as unrelated send no event or routing reminder.
Direct Arcade tool calls remain observable, even without a classified prompt.
Alternative MCP, CLI, and web tools send events only during app-related work.

Events carry hashed session IDs, with no ID lasting across sessions. They
exclude prompt text, commands, app data, names, email addresses, and Arcade
account IDs. These observations do not establish task success or whether
Arcade was needed. Install and signed-in-user counts require gateway data.

## Prompt scope

A prompt matching the local app classifier or mentioning Arcade opens a
30-minute observation period
for its session. A short explicit confirmation such as “yes, send it” continues
that period without extending its expiry. An unrelated substantive prompt
closes it. Background task notifications leave the current period unchanged.
Expired, absent, or invalid state produces no alternative-tool telemetry.

`could_use_arcade` and `service_hints` describe keywords in the current prompt,
not the preceding task. A confirmation reply can therefore send a scoped prompt
event with `could_use_arcade: false` and no service hints. Keyword matching can
misclassify prompts; the labeled evaluation measures that limitation separately.

Session starts send no usage event. Only the Arcade operator's stop reports
send subagent events. Local classification and routing reminders remain active
when telemetry is off; turning off events does not disable Arcade routing.

## Turning it off

Set `ARCADE_PLUGIN_TELEMETRY=0` in your environment, or in Claude Code's
`settings.json`:

```json
{ "env": { "ARCADE_PLUGIN_TELEMETRY": "0" } }
```

`false`, `off`, and `no` also work. It is also off when `DO_NOT_TRACK` is set
to anything but those values, and when Claude Code's own `DISABLE_TELEMETRY`
or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set to any value. Like Claude
Code, the plugin reads `0` and `false` on those two as set.

With telemetry off, the client still invokes its configured Node hooks. The
telemetry hook exits without sending events; the routing hook still classifies
prompts locally. An environment variable cannot remove hooks from the manifest.

In Copilot CLI, set `ARCADE_PLUGIN_TELEMETRY=0` in your shell before starting
`copilot`. `COPILOT_OFFLINE=true` also turns it off (along with all other
Copilot network activity).

For testing, `ARCADE_PLUGIN_TELEMETRY_HOST` sends events to a different host.

## Where it runs

In Claude Code (CLI, IDE extensions, desktop Code tab, Cowork) and GitHub
Copilot CLI. VS Code reads Copilot's hook file but doesn't give hooks the
plugin's path, so every hook checks for its script and exits without doing
anything. VS Code sends no telemetry. Cursor isn't wired up; its hook input
includes the user's email. claude.ai, ChatGPT, and Codex don't run plugin
hooks.

Copilot CLI records MCP tool calls but doesn't record CLI or web tool use yet,
so it sends no `Plugin built-in tool called` or `Plugin built-in tool failed`
events.

## What is stored on your machine

The client's plugin data folder contains an `arcade-used` flag, readable only
by you. It holds `true` after an Arcade call succeeds and supplies
`arcade_used_before`. The plugin deletes an obsolete `install-id`, even with
telemetry off.

Prompt relevance state lives in `prompt-scope/<sha256(host:session_id)>.json` in
the same folder. It contains a relevance boolean, expiry timestamp, and optional
hashed prompt ID for duplicate-hook handling. It contains no prompt text,
commands, tool arguments, or service content. Expired state cannot authorize
observation. The next prompt-state write removes expired or malformed entries;
at most 256 session state files are retained. Session start clears that
session's state. Claude alternative-tool observations require a matching hashed
prompt ID; an absent prompt ID cannot authorize those observations.

- Claude Code: `~/.claude/plugins/data/<plugin id>/`
- Copilot CLI: `~/.copilot/plugin-data/<…>/`

If the client supplies no plugin data folder, the plugin sends nothing.

## What is sent

<!-- BEGIN generated from hooks/telemetry-contract.mjs by `npm run generate`; edit that file, not this block -->
Every event has these properties:

| Property | Value |
| --- | --- |
| `distinct_id` | the same value as `session` |
| `session` | `sha256(session_id)`, first 16 hex characters, where `session_id` is the client's random ID for the session |
| `turn` | `sha256(session_id + ":" + prompt_id)`, first 16 hex characters; Claude Code only, because Copilot CLI has no prompt ID |
| `arcade_used_before` | whether an Arcade tool call had succeeded on this machine before this event (from the `arcade-used` file) |
| `host` | `claude-code` \| `copilot-cli` |
| `telemetry_version` | `2`, the scoped event contract; earlier events have no version |
| `plugin_version` | from `VERSION` |
| `os` | `darwin` \| `linux` \| `win32` \| `other` |
| `$process_person_profile` | `false` |
| `$geoip_disable` | `true` |
| `$ip` | `0.0.0.0`, so PostHog stores this instead of your real IP address |

Events and their extra properties:

| Event | When | Extra properties |
| --- | --- | --- |
| `Plugin prompt submitted` | UserPromptSubmit, only for locally classified app work and short confirmations of that work; background task results are excluded. In Copilot CLI a relevant subagent prompt also sends it | `could_use_arcade`: boolean, a local keyword guess (see below). `service_hints`: service categories the prompt mentions. `reminder_sent`: boolean, whether the routing reminder was added (always `false` in Copilot CLI). |
| `Plugin tool attempted` | PreToolUse, in Claude Code, before an MCP call through this plugin's Arcade gateway or the claude.ai Arcade connection; an attempt does not show whether the tool finished | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (the claude.ai Arcade connection). `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. |
| `Plugin tool called` | PostToolUse, on Arcade tools, or alternative MCP tools while the current turn concerns app work | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. `auth_needed`: only for `System_ManageAuthorization`: whether its answer says a service still needs sign-in. |
| `Plugin tool failed` | PostToolUseFailure, on Arcade tools, or alternative MCP tools while the current turn concerns app work | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. `failure_kind`: picked on your machine from the error message; the message is not sent: `auth_required` \| `session_expired` \| `unreachable` \| `timeout` \| `http_error` \| `interrupted` \| `tool_error`. |
| `Plugin built-in tool called` | PostToolUse, Claude Code only, on `WebFetch` and `WebSearch`, and on `Bash` commands that run `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript`; only while the current turn concerns app work | `tool`: `Bash` \| `WebFetch` \| `WebSearch`. `cli`: only for `Bash`: the program the command runs, `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript`. `service`: the program's service category, only for `gh` \| `glab`: `code_hosting`. |
| `Plugin built-in tool failed` | PostToolUseFailure, Claude Code only, on `WebFetch` and `WebSearch`, and on `Bash` commands that run `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript`; only while the current turn concerns app work | `tool`: `Bash` \| `WebFetch` \| `WebSearch`. `cli`: only for `Bash`: the program the command runs, `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript`. `service`: the program's service category, only for `gh` \| `glab`: `code_hosting`. |
| `Plugin subagent stopped` | SubagentStop, only for arcade-operator | `agent`: `arcade-operator`. `status`: only for `arcade-operator`: the status line of its final report, `completed` \| `needs_auth` \| `needs_confirmation` \| `needs_clarification` \| `failed` \| `unknown`. `subagent_session`: `sha256(agent_id)`, first 16 hex characters. In Copilot CLI the subagent's own events carry this as `session`. |

Service categories: `email`, `calendar`, `chat`, `issues`, `docs`, `meetings`, `crm`, `code_hosting`, `analytics`, `storage`.
<!-- END generated telemetry tables -->

`could_use_arcade` is a local keyword guess (in
`hooks/telemetry-classify.mjs`) at whether the prompt is a task Arcade could
do: email, calendar, chat, and the other categories above.

`failure_kind`, `auth_needed`, and `cli` are values from fixed lists, picked
on your machine. The error text, the tool output, and the command they are
picked from are never sent. During an app-related observation period, a Bash
command sends an event only when one of its
commands starts with a listed program; commands that call a program by its
full path, such as `/opt/homebrew/bin/gh`, are not counted. A command that runs
two listed programs, such as `gh … && curl …`, sends one event for each, so
count CLI use by turn, not by event. Claude Code starts these hooks only for
commands that match (the hook `if` field, Claude Code 2.1.246 and later).

## Never sent

- prompt text, or any text you or the model wrote
- tool inputs, tool outputs, or error messages
- commands, their arguments, URLs, and search queries
- file paths, the working directory, or transcript paths
- names of MCP servers other than Arcade's, or their tool names
- names of subagents other than Arcade's
- your email, username, hostname, repository, or Arcade account

The plugin drops any property not listed on this page before sending.

PostHog sees the IP address the request comes from, like any web request, but
doesn't store it: every event sets `$ip` to `0.0.0.0`, and location lookup is
off.

## Reading the numbers

These events measure what plugin hooks observed, not whether Arcade was needed
or whether the user's task succeeded. `could_use_arcade` and `service_hints`
come from a local keyword classifier. A flagged prompt is a candidate for
review, not a confirmed opportunity. Prompt events are selected by relevance,
so they cannot measure the share of all prompts needing Arcade; unrelated
prompts are deliberately absent. Use labeled task evaluations to score routing, and compare the
plugin with a baseline or variant before attributing a change to it.
Neither host emits a task ID.

Keep the observation stages separate:

| Stage | Evidence | What it establishes |
| --- | --- | --- |
| Tool attempt (Claude Code) | `Plugin tool attempted` on PreToolUse | The model invoked a tool. An attempt alone has no observed outcome. |
| Gateway discovery or selection | `Plugin tool called` or `Plugin tool failed` for `Arcade_ListApps` or `Arcade_SelectTools` | The discovery or selection call completed or failed; a successful selection is not an app action. |
| Authorization check | `System_ManageAuthorization`, reported separately | `auth_needed: true` means its answer said sign-in was needed. A check alone says nothing about app use; `false` does not prove every app is connected. |
| App action | `Arcade_UseTool` or a named public Arcade toolkit tool, split by `Plugin tool called` and `Plugin tool failed` | The hook observed a tool completion or failure. Private tool names reported as `other` cannot be assigned to this stage. Neither outcome proves the user's task succeeded. |
| No Arcade call observed | A prompt with no Arcade tool event in the observable group | The hooks saw no call. This is not a routing miss without an independently labeled need and complete tool visibility. |

Count each unit once at each stage, and show the denominator, host, date range,
plugin version, telemetry version, and observation coverage beside every rate.
`telemetry_version: 2` identifies scoped events; a missing value identifies the
legacy contract. Keep those populations separate, even at the same plugin
version. Keep the number of
observed prompt units and sessions visible even when a chart has no app actions.
Do not extrapolate rates from a test sample or telemetry-enabled sessions to all users.
Do not mix Claude turns with Copilot session counts in one rate.

### Claude Code turns

The denominator is distinct `turn` values with a `Plugin prompt submitted`
event. This is a count of observed relevant turns, not all prompts or tasks.
Exclude tool-only turns: Claude Code filters background task results
from prompt events. Group tool events with the same `turn`, including an
arcade-operator's events, and report sessions and turns separately. A short
follow-up such as “yes, send it” is a separate observed turn while scope is
active, even when its keyword flag is false. Turn counts do not describe whole
tasks. Report tool-only turns separately from this denominator.

`server: other_arcade` means the hook observed another connection's Arcade
gateway tool. A live Claude Code run invoked Arcade through a claude.ai
connection without a PostToolUse event. A `Plugin tool attempted` event can
show that invocation, but only `Plugin tool called` or `Plugin tool failed`
records its outcome. Count an attempt without either outcome as **attempt
observed, outcome unknown**, not app action success. It does not set
`arcade_used_before`. Label flagged turns with no Arcade tool event **no call
observed**, not **missed**. A direct app tool on another gateway may appear
as `server: other`, without an identifiable Arcade call.

A built-in CLI or web event is a tool observation, not evidence of fallback.
Only call it a possible fallback after linking it to a labeled Arcade-eligible
task and establishing that it served the same request.
`arcade_used_before: false` says no Arcade call has previously succeeded on
that machine; it does not prove that the gateway or a particular app was
unconnected.

### Copilot CLI sessions

Copilot CLI supplies no `prompt_id` or `turn`. Count distinct sessions with a
scoped `Plugin prompt submitted` event as **observed relevant sessions**. Report
multiple-prompt sessions separately. This is not a count of all sessions, user
tasks, or turns. Session starts are not transmitted and cannot define roots.

An Arcade operator's stop report carries `subagent_session`, equal to that
operator's own event `session`. Exclude known linked operator prompts from the
parent-session denominator and include their tool events with the parent.
Other subagents do not send stop reports, so their prompt sessions cannot be
reliably distinguished from roots. Report that parent attribution is unknown
rather than labeling every unlinked session as a root.

Detached event delivery can change arrival order. A missing operator stop or a
rolling-window boundary can also remove a parent link. Do not reconstruct
per-prompt outcomes from timestamps alone or link resumed tasks across sessions.

Copilot names MCP tools `<server>-<tool>` with no plugin prefix, so an MCP
server named `arcade` counts as `server: arcade` even if this plugin did not
install it. Copilot sends no built-in CLI or web events; its `arcade-operator`
can report `status: unknown`. Do not infer a fallback or task result from
either absence.

### Failure and outcome limits

`failure_kind` is a local classifier of error text, not a server error code.
An app sign-in failure can be `tool_error` when its wording does not match the
classifier; bad input, rate limits, and upstream errors can also get that
value.

`auth_needed: true` on an authorization check reports a service still needing
sign-in; operator `status: needs_auth` is the model's report, not a verified
server status. `auth_required`, `session_expired`, `timeout`, and `unreachable`
match known client or MCP SDK error wording; other wording can classify
differently. Copilot does not report interrupted calls, so its `interrupted`
category is empty.

Operator status describes its report, not the parent task's result. The hooks
do not send final answers or satisfaction signals. Task success, true routing
misses, and improvement from this plugin require labeled evaluations outside
this telemetry.

## Routing evaluation

The [routing evaluation](routing-evaluation.md) measures classification and tool
routing against independently labeled cases, including confirmation replies.
Its results are separate from production usage events. Fixture accuracy does
not establish real-user routing quality; prompts with no app name and coding
work involving service names need explicit coverage.
