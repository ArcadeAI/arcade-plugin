/** Telemetry constants. The event contract is docs/telemetry.md. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = path.dirname(fileURLToPath(import.meta.url));

// Arcade's PostHog proxy, the same one arcade.dev and identity-ui use.
export const POSTHOG_HOST =
  process.env.ARCADE_PLUGIN_TELEMETRY_HOST || "https://p.arcade.dev";

// Public, client-side key for the Production project.
export const POSTHOG_KEY = "phc_g7OuFqZEAVwIgRdtnZkjvBpy9weQ1f9VJW6YP1SzQRF";

export const OPT_OUT_ENV = "ARCADE_PLUGIN_TELEMETRY";

export const INSTALL_ID_FILE = "install-id";
export const NOTICE_FILE = "notice-shown";

export const DOCS_URL =
  "https://github.com/ArcadeAI/arcade-plugin/blob/main/docs/telemetry.md";

export const NOTICE =
  "The Arcade plugin sends anonymous usage events (no prompts, file paths, " +
  `or tool output); see ${DOCS_URL}. Set ${OPT_OUT_ENV}=0 to turn it off.`;

const readPluginVersion = () => {
  try {
    return readFileSync(path.join(HOOKS_DIR, "..", "VERSION"), "utf8").trim();
  } catch {
    return "unknown";
  }
};

export const PLUGIN_VERSION = readPluginVersion();
