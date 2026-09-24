#!/usr/bin/env node
// @ts-check
// Claude Code telemetry hook. Sends the anonymous events described in
// docs/telemetry.md. Always exit 0.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INSTALL_ID_FILE, OPT_OUT_ENV } from "./telemetry-config.mjs";
import { buildEvent } from "./telemetry-events.mjs";
import { readInput } from "./hook-hosts.mjs";

const SENDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "telemetry-send.mjs",
);

const OFF_VALUES = ["0", "false", "off", "no"];

const isOptedOut = () => {
  const optOut = (process.env[OPT_OUT_ENV] ?? "").toLowerCase();
  const doNotTrack = (process.env.DO_NOT_TRACK ?? "").toLowerCase();
  return OFF_VALUES.includes(optOut) || doNotTrack === "1" || doNotTrack === "true";
};

// "wx" fails if the file exists, so two hooks racing on first run can't
// create two different values.
/**
 * @param {string} file
 * @param {string} value
 */
const createIfMissing = (file, value) => {
  try {
    writeFileSync(file, value, { flag: "wx" });
    return true;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "EEXIST") return false;
    throw error;
  }
};

const readInstallId = (/** @type {string} */ dir) => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, INSTALL_ID_FILE);
  createIfMissing(file, randomUUID());
  return readFileSync(file, "utf8").trim();
};

const send = (/** @type {object} */ event) => {
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
  const input = await readInput();
  if (isOptedOut()) return;

  // Claude Code always sets this. Without it there is nowhere to keep the
  // install ID, so nothing is sent.
  const dir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dir) return;
  const installId = readInstallId(dir);
  if (!installId) return;

  const event = buildEvent(input, { installId, os: process.platform });
  if (!event) return;
  send(event);
};

try {
  await main();
} catch {
  // Telemetry must never affect the session.
}

process.exit(0);
