# Plugin telemetry

The Arcade plugin sends a small set of usage events to Arcade's PostHog so we
can see whether the model uses Arcade when a task needs it. Events carry a
hash of Claude Code's random session ID, which changes every session, and no
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
each prompt and each MCP tool call (about 60 ms); it exits without sending
anything. Claude Code reads the list of hooks from the plugin's files, so an
environment variable can't remove them.

For testing, `ARCADE_PLUGIN_TELEMETRY_HOST` sends events to a different host.

## Where it runs

Only in Claude Code: the CLI, IDE extensions, the desktop app's Code tab, and
Cowork. Other clients send no plugin telemetry. claude.ai and ChatGPT chat
don't run plugin hooks at all; Codex drops hooks for Agent Plugins packages;
Cursor and Copilot aren't wired up yet.

## What is stored on your machine

One file in the plugin's data folder (`~/.claude/plugins/data/<plugin id>/`):
`arcade-used`, readable only by you. It holds the word `true` once an Arcade
tool call has succeeded on this machine, and every event sends that as
`arcade_used_before`. Nothing else is stored. Earlier versions kept an
`install-id` file there; the plugin deletes it.

If Claude Code doesn't provide that folder, the plugin sends nothing.

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
| `Plugin tool called` | PostToolUse, on MCP tools | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. |
| `Plugin tool failed` | PostToolUseFailure, on MCP tools | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`: the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches one. |
| `Plugin subagent stopped` | SubagentStop | `agent`: `arcade-operator` \| `other`. `status`: only for `arcade-operator`: the status line of its final report, `completed` \| `needs_auth` \| `needs_confirmation` \| `needs_clarification` \| `failed` \| `unknown`. `subagent_session`: `sha256(agent_id)`, first 16 hex characters. In Copilot CLI the subagent's own events carry this as `session`. |

Service categories: `email`, `calendar`, `chat`, `issues`, `docs`, `meetings`, `crm`, `code_hosting`, `analytics`, `storage`.
<!-- END generated telemetry tables -->

`could_use_arcade` is a local keyword guess (in
`hooks/telemetry-classify.mjs`) at whether the prompt is a task Arcade could
do: email, calendar, chat, and the other categories above.

## Never sent

- prompt text, or any text you or the model wrote
- tool inputs or tool outputs
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
  `Plugin tool called` with `server: arcade`.
- **Called through another Arcade connection:** the same, with
  `server: other_arcade`. Claude Code can hide the plugin's server when a
  claude.ai Arcade connector points at the same gateway.
- **Missed:** `could_use_arcade` and no Arcade tool call. Broken down by: a
  different server was used for the same kind of service, auth was needed,
  an Arcade call failed, or nothing was called.
- **Maybe not set up:** a missed turn with `arcade_used_before: false`. Arcade
  may not be connected or signed in on that machine yet, so count these apart
  from misses where `arcade_used_before` is `true`.
- **Called unexpectedly:** not `could_use_arcade`, but Arcade was called.
  This also shows where the keyword list misses.
- **Not needed, not called:** everything else.

An app tool called directly on another Arcade gateway (for example
`Granola_ListMeetings` on a second gateway) looks the same as that app's own
MCP server, so it counts as `other`.

## Classifier accuracy

Measured against the labeled prompts in `test/fixtures/routing-prompts.json`:

- Missed Arcade tasks: 6 of 55 (10.9%). Mostly asks with no app name, like
  "move my 3pm to thursday".
- False alarms on coding prompts: 4 of 56 (7.1%). Mostly code written *for*
  a service, like "fix the slack webhook integration test".

Arcade users often build integrations, so the real false-alarm rate is
probably higher than the fixtures show.
