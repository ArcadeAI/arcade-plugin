#!/usr/bin/env node
// @ts-check
// Telemetry hook for each client in hook-hosts.mjs with a `telemetry` entry.
// Sends the usage events described in docs/telemetry.md. Always exit 0.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARCADE_USED_FILE, EVENT_ENV, OLD_INSTALL_ID_FILE, OPT_OUT_ENV } from "./telemetry-config.mjs";
import { buildEvent, isArcadeCall } from "./telemetry-events.mjs";
import { hostFromArgs, readInput } from "./hook-hosts.mjs";

const SENDER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "telemetry-send.mjs",
);

const OFF_VALUES = ["0", "false", "off", "no"];

const isSet = (/** @type {string} */ value) => value !== "" && !OFF_VALUES.includes(value.toLowerCase());

/**
 * A switch with `anyValue` is on for any non-empty value, even "0" or "false",
 * because that is how Claude Code reads its own switches.
 * @param {{ name: string, anyValue: boolean }[]} optOutSwitches The client's own off switches.
 */
const isOptedOut = (optOutSwitches) => {
  if (OFF_VALUES.includes((process.env[OPT_OUT_ENV] ?? "").toLowerCase())) return true;
  if (isSet(process.env.DO_NOT_TRACK ?? "")) return true;
  return optOutSwitches.some(({ name, anyValue }) => {
    const value = process.env[name] ?? "";
    return anyValue ? value !== "" : isSet(value);
  });
};

const readArcadeUsed = (/** @type {string} */ dir) => {
  try {
    return readFileSync(path.join(dir, ARCADE_USED_FILE), "utf8").trim() === "true";
  } catch {
    return false;
  }
};

// Bash hook entries pass `--cli <name>`; buildEvent checks the value.
const cliFromArgs = (/** @type {string[]} */ argv) => {
  const flag = argv.indexOf("--cli");
  return flag === -1 ? undefined : argv[flag + 1];
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
  const client = hostFromArgs(process.argv)?.telemetry;
  if (!client) return;
  // The client always sets this. Without it there is nowhere to keep the
  // arcade-used flag, so nothing is sent.
  const dir = process.env[client.dataVariable];
  if (!dir || !path.isAbsolute(dir)) return;
  rmSync(path.join(dir, OLD_INSTALL_ID_FILE), { force: true });
  if (isOptedOut(client.optOutSwitches)) return;

  const arcadeUsedBefore = readArcadeUsed(dir);
  const event = buildEvent(input, {
    host: client.host,
    os: process.platform,
    arcadeUsedBefore,
    cli: cliFromArgs(process.argv),
  });
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
