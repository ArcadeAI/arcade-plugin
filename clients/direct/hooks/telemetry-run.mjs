// @ts-check
/** Opt-out checks and the shared telemetry hook body. Never throws. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scopeForInput } from "./hook-scope.mjs";
import { ARCADE_USED_FILE, OPT_OUT_ENV, TELEMETRY_ENABLED } from "./telemetry-config.mjs";
import { buildEvent, isArcadeCall } from "./telemetry-events.mjs";

/** @typedef {import("./telemetry-adapter.mjs").TelemetryAdapter} TelemetryAdapter */

/**
 * The only place shipped plugin code reads the process environment. It picks
 * the one opt-out switch and the client data-folder variables by name into a
 * plain object, and is called only after the TELEMETRY_ENABLED check, so a
 * build with telemetry off reads no environment at all.
 * @returns {NodeJS.ProcessEnv}
 */
export const readOptOutEnv = () => ({
  ARCADE_PLUGIN_TELEMETRY: process.env.ARCADE_PLUGIN_TELEMETRY,
  CLAUDE_PLUGIN_DATA: process.env.CLAUDE_PLUGIN_DATA,
  COPILOT_PLUGIN_DATA: process.env.COPILOT_PLUGIN_DATA,
});

const OFF_VALUES = ["0", "false", "off", "no"];

/**
 * ARCADE_PLUGIN_TELEMETRY set to 0, false, off, or no (any case) is the only opt-out.
 * @param {NodeJS.ProcessEnv} [env] Defaults to readOptOutEnv().
 */
export const isOptedOut = (env = readOptOutEnv()) =>
  OFF_VALUES.includes((env[OPT_OUT_ENV] ?? "").toLowerCase());

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

/**
 * Clears prompt scope on session start when telemetry is active and not opted out.
 * @param {object} options
 * @param {TelemetryAdapter} options.adapter
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {Record<string, any>} [options.input]
 * @param {boolean} [options.enabled]
 */
export const clearSessionScope = ({
  adapter,
  env: givenEnv,
  input = {},
  enabled = false,
}) => {
  try {
    if (!enabled && !TELEMETRY_ENABLED) return;
    const env = givenEnv ?? readOptOutEnv();
    if (isOptedOut(env)) return;
    const dir = env[adapter.dataVariable];
    if (!dir || !path.isAbsolute(dir)) return;
    scopeForInput(
      { ...adapter.normalize(input), hook_event_name: "SessionStart" },
      { host: adapter.host, requiresTurn: adapter.requiresTurn, dir },
    );
  } catch {
    // Scope clearing must never affect the session.
  }
};

// No sender yet. The earlier detached child process is gone, so an enabled
// build needs a sender that does not start a child process.
const defaultSend = () => {};

/**
 * @param {object} options
 * @param {Record<string, any>} options.input Raw hook stdin.
 * @param {TelemetryAdapter} options.adapter
 * @param {string[]} [options.argv]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {number} [options.now]
 * @param {boolean} [options.enabled] When true, runs even if TELEMETRY_ENABLED is false (tests).
 * @param {(event: object) => void} [options.send]
 */
export const runTelemetry = async ({
  input,
  adapter,
  argv = process.argv,
  env: givenEnv,
  now = Date.now(),
  enabled = false,
  send = defaultSend,
}) => {
  try {
    if (!enabled && !TELEMETRY_ENABLED) return;
    const env = givenEnv ?? readOptOutEnv();
    // The client always sets this. Without an absolute data folder there is
    // nowhere to keep the arcade-used flag, so nothing is sent.
    const dir = env[adapter.dataVariable];
    if (!dir || !path.isAbsolute(dir)) return;
    if (isOptedOut(env)) return;
    const normalized = adapter.normalize(input ?? {});
    const { appWork } = scopeForInput(normalized, {
      host: adapter.host,
      requiresTurn: adapter.requiresTurn,
      dir,
      now,
    });

    const arcadeUsedBefore = readArcadeUsed(dir);
    const event = buildEvent(normalized, {
      adapter,
      os: process.platform,
      arcadeUsedBefore,
      cli: cliFromArgs(argv),
      appWork,
    });
    if (!event) return;
    if (!arcadeUsedBefore && isArcadeCall(event)) markArcadeUsed(dir);
    send(event);
  } catch {
    // Telemetry must never affect the session.
  }
};
