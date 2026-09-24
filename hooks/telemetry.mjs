#!/usr/bin/env node
// @ts-check
// Claude Code telemetry hook. Sends the usage events described in
// docs/telemetry.md. Always exit 0.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARCADE_USED_FILE, EVENT_ENV, OLD_INSTALL_ID_FILE, OPT_OUT_ENV } from "./telemetry-config.mjs";
import { buildEvent, isArcadeCall } from "./telemetry-events.mjs";
import { readInput } from "./hook-hosts.mjs";

const SENDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "telemetry-send.mjs",
);

const OFF_VALUES = ["0", "false", "off", "no"];

// Claude Code's own switches for its telemetry and for all non-essential
// network traffic. Claude Code treats any non-empty value as set, including
// "0" and "false", so the plugin does too.
const CLAUDE_CODE_SWITCHES = ["DISABLE_TELEMETRY", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"];

const isOptedOut = () => {
  if (OFF_VALUES.includes((process.env[OPT_OUT_ENV] ?? "").toLowerCase())) return true;
  const doNotTrack = (process.env.DO_NOT_TRACK ?? "").toLowerCase();
  if (doNotTrack !== "" && !OFF_VALUES.includes(doNotTrack)) return true;
  return CLAUDE_CODE_SWITCHES.some((name) => (process.env[name] ?? "") !== "");
};

const readArcadeUsed = (/** @type {string} */ dir) => {
  try {
    return readFileSync(path.join(dir, ARCADE_USED_FILE), "utf8").trim() === "true";
  } catch {
    return false;
  }
};

const markArcadeUsed = (/** @type {string} */ dir) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, ARCADE_USED_FILE), "true", { mode: 0o600 });
};

const send = (/** @type {object} */ event) => {
  // Claude Code kills hook processes when the session exits, so the network
  // call runs in a detached child that can outlive this hook. The event goes
  // in an environment variable, not an argument, because other users on the
  // machine can read a process's arguments but not its environment.
  const child = spawn(process.execPath, [SENDER], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, [EVENT_ENV]: JSON.stringify(event) },
  });
  child.on("error", () => {});
  child.unref();
};

const main = async () => {
  const input = await readInput();
  if (isOptedOut()) return;

  // Claude Code always sets this. Without it there is nowhere to keep the
  // arcade-used flag, so nothing is sent.
  const dir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dir) return;
  rmSync(path.join(dir, OLD_INSTALL_ID_FILE), { force: true });

  const arcadeUsedBefore = readArcadeUsed(dir);
  const event = buildEvent(input, { os: process.platform, arcadeUsedBefore });
  if (!event) return;
  if (!arcadeUsedBefore && isArcadeCall(event)) markArcadeUsed(dir);
  send(event);
};

try {
  await main();
} catch {
  // Telemetry must never affect the session.
}

process.exit(0);
