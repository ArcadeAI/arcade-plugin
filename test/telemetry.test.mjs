import assert from "node:assert/strict";
import { test } from "node:test";
import { resetInstallIdCache } from "../hooks/install-id.mjs";
import {
  bucketPromptLength,
  buildCapturePayload,
  detectHost,
  hashDistinctId,
  isTelemetryEnabled,
  PLUGIN_VERSION,
  TELEMETRY_EVENTS,
} from "../hooks/telemetry.mjs";
import { isBareContinuation } from "../hooks/prompt-continuation.mjs";
import { runHook } from "./helpers.mjs";

test("isTelemetryEnabled defaults on and respects opt-out", () => {
  const previous = process.env.ARCADE_PLUGIN_TELEMETRY;
  delete process.env.ARCADE_PLUGIN_TELEMETRY;
  assert.equal(isTelemetryEnabled(), true);
  process.env.ARCADE_PLUGIN_TELEMETRY = "0";
  assert.equal(isTelemetryEnabled(), false);
  process.env.ARCADE_PLUGIN_TELEMETRY = "off";
  assert.equal(isTelemetryEnabled(), false);
  if (previous === undefined) delete process.env.ARCADE_PLUGIN_TELEMETRY;
  else process.env.ARCADE_PLUGIN_TELEMETRY = previous;
});

test("bucketPromptLength buckets lengths without storing raw text", () => {
  assert.equal(bucketPromptLength(0), "0");
  assert.equal(bucketPromptLength(12), "1-20");
  assert.equal(bucketPromptLength(250), "101-500");
  assert.equal(bucketPromptLength(900), "501+");
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

test("detectHost distinguishes cursor, codex, and claude shapes", () => {
  assert.equal(detectHost({ conversation_id: "c1", cursor_version: "1.0" }), "cursor");
  assert.equal(detectHost({ session_id: "s1", turn_id: "t1" }), "codex");
  assert.equal(detectHost({ session_id: "s1" }), "claude");
});

test("buildCapturePayload includes install_id and omits prompt text", () => {
  const previousInstallId = process.env.ARCADE_PLUGIN_INSTALL_ID;
  process.env.ARCADE_PLUGIN_INSTALL_ID = "install-test-uuid";
  resetInstallIdCache();

  const payload = buildCapturePayload({
    event: TELEMETRY_EVENTS.SESSION_STARTED,
    hookInput: {
      conversation_id: "conv-abc",
      cursor_version: "1.2.3",
      composer_mode: "agent",
    },
    props: { hook: "sessionStart" },
  });

  assert.equal(payload.event, TELEMETRY_EVENTS.SESSION_STARTED);
  assert.equal(payload.properties.host, "cursor");
  assert.equal(payload.properties.install_id, "install-test-uuid");
  assert.equal(payload.properties.plugin_version, PLUGIN_VERSION);
  assert.equal(payload.properties.prompt, undefined);

  if (previousInstallId === undefined) delete process.env.ARCADE_PLUGIN_INSTALL_ID;
  else process.env.ARCADE_PLUGIN_INSTALL_ID = previousInstallId;
  resetInstallIdCache();
});

test("prompt-telemetry hook exits cleanly for cursor prompt input", () => {
  const result = runHook(
    "prompt-telemetry.mjs",
    '{"prompt":"What is on my calendar tomorrow?","conversation_id":"conv-1","cursor_version":"1.0"}',
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "");
});

test("session-start still emits cursor shape when telemetry is enabled", () => {
  const result = runHook("session-start.mjs", '{"cursor_version":"1.0","conversation_id":"c1"}');
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert.ok(out.additional_context);
});
