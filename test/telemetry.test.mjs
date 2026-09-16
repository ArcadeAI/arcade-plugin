import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import {
  MAX_HOOK_INPUT_BYTES,
  readHookInput,
} from "../hooks/hook-input.mjs";
import {
  arcadeToolNameFromInput,
  buildCapturePayload,
  detectHost,
  errorClassFrom,
  hashDistinctId,
  hostSessionHashFromInput,
  isTelemetryEnabled,
  normalizeArcadeToolName,
  PLUGIN_VERSION,
  queryIdFromSelectToolsResponse,
  recordTelemetry,
  TELEMETRY_EVENTS,
} from "../hooks/telemetry.mjs";
import { isBareContinuation } from "../hooks/prompt-continuation.mjs";
import { resolvePosthogIngestHost } from "../scripts/constants.mjs";
import { runHook } from "./helpers.mjs";

test("resolvePosthogIngestHost defaults to production and respects override", () => {
  assert.equal(resolvePosthogIngestHost({}), "https://p.arcade.dev");
  assert.equal(
    resolvePosthogIngestHost({ ARCADE_PLUGIN_POSTHOG_HOST: "https://staging.example/" }),
    "https://staging.example/",
  );
  assert.equal(
    resolvePosthogIngestHost({ ARCADE_PLUGIN_POSTHOG_HOST: "  " }),
    "https://p.arcade.dev",
  );
});

test("readHookInput rejects malformed and oversized payloads", async () => {
  assert.deepEqual(await readHookInput(Readable.from(['{"session_id":"s1"}'])), {
    session_id: "s1",
  });
  assert.deepEqual(await readHookInput(Readable.from(["not json"])), {});
  assert.deepEqual(
    await readHookInput(Readable.from(["x".repeat(MAX_HOOK_INPUT_BYTES + 1)])),
    {},
  );
});

test("isTelemetryEnabled defaults on and respects opt-out", () => {
  assert.equal(isTelemetryEnabled({}), true);
  assert.equal(isTelemetryEnabled({ ARCADE_PLUGIN_TELEMETRY: "" }), true);
  assert.equal(isTelemetryEnabled({ ARCADE_PLUGIN_TELEMETRY: "0" }), false);
  assert.equal(isTelemetryEnabled({ ARCADE_PLUGIN_TELEMETRY: "off" }), false);
  assert.equal(isTelemetryEnabled({ ARCADE_PLUGIN_TELEMETRY: "false" }), false);
  for (const value of ["1", "true", "on", "yes", " YES "]) {
    assert.equal(isTelemetryEnabled({ ARCADE_PLUGIN_TELEMETRY: value }), true);
  }
});

test("isBareContinuation matches short acknowledgements only", () => {
  assert.equal(isBareContinuation("ok"), true);
  assert.equal(isBareContinuation("yes thanks"), true);
  assert.equal(isBareContinuation("fix it"), false);
});

test("hashDistinctId is stable and does not echo the session id", () => {
  const first = hashDistinctId("conv-123");
  const second = hashDistinctId("conv-123");
  assert.equal(first, second);
  assert.match(first, /^plugin:[a-f0-9]{32}$/);
  assert.doesNotMatch(first, /conv-123/);
});

test("hostSessionHashFromInput returns undefined without a session key", () => {
  assert.equal(hostSessionHashFromInput({}), undefined);
  assert.equal(hostSessionHashFromInput({ cursor_version: "1.0" }), undefined);
});

test("detectHost distinguishes cursor, codex, and claude shapes", () => {
  assert.equal(detectHost({ conversation_id: "c1", cursor_version: "1.0" }, {}), "cursor");
  assert.equal(detectHost({ session_id: "s1", turn_id: "t1" }, {}), "codex");
  assert.equal(detectHost({ session_id: "s1" }, { PLUGIN_ROOT: "/plugin" }), "codex");
  assert.equal(detectHost({ session_id: "s1" }, {}), "claude");
});

test("TELEMETRY_EVENTS registry covers lifecycle, routing, discovery link, and errors", () => {
  assert.equal(TELEMETRY_EVENTS.SESSION_STARTED, "Plugin session started");
  assert.equal(TELEMETRY_EVENTS.SUBAGENT_STARTED, "Plugin subagent started");
  assert.equal(TELEMETRY_EVENTS.ROUTING_CONTEXT_EMITTED, "Plugin routing context emitted");
  assert.equal(
    TELEMETRY_EVENTS.ROUTING_SKIPPED_BARE_CONTINUATION,
    "Plugin routing skipped bare continuation",
  );
  assert.equal(TELEMETRY_EVENTS.DISCOVERY_LINKED, "Plugin discovery linked");
  assert.equal(TELEMETRY_EVENTS.HOOK_ERROR, "Plugin hook error");
});

test("normalizeArcadeToolName extracts bare tool names from MCP identifiers", () => {
  assert.equal(
    normalizeArcadeToolName("mcp__arcade__Arcade_SelectTools"),
    "Arcade_SelectTools",
  );
  assert.equal(
    normalizeArcadeToolName("mcp__plugin_arcade_arcade__Arcade_UseTool"),
    "Arcade_UseTool",
  );
  assert.equal(
    normalizeArcadeToolName("MCP:Arcade_SelectTools"),
    "Arcade_SelectTools",
  );
  assert.equal(normalizeArcadeToolName("Arcade_SelectTools"), "Arcade_SelectTools");
  assert.equal(normalizeArcadeToolName("Shell"), undefined);
  assert.equal(normalizeArcadeToolName(""), undefined);
});

test("errorClassFrom never includes stack traces", () => {
  const error = new TypeError("bad input");
  assert.equal(errorClassFrom(error), "TypeError");
  assert.equal(errorClassFrom("oops"), "Error");
  assert.equal(errorClassFrom(null), "UnknownError");
});

test("buildCapturePayload skips capture when no session key is present", () => {
  const payload = buildCapturePayload(
    {
      event: TELEMETRY_EVENTS.SESSION_STARTED,
      hookInput: { cursor_version: "1.2.3" },
      props: { hook: "sessionStart", source: "startup" },
    },
    {},
  );
  assert.equal(payload, undefined);
});

test("buildCapturePayload allowlists properties and includes host_session_hash", () => {
  const payload = buildCapturePayload(
    {
      event: TELEMETRY_EVENTS.SESSION_STARTED,
      hookInput: {
        conversation_id: "conv-abc",
        cursor_version: "1.2.3",
        composer_mode: "agent",
      },
      props: {
        hook: "sessionStart",
        source: "startup",
        prompt: "privacy-canary",
        arbitrary: "privacy-canary",
      },
    },
    {},
  );

  assert.equal(payload.event, TELEMETRY_EVENTS.SESSION_STARTED);
  assert.equal(payload.properties.host, "cursor");
  assert.equal(payload.properties.install_id, undefined);
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.plugin_version, PLUGIN_VERSION);
  assert.equal(payload.properties.host_session_hash, payload.distinct_id);
  assert.equal(payload.properties.prompt, undefined);
  assert.equal(payload.properties.tool_input, undefined);
  assert.equal(payload.properties.tool_response, undefined);
  assert.equal(payload.properties.stack, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /privacy-canary/);
});

test("buildCapturePayload for discovery link includes query_id only", () => {
  const payload = buildCapturePayload({
    event: TELEMETRY_EVENTS.DISCOVERY_LINKED,
    hookInput: { session_id: "s1" },
    props: { hook: "post_tool", query_id: "q-abc-123" },
  });

  assert.equal(payload.event, TELEMETRY_EVENTS.DISCOVERY_LINKED);
  assert.equal(payload.properties.query_id, "q-abc-123");
  assert.equal(payload.properties.tool_name, undefined);
  assert.equal(payload.properties.outcome, undefined);
});

test("queryIdFromSelectToolsResponse reads Cursor result_json", () => {
  assert.equal(
    queryIdFromSelectToolsResponse({
      mcp_server_name: "arcade",
      tool_name: "Arcade_SelectTools",
      result_json: JSON.stringify({ query_id: "cursor-q-1", tools: [] }),
    }),
    "cursor-q-1",
  );
});

test("queryIdFromSelectToolsResponse reads Codex MCP structured content", () => {
  assert.equal(
    queryIdFromSelectToolsResponse({
      mcp_server_name: "arcade",
      tool_name: "mcp__arcade__Arcade_SelectTools",
      tool_response: {
        content: [{ type: "text", text: "SelectTools completed" }],
        structuredContent: { query_id: "codex-q-2", results: [] },
      },
    }),
    "codex-q-2",
  );
});

test("queryIdFromSelectToolsResponse reads MCP text content", () => {
  assert.equal(
    queryIdFromSelectToolsResponse({
      tool_name: "mcp__arcade__Arcade_SelectTools",
      tool_response: {
        content: [
          {
            type: "text",
            text: JSON.stringify({ query_id: "claude-q-3", results: [] }),
          },
        ],
      },
    }),
    "claude-q-3",
  );
});

test("queryIdFromSelectToolsResponse ignores non-SelectTools tools", () => {
  assert.equal(
    queryIdFromSelectToolsResponse({
      mcp_server_name: "arcade",
      tool_name: "Arcade_UseTool",
      result_json: JSON.stringify({ query_id: "ignored" }),
    }),
    undefined,
  );
});

test("queryIdFromSelectToolsResponse rejects unsafe query_id tokens", () => {
  assert.equal(
    queryIdFromSelectToolsResponse({
      mcp_server_name: "arcade",
      tool_name: "Arcade_SelectTools",
      result_json: JSON.stringify({ query_id: "has spaces" }),
    }),
    undefined,
  );
});

test("arcadeToolNameFromInput filters Cursor MCP events by server", () => {
  assert.equal(
    arcadeToolNameFromInput({
      mcp_server_name: "arcade",
      tool_name: "Arcade_SelectTools",
    }),
    "Arcade_SelectTools",
  );
  assert.equal(
    arcadeToolNameFromInput({
      mcp_server_name: "other",
      tool_name: "Arcade_SelectTools",
    }),
    undefined,
  );
});

test("recordTelemetry respects opt-out and swallows spawn failures", () => {
  const calls = [];
  const child = { once() {}, unref() {} };
  const spawnProcess = (...args) => {
    calls.push(args);
    return child;
  };
  const input = {
    event: TELEMETRY_EVENTS.SESSION_STARTED,
    hookInput: { session_id: "s1" },
    props: { hook: "SessionStart", source: "startup" },
  };

  assert.equal(recordTelemetry(input, { env: {}, spawnProcess }), true);
  assert.equal(calls.length, 1);
  assert.equal(
    recordTelemetry(input, {
      env: { ARCADE_PLUGIN_TELEMETRY: "0" },
      spawnProcess,
    }),
    false,
  );
  assert.equal(calls.length, 1);
  assert.equal(
    recordTelemetry(
      {
        event: TELEMETRY_EVENTS.SESSION_STARTED,
        hookInput: { cursor_version: "1.0" },
        props: { hook: "SessionStart", source: "startup" },
      },
      { env: {}, spawnProcess },
    ),
    false,
  );
  assert.equal(
    recordTelemetry(input, {
      env: {},
      spawnProcess: () => {
        throw new Error("spawn failed");
      },
    }),
    false,
  );
});

test("prompt-telemetry hook exits cleanly for cursor prompt input", () => {
  const result = runHook(
    "prompt-telemetry.mjs",
    '{"prompt":"What is on my calendar tomorrow?","conversation_id":"conv-1","cursor_version":"1.0"}',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("session-start emits the Cursor response shape with telemetry disabled", () => {
  const result = runHook("session-start.mjs", '{"cursor_version":"1.0","conversation_id":"c1"}');
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.ok(out.additional_context);
});

test("subagent-start emits guidance with telemetry disabled", () => {
  const result = runHook(
    "subagent-start.mjs",
    '{"session_id":"s1","turn_id":"t1","agent_type":"review","agent_id":"a1"}',
  );
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.equal(out.hookSpecificOutput.hookEventName, "SubagentStart");
});

test("post-arcade-tool links SelectTools query_id only", () => {
  const result = runHook(
    "post-arcade-tool.mjs success",
    JSON.stringify({
      session_id: "s1",
      mcp_server_name: "arcade",
      tool_name: "mcp__plugin_arcade_arcade__Arcade_SelectTools",
      tool_input: { secret: "must-not-leak" },
      result_json: JSON.stringify({ query_id: "q-link-1", tools: [] }),
    }),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("post-arcade-tool ignores non-arcade tools", () => {
  const result = runHook(
    "post-arcade-tool.mjs success",
    JSON.stringify({ session_id: "s1", tool_name: "Shell" }),
  );
  assert.equal(result.status, 0, result.stderr);
});

test("post-arcade-tool ignores SelectTools responses without query_id", () => {
  const result = runHook(
    "post-arcade-tool.mjs success",
    JSON.stringify({
      session_id: "s1",
      mcp_server_name: "arcade",
      tool_name: "mcp__arcade__Arcade_UseTool",
      tool_response: { ok: true },
    }),
  );
  assert.equal(result.status, 0, result.stderr);
});

test("user-prompt-submit suppresses bare continuations without stdout", () => {
  const result = runHook("user-prompt-submit.mjs", '{"prompt":"ok","session_id":"s1"}');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});
