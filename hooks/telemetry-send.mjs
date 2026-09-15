#!/usr/bin/env node
// Detached PostHog capture worker. Invoked by telemetry.mjs; never from hooks directly.

import { resolvePosthogIngestHost } from "../scripts/constants.mjs";

const TIMEOUT_MS = 2_000;

const send = async (payload) => {
  const endpoint = `${resolvePosthogIngestHost().replace(/\/$/, "")}/capture/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

try {
  const raw = process.argv[2];
  if (!raw) process.exit(0);
  const payload = JSON.parse(raw);
  if (!payload?.api_key || !payload?.event || !payload?.distinct_id) process.exit(0);
  await send(payload);
} catch {
  // Telemetry must never surface errors to the host.
}

process.exit(0);
