# Plugin telemetry

The Arcade plugin sends a small set of anonymous events to Arcade's PostHog
so we can see whether the model uses Arcade when a task needs it. No prompt
text, file paths, or tool output is ever sent.

## Turning it off

Set `ARCADE_PLUGIN_TELEMETRY=0` in your environment, or in Claude Code's
`settings.json`:

```json
{ "env": { "ARCADE_PLUGIN_TELEMETRY": "0" } }
```

`false`, `off`, and `no` also work. The plugin also sends nothing when
`DO_NOT_TRACK=1` is set.

For testing, `ARCADE_PLUGIN_TELEMETRY_HOST` sends events to a different host
instead of Arcade's PostHog.

## Where it runs

Only in Claude Code: the CLI, IDE extensions, the desktop app's Code tab,
and Cowork. These are the hosts that run plugin hooks. claude.ai chat,
Claude Desktop chat, Cursor, Codex, Copilot, VS Code, and other MCP clients
send no plugin telemetry.

## What is stored on your machine

Two files in the plugin's data folder (`~/.claude/plugins/data/<plugin id>/`):

- `install-id`: a random ID created on first run. It is not tied to you or
  your Arcade account.
- `notice-shown`: marks that the first-run notice was shown.

Nothing is sent until the notice has been shown. If the plugin can't read or
write that folder, or Claude Code doesn't provide one, it sends nothing.

## What is sent

Every event has these properties:

| Property | Value |
| --- | --- |
| `distinct_id` | the random install ID |
| `session` | `sha256(install_id + ":" + session_id)`, first 16 hex characters |
| `turn` | `sha256(install_id + ":" + prompt_id)`, first 16 hex characters (not on `Plugin session started`) |
| `host` | `claude-code` |
| `plugin_version` | from `VERSION` |
| `os` | `darwin`, `linux`, `win32`, or `other` |
| `$process_person_profile` | `false` |
| `$geoip_disable` | `true` |

Events and their extra properties:

| Event | When | Extra properties |
| --- | --- | --- |
| `Plugin session started` | SessionStart | `source`: `startup` \| `resume` \| `clear` \| `compact` \| `fork` \| `other` |
| `Plugin prompt submitted` | UserPromptSubmit, except background task results that Claude Code passes through the same hook | `looks_external`: boolean. `service_hints`: list of categories from the list below. `reminder_sent`: boolean. |
| `Plugin tool called` | PostToolUse on MCP tools | `server`: `arcade` (this plugin's gateway) \| `other_arcade` (another connection exposing Arcade's gateway tools) \| `other`. `tool`: only for `arcade` and `other_arcade`; the Arcade tool name if it is a gateway tool or a public Arcade toolkit tool, otherwise `other`. `service`: the service category, when the tool, the app tool passed to `Arcade_UseTool`, or the server name matches a service Arcade covers. Names from other servers are never sent. |
| `Plugin tool failed` | PostToolUseFailure on MCP tools | same as `Plugin tool called` |
| `Plugin skill invoked` | PreToolUse on Skill | `skill`: `try-arcade` \| `scale-arcade` \| `other` |
| `Plugin subagent started` | SubagentStart | `agent`: `arcade-operator` \| `other` |
| `Plugin subagent stopped` | SubagentStop | `agent`: `arcade-operator` \| `other`. `status`: the operator's status (`completed` \| `needs_auth` \| `needs_confirmation` \| `needs_clarification` \| `failed` \| `unknown`), only for `arcade-operator`. |
| `Plugin turn ended` | Stop | none |
| `Plugin session ended` | SessionEnd | `reason`: the value Claude Code reports, if it is one of the documented reasons, otherwise `other` |

Service categories: `email`, `calendar`, `chat`, `issues`, `docs`,
`meetings`, `crm`, `code_hosting`, `analytics`, `storage`.

`looks_external` means the prompt looks like a task for an outside app. A
keyword list in `hooks/telemetry-classify.mjs` decides it on your machine.
Only the boolean and the categories are sent.

## Never sent

- prompt text, or any text you or the model wrote
- tool inputs or tool outputs
- file paths, the working directory, or transcript paths
- names of MCP servers other than Arcade's, or their tool names
- names of subagents or skills other than Arcade's
- your email, username, hostname, repository, or Arcade account

The plugin drops any property not listed on this page before sending.

PostHog receives the IP address the request comes from, like any web request.
We don't send it as a property and turn off location lookup.

## Reading the numbers

Events from one turn share `turn`. Claude Code also runs a turn when a
background task finishes; those turns have no `Plugin prompt submitted`, so
leave out turns without one. Per turn:

- **Called when needed:** `looks_external` and at least one `Plugin tool called` with `server: arcade`.
- **Called through another Arcade connection:** the same, with
  `server: other_arcade`. The plugin's rules say to use only its own server,
  but Claude Code can hide the plugin's server when a claude.ai Arcade
  connector points at the same gateway.
- **Missed:** `looks_external` and no Arcade tool call. Broken down by: a
  different server was used for the same kind of service, auth was needed,
  an Arcade call failed, or nothing was called.
- **Called unexpectedly:** not `looks_external`, but Arcade was called. This
  also shows where the keyword list misses.
- **Not needed, not called:** everything else.

An app tool called directly on another Arcade gateway (for example
`Granola_ListMeetings` on a second gateway) looks the same as that app's own
MCP server, so it counts as `other`.

These numbers cover Claude Code only. The model's behavior on claude.ai,
ChatGPT, and other hosts has to be measured offline.

## Classifier accuracy

Measured against the labeled prompts in `test/fixtures/routing-prompts.json`:

- Missed external asks: 6 of 55 (10.9%). Mostly asks with no app name,
  like "move my 3pm to thursday".
- False alarms on coding prompts: 4 of 56 (7.1%). Mostly code written *for*
  a service, like "fix the slack webhook integration test".

Arcade users often build integrations, so the real false-alarm rate is
probably higher than the fixtures show.
