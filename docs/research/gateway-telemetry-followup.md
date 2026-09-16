# Gateway telemetry follow-up

Implementation checklist for the monorepo half of
[plugin telemetry correlation](telemetry-design.md).

## Required outcome

1. Authenticated Usage events from a plugin-marked MCP request include
   `plugin_source`. Preserve `plugin_version` when present, but do not require it.
2. A successful `Arcade_SelectTools` Usage event includes the server-generated
   `query_id` returned in that call's output.

Together these properties allow the plugin's `Plugin discovery linked` event to
join to a principal-attributed gateway event on `query_id`.

## Ingress attribution

Map the static request headers into Usage context properties:

| Header | Usage property | Requirement |
| --- | --- | --- |
| `Arcade-Plugin` | `plugin_source` | Required for plugin attribution |
| `Arcade-Plugin-Version` | `plugin_version` | Optional debugging metadata |

Trim values and omit empty properties. Add them through
`usage.WithContextProperties` in `GatewayLookupMiddleware` so stateful and
stateless captures inherit the same values. Keep these properties
request-scoped and leave Engine analytics `source` unchanged.

The headers are untrusted analytics metadata. Never use them for authorization.

## SelectTools correlation

The Engine already returns `SelectToolsOutput.QueryID` and records it on
`tr_select_tools`. Add the same nonempty value to the principal-attributed
`MCP tool recommendation queried` Usage event after successful SelectTools
dispatch.

Use one shared helper for both paths:

- Stateful: `mcp/service.go`, before the successful Usage capture.
- Stateless: `mcpstateless/tools/meta.go`, before its successful Usage capture.

Read the ID from the server response output. Do not copy it from client input.
SearchTools shares the Usage event name but does not return this ID, so omit the
property there. A missing ID is valid and must not suppress the Usage event.

## Verification

- Request headers appear as Usage context properties and empty headers are
  omitted.
- Stateful and stateless SelectTools success events carry the same `query_id`
  returned in `SelectToolsOutput`.
- SearchTools, failed SelectTools, and successful SelectTools without an ID do
  not invent one.
- Existing `principalId` identity and gateway context properties remain intact.

## Non-goals

- Using `Mcp-Session-Id` as a conversation ID.
- Changing Usage `distinct_id` or Engine analytics identity.
- Aliasing hook session hashes to gateway principals.
- Making `plugin_version` necessary for joins or dashboards.
- Adding a proxy, correlation service, or new PostHog sink.
