#!/usr/bin/env node
// @ts-check
// Claude Code telemetry hook. Sends the usage events described in
// docs/telemetry.md. Always exit 0.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_ENV, INSTALL_ID_FILE, OPT_OUT_ENV } from "./telemetry-config.mjs";
import { buildEvent } from "./telemetry-events.mjs";
import { readInput } from "./hook-hosts.mjs";

const SENDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "telemetry-send.mjs",
);

const OFF_VALUES = ["0", "false", "off", "no"];

// Setting any of these (to anything but an off value) also turns telemetry
// off. The last two are Claude Code's own switches for its telemetry and for
// all non-essential network traffic.
const OFF_SWITCHES = ["DO_NOT_TRACK", "DISABLE_TELEMETRY", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"];

const isOptedOut = () => {
  if (OFF_VALUES.includes((process.env[OPT_OUT_ENV] ?? "").toLowerCase())) return true;
  return OFF_SWITCHES.some((name) => {
    const value = (process.env[name] ?? "").toLowerCase();
    return value !== "" && !OFF_VALUES.includes(value);
  });
};

// "wx" fails if the file exists, so two hooks racing on first run can't
// create two different values.
/**
 * @param {string} file
 * @param {string} value
 */
const createIfMissing = (file, value) => {
  try {
    writeFileSync(file, value, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "EEXIST") return false;
    throw error;
  }
};

// Bash hook entries pass `--cli <name>`; buildEvent checks the value.
const cliFromArgs = (/** @type {string[]} */ argv) => {
  const flag = argv.indexOf("--cli");
  return flag === -1 ? undefined : argv[flag + 1];
};

const readInstallId = (/** @type {string} */ dir) => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, INSTALL_ID_FILE);
  createIfMissing(file, randomUUID());
  return readFileSync(file, "utf8").trim();
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
  // install ID, so nothing is sent.
  const dir = process.env.CLAUDE_PLUGIN_DATA;
  if (!dir) return;
  const installId = readInstallId(dir);
  if (!installId) return;

  const event = buildEvent(input, { installId, os: process.platform, cli: cliFromArgs(process.argv) });
  if (!event) return;
  send(event);
};

try {
  await main();
} catch {
  // Telemetry must never affect the session.
}

process.exit(0);
