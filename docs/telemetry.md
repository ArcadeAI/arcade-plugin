# Plugin telemetry

The Arcade plugin sends a small set of usage events to Arcade's PostHog so we
can see whether the model uses Arcade when a task needs it. Events carry a
hash of the client's random session ID, which changes every session, and no
ID that lasts across sessions. They never include your name, email, or Arcade
account. No prompt text, file paths, or tool output is ever sent.

Install and active-user counts don't come from these events. Arcade's gateway
already sees each signed-in user and the name of the client they connect from,
so those counts come from there.

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

With telemetry off, Claude Code still starts the plugin's short Node hook at
session start, on each prompt, after each MCP tool call, after each web fetch
or search, after each `gh`, `glab`, `curl`, `wget`, `http`, or `osascript`
command, and when a subagent stops (about 60 ms each time). It exits without
sending anything. Claude Code reads the list of hooks from the plugin's files,
so an environment variable can't remove them.

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

One file per client, in the client's plugin data folder, named `arcade-used`,
readable only by you. It holds the word `true` once an Arcade tool call has
succeeded, and every event sends that as `arcade_used_before`. Nothing else is
stored. If an `install-id` file is there, the plugin deletes it, even with
telemetry off.

- Claude Code: `~/.claude/plugins/data/<plugin id>/arcade-used`
- Copilot CLI: `~/.copilot/plugin-data/<…>/arcade-used`

If the client doesn't provide a data folder path, the plugin sends nothing.

## What is sent

<!-- BEGIN generated from hooks/telemetry-contract.mjs by `npm run generate`; edit that file, not this block -->
Every event has these properties:

| Property | Value |
| --- | --- |
| `distinct_id` | the same value as `session` |
| `session` | `sha256(session_id)`, first 16 hex characters, where `session_id` is the client's random ID for the session |
| `turn` | `sha256(session_id + ":" + prompt_id)`, first 16 hex characters; Claude Code only, because Copilot CLI has no prompt ID (not on `Plugin session started`) |
| `arcade_used_before` | whether an Arcade tool call had succeeded on this machine before this event (from the `arcade-used` file) |
| `host` | `claude-code` \| `copilot-cli` |
| `plugin_version` | from `VERSION` |
| `os` | `darwin` \| `linux` \| `win32` \| `other` |
| `$process_person_profile` | `false` |
| `$geoip_disable` | `true` |
| `$ip` | `0.0.0.0`, so PostHog stores this instead of your real IP address |

Events and their extra properties:

| Event | When | Extra properties |
| --- | --- | --- |
| `Plugin session started` | SessionStart | `source`: `startup` \| `resume` \| `clear` \| `compact` \| `fork` \| `new` \| `other`. |
| `Plugin prompt submitted` | UserPromptSubmit, except background task results that Claude Code passes through the same hook. In Copilot CLI a subagent's own prompt also sends it | `could_use_arcade`: boolean, a local keyword guess (see below). `service_hints`: service categories the prompt mentions. `reminder_sent`: boolean, whether the routing reminder was added (always `false` in Copilot CLI). |
| `Plugin tool called` | PostToolUse, on MCP tools | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. `auth_needed`: only for `System_ManageAuthorization`: whether its answer says a service still needs sign-in. |
| `Plugin tool failed` | PostToolUseFailure, on MCP tools | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. `failure_kind`: picked on your machine from the error message; the message is not sent: `auth_required` \| `session_expired` \| `unreachable` \| `timeout` \| `http_error` \| `interrupted` \| `tool_error`. |
| `Plugin built-in tool called` | PostToolUse, Claude Code only, on `WebFetch` and `WebSearch`, and on `Bash` commands that run `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript` | `tool`: `Bash` \| `WebFetch` \| `WebSearch`. `cli`: only for `Bash`: the program the command runs, `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript`. `service`: the program's service category, only for `gh` \| `glab`: `code_hosting`. |
| `Plugin built-in tool failed` | PostToolUseFailure, Claude Code only, on `WebFetch` and `WebSearch`, and on `Bash` commands that run `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript` | `tool`: `Bash` \| `WebFetch` \| `WebSearch`. `cli`: only for `Bash`: the program the command runs, `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript`. `service`: the program's service category, only for `gh` \| `glab`: `code_hosting`. |
| `Plugin subagent stopped` | SubagentStop | `agent`: `arcade-operator` \| `other`. `status`: only for `arcade-operator`: the status line of its final report, `completed` \| `needs_auth` \| `needs_confirmation` \| `needs_clarification` \| `failed` \| `unknown`. `subagent_session`: `sha256(agent_id)`, first 16 hex characters. In Copilot CLI the subagent's own events carry this as `session`. |

Service categories: `email`, `calendar`, `chat`, `issues`, `docs`, `meetings`, `crm`, `code_hosting`, `analytics`, `storage`.
<!-- END generated telemetry tables -->

`could_use_arcade` is a local keyword guess (in
`hooks/telemetry-classify.mjs`) at whether the prompt is a task Arcade could
do: email, calendar, chat, and the other categories above.

`failure_kind`, `auth_needed`, and `cli` are values from fixed lists, picked
on your machine. The error text, the tool output, and the command they are
picked from are never sent. A Bash command sends an event only when one of its
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
review, not a confirmed opportunity; an unflagged prompt is not confirmed to
need no app. Use labeled task evaluations to score routing, and compare the
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
plugin version, and observation coverage beside every rate. Keep the number of
prompt units and root sessions visible even when a chart has no app actions.
Do not extrapolate rates from a test sample or telemetry-enabled sessions to all users.
Do not mix Claude turns with Copilot session counts in one rate.

### Claude Code turns

The denominator is distinct `turn` values with a `Plugin prompt submitted`
event. Exclude tool-only turns: Claude Code filters background task results
from prompt events. Group tool events with the same `turn`, including an
arcade-operator's events, and report sessions and turns separately. A short
follow-up such as “yes, send it” is a separate turn; the classifier may flag
only the earlier prompt, so turn counts do not describe whole tasks.

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

Copilot CLI supplies no `prompt_id` or `turn`. Use a **root-session proxy**:
count each session once when it has a `Plugin session started` event, at least
one `Plugin prompt submitted` event, and no parent link. Report how many root
sessions contain multiple prompts. This proxy is not a count of user tasks or
turns.
Reconstruct per-prompt intervals only when event order and the subagent link
are sufficient; detached event delivery can change arrival order. The hashes
do not link a resumed task across sessions.

The parent's `Plugin subagent stopped` carries `subagent_session`, equal to
the subagent's `session`. Exclude linked subagent prompts from the root-session
denominator and include their tool events with the parent. Report sessions
with a prompt but neither `Plugin session started` nor a parent link as
unclassified coverage, rather than dropping them without a count. A root
session can also lack a tool event because the hook missed it.

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

## Classifier accuracy

Measured against the labeled prompts in `test/fixtures/routing-prompts.json`:

- Missed Arcade tasks: 6 of 55 (10.9%). Mostly asks with no app name, like
  "move my 3pm to thursday".
- False alarms on coding prompts: 4 of 56 (7.1%). Mostly code written *for*
  a service, like "fix the slack webhook integration test".

Arcade users often build integrations, so the real false-alarm rate is
probably higher than the fixtures show.
