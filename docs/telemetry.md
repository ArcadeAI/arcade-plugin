# Plugin telemetry

**Telemetry is off in this build.** The plugin sends no usage events, and
`npm run generate` writes no telemetry hooks into any client manifest.
`TELEMETRY_ENABLED` in `hooks/telemetry-config.mjs` stays `false` until
collection is separately approved after ingestion, opt-outs, privacy, and
distribution requirements are verified.

The sections below describe what **would** be sent when telemetry is turned on,
how to read exported events, and how that relates to gateway telemetry and
offline routing evaluation. Nothing here implies that this package currently
transmits data.

When enabled, Claude Code and Copilot CLI hooks would inspect prompts locally
in each session to recognize app-related work. Relevance state belongs to that
session; it does not carry between sessions. Prompts classified as unrelated
would send no event. Direct Arcade tool calls would remain observable even
without a classified prompt. Alternative MCP, CLI, and web tools would send
events only during app-related work.

Events would carry hashed session IDs, with no ID lasting across sessions. They
would exclude prompt text, commands, app data, names, email addresses, and Arcade
account IDs. These observations do not establish task success or whether
Arcade was needed. Install and signed-in-user counts require gateway data.

## Prompt scope

A prompt matching the local app classifier or mentioning Arcade would open a
30-minute observation period for its session. A short explicit confirmation such
as “yes, send it” would continue that period without extending its expiry. An
unrelated substantive prompt would close it. Background task notifications would
leave the current period unchanged. Expired, absent, or invalid state would
produce no alternative-tool telemetry.

`could_use_arcade` and `service_hints` describe keywords in the current prompt,
not the preceding task. A confirmation reply can therefore send a scoped prompt
event with `could_use_arcade: false` and no service hints. Keyword matching can
misclassify prompts; the labeled evaluation measures that limitation separately.

Session starts send no usage event. Only the Arcade operator's stop reports
send subagent events. Claude Code adds its routing reminder on every prompt
except short acknowledgements and background task results, whether or not
telemetry is on. Copilot CLI has no routing reminder hook, so `reminder_sent`
stays false there.

## Opt-outs when telemetry is on

While `TELEMETRY_ENABLED` is `false`, these switches are inert but documented
for a future enabled build. They are implemented in `hooks/telemetry-run.mjs`
and each client's adapter in `hooks/telemetry-adapters/`.

Set `ARCADE_PLUGIN_TELEMETRY=0` in your environment, or in Claude Code's
`settings.json`:

```json
{ "env": { "ARCADE_PLUGIN_TELEMETRY": "0" } }
```

`false`, `off`, and `no` also work. Telemetry is also off when `DO_NOT_TRACK`
is set to any non-empty value other than `0`, `false`, `off`, or `no`. In
Claude Code, `DISABLE_TELEMETRY` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
opt out when set to **any** non-empty value (including `0` and `false`), matching
Claude's own telemetry switches.

With telemetry opted out, the client still invokes its configured Node hooks.
The telemetry hook exits before classifying the prompt or storing state. Claude
Code's routing hook still adds its reminder. An environment variable cannot
remove hooks from the manifest.

In Copilot CLI, set `ARCADE_PLUGIN_TELEMETRY` to `0`, `false`, `off`, or `no`
in your shell before starting `copilot`. Any other value, including an unset
variable, leaves that switch inactive. `COPILOT_OFFLINE` turns telemetry off
when it is set to any non-empty value other than `0`, `false`, `off`, or `no`.
An unset or empty `COPILOT_OFFLINE`, and those four values, leave telemetry on
through this switch.

For testing an enabled build, `ARCADE_PLUGIN_TELEMETRY_HOST` sends events to a
different host.

## Where it runs

The Claude Code and Copilot CLI adapters are the only ones wired for telemetry
in `hooks/hook-hosts.mjs` (`hooks/telemetry-adapters/claude-code.mjs` and
`hooks/telemetry-adapters/copilot-cli.mjs`). Claude maps MCP tools under
`mcp__plugin_<plugin>_<mcpServer>__` (this plugin's gateway) and
`mcp__claude_ai_arcade__` (the claude.ai Arcade connection). Attempt events
(`PreToolUse`) are emitted only for those two prefixes. Copilot maps MCP tools
as `<server>-<tool>` (for example `arcade-Arcade_SelectTools` when the MCP
server name matches `mcp.json`). Copilot sends no `turn`, no `PreToolUse`
attempt events, and no built-in CLI or web tool events.

Claude ties alternative-tool observations to the hashed `turn` for the
current `prompt_id` (`requiresTurn: true`). Copilot keeps prompt scope per
`session` without a prompt ID (`requiresTurn: false`).

Local state uses `CLAUDE_PLUGIN_DATA` (Claude Code) and `COPILOT_PLUGIN_DATA`
(Copilot CLI) for `arcade-used` and `prompt-scope/` files.

Copilot's manifest is shared with VS Code. Hook commands use
`runOnlyIfScriptExists`: each command checks that its script exists at
`${PLUGIN_ROOT}` and exits quietly when the path is missing, so VS Code does
not run telemetry today. Cursor is not wired up; its hook input can include the
user's email. claude.ai, ChatGPT, Codex, and OpenCode don't run telemetry hooks
from this package.

### What CI exercises

| Adapter | Tested in this repo | Not covered here |
| --- | --- | --- |
| Claude Code | In-process hook captures, contract tests, `scripts/telemetry-report.mjs` cross-check, `claude plugin validate --strict` on **2.1.258** (runs on the committed manifest, which has no telemetry hooks; no CLI has validated a manifest with telemetry hooks enabled) | Live user sessions, IDE extensions, desktop Code tab, Cowork delivery and opt-out |
| Copilot CLI | In-process captures, fixture JSON, report cross-check, `npm run verify:copilot` on **1.0.88** (runs on the committed manifest, which has no telemetry hooks; checks only MCP servers and skills; no CLI has validated a manifest with telemetry hooks enabled) | Live sessions, Windows PowerShell hook commands, VS Code agent sessions |

None of these checks prove end-user transmission while `TELEMETRY_ENABLED` is
`false`. The in-process tests and report cross-check validate the adapters and
reporting math for an enabled build.

## What is stored on your machine

When telemetry is enabled, each client's plugin data folder contains its own
`arcade-used` flag, readable only by you. It holds `true` after an Arcade call
succeeds in that client plugin installation and supplies `arcade_used_before`.

Prompt relevance state lives in `prompt-scope/<sha256(host:session_id)>.json` in
the same folder. It contains a relevance boolean, expiry timestamp, and optional
hashed prompt ID that ties tool calls to their prompt. It contains no prompt text,
commands, tool arguments, or service content. Expired state cannot authorize
observation. The next prompt-state write removes expired or malformed entries;
at most 256 session state files are retained. Session start clears that
session's state, except after Claude Code compacts the conversation. Claude
alternative-tool observations require a matching hashed prompt ID; an absent
prompt ID cannot authorize those observations.

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
| `arcade_used_before` | whether an Arcade tool call had succeeded for this client plugin installation before this event (from the `arcade-used` file) |
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
| `Plugin tool attempted` | PreToolUse, in Claude Code, before an MCP call through this plugin's Arcade gateway or the claude.ai Arcade connection; an attempt does not show whether the tool finished | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (the claude.ai Arcade connection). `tool`: only for `arcade` and `other_arcade`: an exact gateway tool name, `app_tool` for a recognized service category, or `other`; app tool names are never sent. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. |
| `Plugin tool called` | PostToolUse, on Arcade tools, or alternative MCP tools while the current turn concerns app work | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: an exact gateway tool name, `app_tool` for a recognized service category, or `other`; app tool names are never sent. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. `auth_needed`: only for `System_ManageAuthorization`: whether its answer says a service still needs sign-in. |
| `Plugin tool failed` | PostToolUseFailure, on Arcade tools, or alternative MCP tools while the current turn concerns app work | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: an exact gateway tool name, `app_tool` for a recognized service category, or `other`; app tool names are never sent. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. `failure_kind`: picked on your machine from the error message; the message is not sent: `auth_required` \| `session_expired` \| `unreachable` \| `timeout` \| `http_error` \| `interrupted` \| `tool_error`. |
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

PostHog would see the IP address the request comes from, like any web request,
but would not store it: every event sets `$ip` to `0.0.0.0`, and location
lookup is off.

## Gateway telemetry

The Arcade MCP gateway (`https://api.arcade.dev/mcp/arcade`) remains the
canonical source for request, authentication, discovery, tool-call, and
completion telemetry. Plugin events are supplemental observations from client
hooks. They do not replace gateway records and cannot prove task success on
their own.

## Reading the numbers

Export PostHog rows with the fields `event`, `distinct_id`, `properties`, and
optionally `timestamp`, then aggregate them locally:

```bash
node scripts/telemetry-report.mjs path/to/export.jsonl
```

The script prints JSON with counts, denominators, and a `limits` list. Before
validating, it ignores export fields outside
`{ event, distinct_id, properties }` (such as `timestamp` and `uuid`) and
PostHog-added properties whose names start with `$` but are not on the contract
for that event. The contract's own `$` properties (`$ip`, `$geoip_disable`,
`$process_person_profile`) may be missing, because PostHog can drop them on
import, but when present they must match the contract, so a row with a real IP
address is invalid. Every other property must match the contract; leaked hook
fields such as `prompt` or `cwd` make a row invalid. A row with a known event
and no `telemetry_version` counts as legacy only if every property key is on
the contract for that event; a row that carries any additional property (such
as `prompt` or `cwd`) counts as invalid instead. It counts invalid rows and
legacy rows separately, and excludes both from grouped counts. Groups are split
by `host`, `plugin_version`, and `telemetry_version`. Claude Code and Copilot
CLI are never combined into one denominator. For JSONL input, a line that is
not valid JSON causes the script to exit nonzero with a message naming that
line number; for JSON array input that fails to parse, the message says the
file is not valid JSON without naming a line. Either way the script prints no
report and does not echo the file's contents.

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
| App action | `Arcade_UseTool` or `app_tool`, split by `Plugin tool called` and `Plugin tool failed` | The hook observed a tool completion or failure. Tools with an unrecognized service category are `other` and cannot be assigned to this stage. Neither outcome proves the user's task succeeded. |
| No Arcade call observed | A prompt with no Arcade tool event in the observable group | The hooks saw no call. This is not a routing miss without an independently labeled need and complete tool visibility. |

Count each unit once at each stage, and show the denominator, host, date range,
plugin version, telemetry version, and observation coverage beside every rate.
`telemetry_version: 2` identifies scoped events; a missing value identifies the
legacy contract. Keep those populations separate, even at the same plugin
version. Keep the number of
observed prompt units and sessions visible even when a chart has no app actions.
Do not extrapolate rates from a test sample or telemetry-enabled sessions to all users.
Do not mix Claude turns with Copilot session counts in one rate.

Report field glossary (`scripts/telemetry-report.mjs`). These definitions are
authoritative. The host sections below add attribution and scope only.

- `observed_relevant_turns` / `observed_relevant_sessions`: distinct Claude
  `turn` values or Copilot `session` values with a `Plugin prompt submitted`
  event, after Copilot operator-linked child sessions are excluded from the
  session denominator.
- `operator_linked_sessions_excluded`: Copilot prompt sessions left out of
  that session denominator because an operator stop named them as
  `subagent_session`. A stop whose child sent no prompt does not increase it.
- `tool_only_turns`: Claude turns with tool events but no prompt event in that
  turn (reported outside the turn denominator).
- `tool_only_sessions`: Copilot sessions (after operator child sessions are
  attributed to their parent) that are not in `observed_relevant_sessions` and
  have at least one row whose event is not `Plugin prompt submitted` (reported
  outside the session denominator). The Copilot counterpart of `tool_only_turns`.
  Child sessions are attributed one level up only, so rows from an operator
  started inside another operator are counted under the middle session.
- `attempt_observed_outcome_unknown`: Claude turns with a `Plugin tool
  attempted` on a `server` category (`arcade` or `other_arcade`) but no `Plugin
  tool called` or `Plugin tool failed` on that same category in the same turn.
  An outcome on one category never counts as the outcome for an attempt on the other.
  `other_arcade` groups every other Arcade connection together, and one outcome
  counts as the outcome for every attempt on its category in the turn, so the
  check cannot pair a result with a particular connection or call.
- `no_call_observed`: relevant turns or sessions with no Arcade MCP tool event
  (`Plugin tool attempted`, `Plugin tool called`, or `Plugin tool failed` on
  `server: arcade` or `other_arcade`).
- `parent_attribution_unknown_sessions`: Copilot sessions with a prompt event
  that are not operator-linked children and have no operator stop on that
  session to confirm parent/child linkage.
- Stage counts use the denominators above; they are not paired attempt/result
  metrics and do not imply recall, precision, or task success.

### Claude Code turns

Claude Code filters background task results from prompt events. Group tool
events with the same `turn`, including an arcade-operator's events, and report
sessions and turns separately. A short follow-up such as “yes, send it” is a
separate observed turn while scope is active, even when its keyword flag is
false.

`server: other_arcade` means the hook observed another connection's Arcade
gateway tool. Results recognize exact gateway tool names on arbitrary MCP
server aliases; attempts recognize only the two configured lowercase Arcade
prefixes. UUID or capitalized aliases can therefore have results without an
attempt event. Direct app tools on an unidentified connection may be classified
as `other`. Gateway names are a recognition heuristic, not verified server
provenance.

A built-in CLI or web event is a tool observation, not evidence of fallback.
Only call it a possible fallback after linking it to a labeled Arcade-eligible
task and establishing that it served the same request.
`arcade_used_before: false` says no Arcade call has previously succeeded for
that client plugin installation; it does not describe another client on the
same machine or prove that the gateway or a particular app was unconnected.

### Copilot CLI sessions

Copilot CLI supplies no `prompt_id` or `turn`. Report multiple-prompt sessions
separately. Session starts are not transmitted and cannot define top-level
sessions.

An Arcade operator's stop report carries `subagent_session`, equal to that
operator's own event `session`. Include that operator's tool events with the
parent. Other subagents do not send stop reports, so their prompt sessions
cannot be reliably distinguished from top-level sessions.

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

Evaluate classification and client routing on controlled, labeled cases separately
from production usage events. Include implicit app requests, contextual follow-ups,
and local coding tasks that name an app. Fixture accuracy does not establish
real-user routing quality.

The existing [Tool Recommendation Cost Eval](https://github.com/ArcadeAI/tool-recommendation-cost-eval)
provides an offline cross-client harness and published results. Record the plugin
SHA and client configuration when evaluating the plugin; Tool Recommendation
on/off results do not establish the plugin's effect on routing or cost. Plugin
telemetry and that harness are complementary; neither replaces the other.

## Before turning it on

Separate approval is required before setting `TELEMETRY_ENABLED` to `true` and
shipping telemetry hooks. Confirm, outside this repository:

- user-facing disclosure and privacy policy coverage for plugin usage events
- analytics retention and processor handling for the PostHog project
- verified ingestion per client and `telemetry_version` for the build under review
- opt-out switches verified on each supported client surface
- applicable store or distribution decisions for builds that transmit data

These are release acceptance requirements; the current code and CI do not
enforce them. A repository install can consume a branch before a GitHub release
is tagged, so a branch install can transmit data before any release is tagged.
