# Plugin telemetry

The Arcade plugin sends a small set of usage events to Arcade's PostHog so we
can see whether the model uses Arcade when a task needs it. Events carry a
random install ID, not your name, email, or Arcade account. No prompt text,
commands, file paths, or tool output is ever sent.

## Turning it off

Set `ARCADE_PLUGIN_TELEMETRY=0` in your environment, or in Claude Code's
`settings.json`:

```json
{ "env": { "ARCADE_PLUGIN_TELEMETRY": "0" } }
```

`false`, `off`, and `no` also work. It is also off when any of these is set:
`DO_NOT_TRACK`, or Claude Code's own `DISABLE_TELEMETRY` or
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`.

With telemetry off, Claude Code still starts the plugin's short Node hook on
each prompt, on each MCP tool call, on each web fetch or search, and on each
`gh`, `glab`, `curl`, `wget`, `http`, or `osascript` command (about 60 ms
each). It exits without sending anything. Claude Code reads the list of hooks
from the plugin's files, so an environment variable can't remove them.

For testing, `ARCADE_PLUGIN_TELEMETRY_HOST` sends events to a different host.

## Where it runs

Only in Claude Code: the CLI, IDE extensions, the desktop app's Code tab, and
Cowork. Other clients send no plugin telemetry. claude.ai and ChatGPT chat
don't run plugin hooks at all; Codex drops hooks for Agent Plugins packages;
Cursor and Copilot aren't wired up yet.

## What is stored on your machine

One file in the plugin's data folder (`~/.claude/plugins/data/<plugin id>/`):
`install-id`, a random ID created on first run and readable only by you. The
plugin sends nothing that links it to your name, email, or Arcade account.

If the plugin can't write that folder, or Claude Code doesn't provide one, it
sends nothing.

## What is sent

<!-- BEGIN generated from hooks/telemetry-contract.mjs by `npm run generate`; edit that file, not this block -->
Every event has these properties:

| Property | Value |
| --- | --- |
| `distinct_id` | the random install ID |
| `session` | `sha256(install_id + ":" + session_id)`, first 16 hex characters |
| `turn` | `sha256(install_id + ":" + prompt_id)`, first 16 hex characters (not on `Plugin session started`) |
| `host` | `claude-code` |
| `plugin_version` | from `VERSION` |
| `os` | `darwin` \| `linux` \| `win32` \| `other` |
| `$process_person_profile` | `false` |
| `$geoip_disable` | `true` |
| `$ip` | `0.0.0.0`, so PostHog stores this instead of your real IP address |

Events and their extra properties:

| Event | When | Extra properties |
| --- | --- | --- |
| `Plugin session started` | SessionStart | `source`: `startup` \| `resume` \| `clear` \| `compact` \| `fork` \| `other`. |
| `Plugin prompt submitted` | UserPromptSubmit, except background task results that Claude Code passes through the same hook | `could_use_arcade`: boolean, a local keyword guess (see below). `service_hints`: service categories the prompt mentions. `reminder_sent`: boolean, whether the routing reminder was added. |
| `Plugin tool called` | PostToolUse, on MCP tools | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. `auth_needed`: only for `System_ManageAuthorization`: whether its answer says a service still needs sign-in. |
| `Plugin tool failed` | PostToolUseFailure, on MCP tools | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. `failure_kind`: picked on your machine from the error message; the message is not sent: `auth_required` \| `session_expired` \| `unreachable` \| `timeout` \| `http_error` \| `interrupted` \| `tool_error`. |
| `Plugin built-in tool called` | PostToolUse, on `WebFetch` and `WebSearch`, and on `Bash` commands that run `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript` | `tool`: `Bash` \| `WebFetch` \| `WebSearch`. `cli`: only for `Bash`: the program the command runs, `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript`. `service`: the program's service category, only for `gh` \| `glab`: `code_hosting`. |
| `Plugin built-in tool failed` | PostToolUseFailure, on `WebFetch` and `WebSearch`, and on `Bash` commands that run `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript` | `tool`: `Bash` \| `WebFetch` \| `WebSearch`. `cli`: only for `Bash`: the program the command runs, `gh` \| `glab` \| `curl` \| `wget` \| `http` \| `osascript`. `service`: the program's service category, only for `gh` \| `glab`: `code_hosting`. |
| `Plugin subagent stopped` | SubagentStop | `agent`: `arcade-operator` \| `other`. `status`: only for `arcade-operator`: the status line of its final report, `completed` \| `needs_auth` \| `needs_confirmation` \| `needs_clarification` \| `failed` \| `unknown`. |

Service categories: `email`, `calendar`, `chat`, `issues`, `docs`, `meetings`, `crm`, `code_hosting`, `analytics`, `storage`.
<!-- END generated telemetry tables -->

`could_use_arcade` is a local keyword guess (in
`hooks/telemetry-classify.mjs`) at whether the prompt is a task Arcade could
do: email, calendar, chat, and the other categories above.

`failure_kind`, `auth_needed`, and `cli` are values from fixed lists, picked
on your machine. The error text, the tool output, and the command they are
picked from are never sent. A Bash command sends an event only when one of its
commands starts with a listed program; commands that call a program by its
full path, such as `/opt/homebrew/bin/gh`, are not counted.

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

Group events into turns by `turn`. Background task results don't send
`Plugin prompt submitted`, so leave out turns that have tool events but no
prompt event. Per turn:

- **Called when needed:** `could_use_arcade` and at least one
  `Plugin tool called` with `server: arcade`, not counting
  `System_ManageAuthorization`. Arcade's gateway tells the model to call it
  before each job, so a call to it doesn't mean the task used Arcade.
- **Called through another Arcade connection:** the same, with
  `server: other_arcade`. Claude Code can hide the plugin's server when a
  claude.ai Arcade connector points at the same gateway.
- **Missed:** `could_use_arcade` and no Arcade tool call. Broken down by:
  - an Arcade call failed, by `failure_kind`
  - sign-in was needed: `auth_needed: true`, or the arcade-operator reported
    `needs_auth`. A `System_ManageAuthorization` call alone doesn't show this.
  - the model used a CLI or the web instead: a `Plugin built-in tool called`
    or `Plugin built-in tool failed` event, by `cli` or `tool`
  - a different server was used for the same kind of service
  - nothing was called
- **Called unexpectedly:** not `could_use_arcade`, but Arcade was called.
  This also shows where the keyword list misses.
- **Not needed, not called:** everything else.

A reply like "yes, send it" is its own turn, usually without keywords, so it
can count as "called unexpectedly" while the turn that asked counts as
"missed". To score them together, add an unflagged turn to the most recent
flagged turn in the same session when that turn is one of the two before it
and started at most 10 minutes earlier, then score each group once. Unrelated
turns in that window join the group too, so report per-turn and grouped counts
side by side.

An app tool called directly on another Arcade gateway (for example
`Granola_ListMeetings` on a second gateway) looks the same as that app's own
MCP server, so it counts as `other`.

`failure_kind` limits:

- `auth_required` matches the sign-in text in the Arcade gateway's source
  code and was checked with a test MCP server, not against the hosted gateway.
- `session_expired` covers HTTP 404, or a closed HTTP connection.
- Bad input, rate limits, upstream API errors, and an app's revoked sign-in
  all count as `tool_error`, because each tool writes its own message.
- `failure_kind` is sent for every server, so Arcade's failures can be
  compared with other servers'.

## Classifier accuracy

Measured against the labeled prompts in `test/fixtures/routing-prompts.json`:

- Missed Arcade tasks: 6 of 55 (10.9%). Mostly asks with no app name, like
  "move my 3pm to thursday".
- False alarms on coding prompts: 4 of 56 (7.1%). Mostly code written *for*
  a service, like "fix the slack webhook integration test".

Arcade users often build integrations, so the real false-alarm rate is
probably higher than the fixtures show.
