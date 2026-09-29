# Staging plugin telemetry dashboard

[Open the dashboard](https://us.posthog.com/project/129768/dashboard/2150320).

The dashboard checks whether plugin telemetry reaches PostHog. It reads Staging project 129768, plugin version `0.2.0`, over a rolling seven days. The current events came from deliberate Claude Code and Copilot CLI tests. These counts are not production usage or task-success rates, and there is no installed-user denominator. The SQL measures are noncanonical because this PostHog connection lacks `data_catalog:read`.

## Contract versions and chart units

Split every insight by `telemetry_version`: missing means legacy version 1;
`2` means scoped observation. Never combine their denominators, even when
`plugin_version` is the same. Legacy events include unrelated prompts and session
starts; version 2 omits both. Version 1 retains recorded app tool names; version 2
uses `app_tool` and service categories. Keep deliberate QA separate from production usage.

The saved counts name their client, unit, date range, plugin version, telemetry
version, and coverage limits. No rates are shown. Any future rate must show its
numerator and denominator; tool-event counts are not task or adoption rates.

| Version 2 chart | Unit counted | Uncertainty to display |
| --- | --- | --- |
| Claude prompt observations | Distinct `turn` with scoped `Plugin prompt submitted` | Relevant observed turns only; confirmations can have a false keyword flag; no task count |
| Claude Arcade attempts | Observed attempt events by connection and tool category | Attempt alone has no observed outcome; direct tool-only turns reported separately |
| Claude gateway and app results | Tool events by gateway name or fixed category and completion/failure | Tool completion is not task success; tools with an unrecognized service category are `other` |
| Claude alternative-tool observations | Distinct observed relevant turns by other MCP service category, CLI, or web tool | In-scope tool use is not proof of fallback; categories can overlap; failures are excluded |
| Claude operator reports | Observed Arcade operator stops by reported status | Model report is not the parent task's verified outcome |
| Copilot session observations | Distinct scoped prompt `session`, excluding known operator child links | Observed relevant sessions, not all sessions or proven roots; generic subagent parentage is unknown |
| Copilot prompt keyword flags | Scoped prompt events, grouped by keyword flag | Event count, not distinct prompts or tasks; inherited confirmations can be false |
| Copilot gateway and app results | Tool events by gateway name or fixed category and completion/failure | Multiple prompts prevent per-prompt outcomes; absent child links prevent reliable attribution |
| Copilot operator reports | Observed Arcade operator stops by reported status | Missing stops and window boundaries can remove links; reported success is not task success |
| Coverage | Prompt units, direct tool-only units, linked children, multi-prompt sessions, unknown parentage | No installed-user denominator; unknown parentage cannot be read as a root count |

Version 2 session queries derive candidates from scoped prompt events, not
`Plugin session started`. Retain `Plugin subagent stopped.subagent_session` links
only for `agent = 'arcade-operator'`. Exclude known linked child prompts from the
candidate denominator, and label remaining candidates as observed sessions with
unknown parentage. The session-observation query groups known child results under
its parent. The event-results chart counts events without parent grouping.

Coverage maps known operator child tool events to their parent before counting
direct tool-only units. A child-only result remains one parent unit when that
parent has no observed prompt. A missing link is a coverage limitation, not a
routing miss.

`Plugin tool attempted` records selection before execution. `Plugin tool called`
records a client completion; `Plugin tool failed` records a reported failure.
An attempt lacking either result is **attempt observed, outcome unknown**. An
observed prompt lacking an Arcade event is **no call observed**, not **missed**.
Discovery (`Arcade_ListApps`, `Arcade_SelectTools`) and authorization
(`System_ManageAuthorization`) are separate from app tools (`Arcade_UseTool` and
`app_tool` categories). None of those stages establishes task success.

Each insight's saved HogQL is its executable definition. Use a rolling seven-day
filter in the query and dashboard. Record query refresh results after changing
saved insights; the historical measurement below does not validate version 2.

## Saved insight identities

These identifiers locate the staging charts. Their names, descriptions, and
queries must state which contract version they count.

| Insight | Short ID | Unit |
| --- | --- | --- |
| Observed client coverage | `bF4XPCzP` | Client totals and attribution gaps |
| Claude prompt observations | `nqhj1dC9` | Prompt turns |
| Claude operator reported status | `HuSr1EKI` | Stops |
| Claude Arcade tool attempts | `uuCJnm8A` | PreToolUse attempts by connection and tool |
| Claude gateway and app tool results | `ijmf2caj` | Tool events by version-specific name or category and result |
| Claude alternative-tool completions | `iQ4gvyoh` | Turns by other MCP service category, CLI, or web tool |
| Copilot observed sessions | `DXQPLNrZ` | Version 1 started roots; version 2 scoped sessions with unknown parentage |
| Copilot observed prompt flags | `s2BffTqn` | Observed prompt events |
| Copilot gateway and app tool results | `Itp6kRP7` | Tool events by version-specific name or category and result |
| Copilot operator reported status | `oETEUFSp` | Stops |

Each insight's saved HogQL is the executable definition. Every event scan filters `timestamp >= now() - INTERVAL 7 DAY` and `plugin_version = '0.2.0'`. The dashboard also displays a seven-day filter.

## Legacy QA verification on 2026-09-29 (contract version 1)

**Measured:** A forced refresh ran all ten insights without warnings. Raw event rows and the coverage insight agreed:

| Client | Parent prompts | Chart units | Attempts | Gateway completions | App tool completions | App tool failures | Linked children | Multi-prompt roots | Unlinked sessions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Claude Code | 9 | 9 turns | 2 | 2 | 2 | 2 | 0 | 0 | 0 |
| Copilot CLI | 3 | 3 root sessions | 0 | 3 | 2 | 1 | 2 | 0 | 0 |

**Measured:** Both attempt events came from `other_arcade` calling `Arcade_SelectTools`; neither had a plugin completion event. They are two “attempt observed, completion unknown” Claude turns. The earlier keyword-flagged Claude turn without an observed Arcade result remains separate.

**Measured:** An ephemeral HogQL fixture returned one multi-prompt root as attribution unknown, one single-prompt root with a linked child app completion, and one root with no linked call when its child had no stop event. A separate fixture query counted that no-stop child as one unlinked session. The fixture inserted no PostHog events.

## Version 2 query verification on 2026-09-29

**Measured:** Read-only HogQL fixtures verified these results without inserting
PostHog events:

- Multiple observed prompts produce attribution unknown.
- A linked child-only result remains a direct tool-only parent unit.
- Remaining scoped sessions are counted with unknown parentage.

**Measured:** Staging had no ingested version 2 events at verification. A
`telemetry_version` taxonomy warning is expected until rollout; successful
fixture queries do not establish version 2 event ingestion.

## Limits

**Measured:** One earlier Claude test invoked Arcade through a separate claude.ai connection but produced no plugin completion event or attempt telemetry. Its keyword-flagged turn appears as “no Arcade result observed.” That label cannot be read as a routing miss.

**Inferred:** Copilot cannot support a per-prompt outcome when multiple parent prompts share one session and tool events have no turn ID. The chart counts those sessions as attribution unknown. A missing subagent stop prevents child-to-parent attribution; the coverage table counts the unlinked session.

**Inferred:** A rolling-window boundary can exclude a Copilot `SessionStart` or `SubagentStop` while retaining later events. The unlinked count can therefore include boundary artifacts.
