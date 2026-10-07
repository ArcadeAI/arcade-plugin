// @ts-check
/**
 * Shared helpers for telemetry foundation tests. API kept stable for slices B/C.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { eventSchema } from "../hooks/telemetry-contract.mjs";
import { PLUGIN_VERSION } from "../hooks/telemetry-config.mjs";
import { ROOT } from "./helpers.mjs";

const validateEvent = new Ajv2020({ allErrors: true }).compile(eventSchema());

/** @param {object} event */
export const assertMatchesContract = (event, label = JSON.stringify(event)) => {
  assert.equal(validateEvent(event), true, `${label}: ${JSON.stringify(validateEvent.errors)}`);
};

/**
 * @param {string} serialized
 * @param {RegExp | RegExp[]} patterns
 */
export const assertNoLeak = (serialized, patterns) => {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  for (const pattern of list) {
    assert.doesNotMatch(serialized, pattern, serialized);
  }
};

export const hash16 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForRequests = async (requests, count) => {
  const deadline = Date.now() + 3000;
  while (requests.length < count && Date.now() < deadline) await sleep(50);
};

export const startServer = async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push({ url: req.url, body });
      res.end("{}");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const close = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close };
};

/**
 * @param {import("../hooks/telemetry-adapter.mjs").TelemetryAdapter} adapter
 */
export const telemetryEnv = (adapter, dataDir, serverUrl, extra = {}) => ({
  [adapter.dataVariable]: dataDir,
  ARCADE_PLUGIN_TELEMETRY_HOST: serverUrl,
  ARCADE_PLUGIN_TELEMETRY: "",
  DO_NOT_TRACK: "",
  FAKE_DISABLE_TELEMETRY: "",
  FAKE_OFFLINE: "",
  ...extra,
});

export const hookInput = (fields) => ({
  session_id: "raw-session-id-123",
  prompt_id: "raw-prompt-id-456",
  cwd: "/Users/someone/private-repo",
  ...fields,
});

/**
 * @param {import("../hooks/telemetry-adapter.mjs").TelemetryAdapter} adapter
 */
export const expectedEvent = (event, extra, adapter, sessionId = "raw-session-id-123", promptId = "raw-prompt-id-456") => {
  const session = hash16(sessionId);
  const properties = {
    ...extra,
    host: adapter.host,
    plugin_version: PLUGIN_VERSION,
    telemetry_version: 2,
    os: "darwin",
    $process_person_profile: false,
    $geoip_disable: true,
    $ip: "0.0.0.0",
    arcade_used_before: false,
    session,
  };
  if (adapter.requiresTurn && typeof promptId === "string") {
    properties.turn = hash16(`${sessionId}:${promptId}`);
  }
  return { event, distinct_id: session, properties };
};

export const runTelemetryScript = (stdin, env, hostName = "claude-code", extraArgs = []) =>
  spawnSync(process.execPath, [path.join(ROOT, "hooks", "telemetry.mjs"), "--host", hostName, ...extraArgs], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
