// @ts-check
/** Telemetry settings: where events go, the opt-out variable, and the install ID file. */

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

export const INSTALL_ID_FILE = "install-id";

const readPluginVersion = () => {
  try {
    return readFileSync(path.join(HOOKS_DIR, "..", "VERSION"), "utf8").trim();
  } catch {
    return "unknown";
  }
};

export const PLUGIN_VERSION = readPluginVersion();
