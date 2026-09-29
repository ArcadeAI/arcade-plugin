# Staging plugin telemetry dashboard

[Open the dashboard](https://us.posthog.com/project/129768/dashboard/2150320).

The dashboard checks whether plugin telemetry reaches PostHog. It reads Staging project 129768, plugin version `0.2.0`, over a rolling seven days. Deliberate Claude Code and Copilot CLI runs seeded the current sample. These counts are not production usage or task-success rates, and there is no installed-user denominator. The SQL measures are noncanonical because this PostHog connection lacks `data_catalog:read`.

## Definitions

- `could_use_arcade` is a local keyword flag on a prompt. It does not establish that Arcade was needed.
- `Plugin tool attempted` is a Claude Code `PreToolUse` observation. It records that an Arcade tool was selected before execution. It is not a completion, app action, or task result. Older runs have no attempt event and are not backfilled.
- `Plugin tool called` means the client reported tool completion through `PostToolUse`. It does not independently verify an app action or the user's task.
- `Arcade_ListApps` and `Arcade_SelectTools` are gateway discovery and selection. `Arcade_UseTool` and other Arcade tools outside those two and `System_ManageAuthorization` are app tools. Failed app calls come from `Plugin tool failed` and retain their reported `failure_kind`.
- Claude observations use a prompt `turn`. Copilot observations use a root `session` with `Plugin session started`. A Copilot child session contributes calls only when `Plugin subagent stopped.subagent_session` links it to the root. Root sessions with multiple parent prompts are counted as attribution unknown. Sessions with neither a start nor a child link appear as unlinked in the coverage table.

## Saved insights

| Insight | Short ID | Unit |
| --- | --- | --- |
| Observed client coverage | `bF4XPCzP` | Client totals and attribution gaps |
| Claude prompt observations | `nqhj1dC9` | Prompt turns |
| Claude operator reported status | `HuSr1EKI` | Stops |
| Claude Arcade tool attempts | `uuCJnm8A` | PreToolUse attempts by connection and tool |
| Claude gateway and app tool results | `ijmf2caj` | Tool events by name and result |
| Claude built-in tools observed | `iQ4gvyoh` | Turns with each built-in tool |
| Copilot root-session observations | `DXQPLNrZ` | Root sessions |
| Copilot parent prompt keyword flags | `s2BffTqn` | Parent prompts |
| Copilot gateway and app tool results | `Itp6kRP7` | Tool events by name and result |
| Copilot operator reported status | `oETEUFSp` | Stops |

Each insight's saved HogQL is the executable definition. Every event scan filters `timestamp >= now() - INTERVAL 7 DAY` and `plugin_version = '0.2.0'`. The dashboard also displays a seven-day filter.

## Verification on 2026-09-29

**Measured:** A forced refresh ran all ten insights without warnings. Raw event rows and the coverage insight agreed:

| Client | Parent prompts | Chart units | Attempts | Gateway completions | App tool completions | App tool failures | Linked children | Multi-prompt roots | Unlinked sessions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Claude Code | 9 | 9 turns | 2 | 2 | 2 | 2 | 0 | 0 | 0 |
| Copilot CLI | 3 | 3 root sessions | 0 | 3 | 2 | 1 | 2 | 0 | 0 |

**Measured:** Both attempt events came from `other_arcade` calling `Arcade_SelectTools`; neither had a plugin completion event. They are two “attempt observed, completion unknown” Claude turns. The earlier keyword-flagged Claude turn without an observed Arcade result remains separate.

**Measured:** An ephemeral HogQL fixture returned one multi-prompt root as attribution unknown, one single-prompt root with a linked child app completion, and one root with no linked call when its child had no stop event. A separate fixture query counted that no-stop child as one unlinked session. The fixture inserted no PostHog events.

## Limits

**Measured:** One earlier Claude test invoked Arcade through a separate claude.ai connection but produced no plugin completion event or attempt telemetry. Its keyword-flagged turn appears as “no Arcade result observed.” That label cannot be read as a routing miss.

**Inferred:** Copilot cannot support a per-prompt outcome when multiple parent prompts share one session and tool events have no turn ID. The chart counts those sessions as attribution unknown. A missing subagent stop prevents child-to-parent attribution; the coverage table counts the unlinked session.

**Inferred:** A rolling-window boundary can exclude a Copilot `SessionStart` or `SubagentStop` while retaining later events. The unlinked count can therefore include boundary artifacts.
