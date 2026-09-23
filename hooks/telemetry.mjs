#!/usr/bin/env node
// Claude Code telemetry hook. Sends the anonymous events described in
// docs/telemetry.md. Always exit 0.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INSTALL_ID_FILE,
  NOTICE,
  NOTICE_FILE,
  OPT_OUT_ENV,
  POSTHOG_KEY,
} from "./telemetry-config.mjs";
import { buildEvent } from "./telemetry-events.mjs";

const SENDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "telemetry-send.mjs",
);

const readStdin = async () => {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
};

const OFF_VALUES = ["0", "false", "off", "no"];

const isOptedOut = () => {
  const optOut = (process.env[OPT_OUT_ENV] ?? "").toLowerCase();
  const doNotTrack = (process.env.DO_NOT_TRACK ?? "").toLowerCase();
  return OFF_VALUES.includes(optOut) || doNotTrack === "1" || doNotTrack === "true";
};

// "wx" fails if the file exists, so two hooks racing on first run can't
// create two different values.
const createIfMissing = (file, value) => {
  try {
    writeFileSync(file, value, { flag: "wx" });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
};

const readInstallId = (dir) => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, INSTALL_ID_FILE);
  createIfMissing(file, randomUUID());
  return readFileSync(file, "utf8").trim();
};

const showNoticeOnce = (dir) => {
  const created = createIfMissing(
    path.join(dir, NOTICE_FILE),
    new Date().toISOString(),
  );
  if (created) process.stdout.write(JSON.stringify({ systemMessage: NOTICE }));
};

const send = (event) => {
  // Claude Code kills hook processes when the session exits, so the network
  // call runs in a detached child that can outlive this hook.
  const child = spawn(process.execPath, [SENDER, JSON.stringify(event)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {});
  child.unref();
};

const main = async () => {
  const input = JSON.parse(await readStdin());
  if (isOptedOut()) return;

  // Claude Code always sets this. Without it there is nowhere to keep the
  // install ID or the notice marker, so nothing is sent.
  const dir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dir) return;
  const installId = readInstallId(dir);
  if (!installId) return;

  if (input.hook_event_name === "SessionStart") showNoticeOnce(dir);
  // Nothing is sent before the user has seen the notice.
  if (!existsSync(path.join(dir, NOTICE_FILE))) return;

  const event = buildEvent(input, { installId, os: process.platform });
  if (!event || !POSTHOG_KEY) return;
  send(event);
};

try {
  await main();
} catch {
  // Telemetry must never affect the session.
}

process.exit(0);
