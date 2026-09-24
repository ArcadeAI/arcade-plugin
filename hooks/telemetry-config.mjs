// @ts-check
/** Telemetry settings: where events go, the opt-out variable, and the local file names. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));

// Arcade's PostHog proxy, the same one arcade.dev and identity-ui use.
export const POSTHOG_HOST =
  process.env.ARCADE_PLUGIN_TELEMETRY_HOST || "https://p.arcade.dev";

// Public, client-side key for the Production project.
export const POSTHOG_KEY = "phc_zNHKkPFsrKVSpd7y85jnxW8jNVW6AQD6AwqE4nWjwpXg";

export const OPT_OUT_ENV = "ARCADE_PLUGIN_TELEMETRY";

// Holds "true" once an Arcade tool call has succeeded on this machine.
export const ARCADE_USED_FILE = "arcade-used";

// Earlier versions kept a persistent random ID here; the hook deletes it.
export const OLD_INSTALL_ID_FILE = "install-id";

// telemetry.mjs passes the event to telemetry-send.mjs in this variable.
export const EVENT_ENV = "ARCADE_PLUGIN_TELEMETRY_EVENT";

const readPluginVersion = () => {
  try {
    return readFileSync(path.join(HOOKS_DIR, "..", "VERSION"), "utf8").trim();
  } catch {
    return "unknown";
  }
};

export const PLUGIN_VERSION = readPluginVersion();
