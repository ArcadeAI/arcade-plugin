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

With telemetry off, Claude Code still starts the plugin's short Node hook on
each prompt, on each MCP tool call, on each web fetch or search, and on each
`gh`, `glab`, `curl`, `wget`, `http`, or `osascript` command (about 60 ms
each). It exits without sending anything. Claude Code reads the list of hooks
from the plugin's files, so an environment variable can't remove them.

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

### Claude Code

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
- **Maybe not set up:** a missed turn with `arcade_used_before: false`. No
  Arcade tool call has succeeded on that machine yet, so the gateway may not be
  connected. Count these apart from misses where `arcade_used_before` is
  `true`. A `true` value means the gateway has answered before, not that every
  app is signed in.
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
  code, checked with a test MCP server but not against the hosted gateway. It
  also matches Claude Code's own "requires re-authorization" and "needs to be
  connected in claude.ai" errors.
- `session_expired` matches Claude Code's "session expired" error, which it
  gives for an HTTP 404 from the server.
- Bad input, rate limits, upstream API errors, and an app's revoked sign-in
  all count as `tool_error`, because each tool writes its own message.
- `failure_kind` is sent for every server, so Arcade's failures can be
  compared with other servers'.

### Copilot CLI

Copilot has no `prompt_id`, so there is no `turn`. Group tool and subagent
events into turns by ordering all events from one `Plugin prompt submitted` up
to the next one by timestamp.

Subagent events use the subagent's own `session` value. The parent's
`Plugin subagent stopped` carries `subagent_session`, which equals that
subagent's `session`.

- Leave out `Plugin prompt submitted` events whose `session` matches any
  event's `subagent_session`. The model wrote those prompts.
- Count a subagent session's tool events toward the parent turn that contains
  the matching `Plugin subagent stopped`.

Copilot names MCP tools `<server>-<tool>` with no plugin prefix, so any MCP
server the user named `arcade` counts as `server: arcade`, not just this
plugin's.
- Leave out sessions with a prompt but no `Plugin session started` and no
  matching `subagent_session`. These are subagents that never stopped.

Copilot CLI sends no built-in tool events, so a missed turn can't be split
into "used a CLI or the web instead" and "nothing was called".

`failure_kind` uses the same rules on Copilot CLI's error text, which starts
with `MCP server '<name>':`. Copilot doesn't say when a call was interrupted,
so `interrupted` doesn't appear. A transport that closed mid-call counts as
`unreachable`, the same as in Claude Code.

## Classifier accuracy

Measured against the labeled prompts in `test/fixtures/routing-prompts.json`:

- Missed Arcade tasks: 6 of 55 (10.9%). Mostly asks with no app name, like
  "move my 3pm to thursday".
- False alarms on coding prompts: 4 of 56 (7.1%). Mostly code written *for*
  a service, like "fix the slack webhook integration test".

Arcade users often build integrations, so the real false-alarm rate is
probably higher than the fixtures show.
