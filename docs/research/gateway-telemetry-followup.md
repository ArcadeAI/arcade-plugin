# Gateway telemetry follow-up (monorepo step 2)

Implementation spec for the monorepo half of [telemetry-design.md](../../../../workspace/arcade/arcade-plugin/docs/research/telemetry-design.md) delivery step 2: **gateway attribution**. Plugin step 1 (static MCP headers in manifests) is a separate PR in this repo.

**Scope:** Engine Usage captures on MCP requests. No hook changes here. No PostHog sink changes unless a new property needs explicit typing (it should not).

## Goal

Every authenticated MCP Usage event from a plugin-marked connection carries `plugin_source` and `plugin_version`. Successful `Arcade_SelectTools` dispatches also carry `query_id` on the principal-attributed `MCP tool recommendation queried` event, matching `tr_select_tools`.

## Current state (monorepo)

| Piece | Behavior today |
| --- | --- |
| PostHog `distinct_id` (Usage sink) | `principalId`, else `"system"` — `apps/usage/internal/sink/processor/posthog.go` |
| Gateway context props | `gateway_*` via `gateway_lookup_middleware` → `usage.WithContextProperties` |
| Protocol version | `mcpstateless/dispatch.go` stamps `protocol_version` from `Mcp-Protocol-Version` |
| Stateful MCP usage | `mcpUsageProperties(session, td)` + explicit `usage.Capture` in `mcp/service.go` |
| Stateless MCP usage | `captureUsageEvent` in `mcpstateless/tools/call.go` / `meta.go` |
| SelectTools analytics | `tr_select_tools` already includes `query_id` — `arcadetools/select_tools_analytics.go` |
| MCP recommendation Usage | `MCP tool recommendation queried` emitted on success; **no `query_id`** — `metatools.MetaToolUsageEvent` |

Context properties merge under explicit event properties in `usage.resolveOptions` (`usage/service.go`).

---

## 1. Normalize plugin headers at ingress

### Incoming headers

| HTTP header | Usage property |
| --- | --- |
| `Arcade-Plugin` | `plugin_source` |
| `Arcade-Plugin-Version` | `plugin_version` |

Read with `c.GetHeader` (canonical casing). Trim whitespace. **Omit** properties when the header is empty. Do not default `plugin_source` to `"arcade"` server-side.

### Where to stamp

Add `pluginUsageProperties(c *gin.Context)` and merge via `usage.WithContextProperties` in **`GatewayLookupMiddleware`** (auth failures inherit plugin dims, same as `gatewayUsageProperties`). Verify stateless routing cannot skip lookup; if it can, also stamp in `mcpstateless/dispatch.Handle`.

Request-scoped only — not `mcpUsageProperties` session fields. No per-capture changes for headers; `usage.Capture` merges context props on both MCP paths. Keep Engine analytics `source` unchanged (`tr_select_tools` stays `"arcade-engine"`).

---

## 2. Add `query_id` to `MCP tool recommendation queried`

### When

After a **successful** meta-tool dispatch where `metatools.MetaToolUsageEvent(name) == "MCP tool recommendation queried"` **and** the tool is SelectTools (wire name `Arcade.SelectTools` / `Arcade_SelectTools`).

SearchTools shares the event name but does not return `query_id` — omit the property.

### How

1. Type-assert `resp.Output.Value` to `*arcadetools.SelectToolsOutput` (same assertion as `metatools.StoreSelectToolsResults`).
2. If `output.QueryID != ""`, set `props["query_id"] = output.QueryID` on the Usage capture.

Extract a shared helper in `internal/mcp/metatools` (e.g. `AppendSelectToolsQueryID(props, resp *tool.Response)`) so stateful and stateless cannot drift.

### Call sites

- **Stateful:** `mcp/service.go` `executeBuiltinToolCall` success branch (~1065), before `usage.Capture`.
- **Stateless:** `mcpstateless/tools/meta.go` `shapeMetaToolResult` (~139), inside `captureUsageEvent` or immediately before it.

### Semantics

- Server-generated ID from Condex only. Never copy `query_id` from client tool arguments into Usage properties.
- Empty/missing ID is valid (logging disabled, failed tasks, queue full). Do not block capture.
- Multi-task SelectTools exposes the first non-empty task `query_id` (existing `SelectTools` aggregation). Document in dashboards; do not treat as unique per task.

`tr_select_tools` remains the Engine-analytics owner for condex latencies; this change aligns the **Usage** event used for principal-attributed billing/product analytics.

---

## 3. What NOT to do

| Do not | Why |
| --- | --- |
| Use `Mcp-Session-Id` as a chat or hook join key | Transport-scoped server session; stateless path deletes the header (`dispatch.go`). Not Cursor `conversation_id`. |
| Change Usage PostHog `distinct_id` | Stays `principalId` via Usage sink. Plugin headers are properties, not identity. |
| Merge `tr_select_tools` `distinct_id` (`project_*` / `customer_*`) into person profiles | Separate analytics scheme — `analytics/capture.go`. Join on `query_id` in views, not `identify`/`alias`. |
| Alias hook `distinct_id` to gateway `principalId` | Hook session hash is untrusted conversation context; server principal is trusted account identity. |
| Treat `plugin_source` / `plugin_version` as authorization | Client-declared analytics context only. |
| Emit `query_id` on SearchTools or failed SelectTools | Property only when SelectTools output includes it on the success branch. |
| Require `query_id` for event emission | Capture without the property when absent. |

---

## 4. Suggested tests

| Area | Location | Assert |
| --- | --- | --- |
| Header → context props | `mcp/gateway_lookup_middleware_test.go` (or new `plugin_usage_properties_test.go`) | Request with headers → `usage.ContextProperties(ctx)` has both fields; absent headers → omitted |
| Stateless ingress | `mcpstateless/dispatch_test.go` | Same merge on routed context |
| Context merge | `usage/context_test.go` / `usage/service_test.go` | Plugin props survive merge with gateway + explicit event props |
| Stateful SelectTools | `mcp/service_test.go` (extend builtin/meta-tool usage tests) | Success capture includes `query_id` when mock returns `SelectToolsOutput{QueryID: "…"}` |
| Stateless SelectTools | `mcpstateless/tools/meta_test.go` `TestStatelessMetaTools_UsageEventPerTool` | SelectTools row asserts `query_id`; SearchTools row asserts property absent |
| Shared helper | `mcp/metatools/usage_test.go` | `AppendSelectToolsQueryID` edge cases (nil resp, wrong type, empty ID) |
| Parity / funnel | `mcp/billing_parity_test.go`, `mcpstateless/parity_test.go`, `arcadetools/select_tools_analytics_test.go` | Optional billing prop list update; reuse existing `query_id` funnel tests |

## 5. Rollout

Land monorepo PR first. Plugin step 1 adds headers to generated `mcp.json` + conformance spike. Dashboards filter Usage on `plugin_source`; track `query_id` fill rate on `MCP tool recommendation queried` vs `tr_select_tools`.

**Out of scope:** hook link events, proxy, `tr_select_tools` identity changes, retention dashboards, `_meta` receipts.
