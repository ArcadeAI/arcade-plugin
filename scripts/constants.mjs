/** Shared plugin constants derived from the portable Agent Plugins manifests. */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portablePlugin = JSON.parse(
  readFileSync(join(ROOT, "plugin.json"), "utf8"),
);
const portableMcp = JSON.parse(
  readFileSync(join(ROOT, "mcp.json"), "utf8"),
);

export const MCP_SERVER_NAME = "arcade";
export const ENDPOINT = portableMcp.mcpServers[MCP_SERVER_NAME].url;
export const GATEWAY_HOST = new URL(ENDPOINT).host;
export const MCP_REMOTE_VERSION = "0.1.38";
export const MCP_REMOTE_PACKAGE = `mcp-remote@${MCP_REMOTE_VERSION}`;
export const INSTALL_SLUG = "ArcadeAI/arcade-plugin";
export const PLUGIN_DISPLAY_NAME = "Arcade";
export const PLUGIN_SCHEMA = portablePlugin.$schema;
export const MCP_SCHEMA = portableMcp.$schema;
export const TRIAL_DASHBOARD_URL =
  "https://app.arcade.dev?utm_source=arcade-plugin";
export const ORG_DASHBOARD_URL =
  "https://app.arcade.dev?utm_source=arcade-plugin";

/** Client-safe PostHog project key (same pattern as arcade.dev / identity-ui). */
export const POSTHOG_PROJECT_KEY =
  "phc_g7OuFqZEAVwIgRdtnZkjvBpy9weQ1f9VJW6YP1SzQRF";
export const POSTHOG_INGEST_HOST = "https://p.arcade.dev";
export const TELEMETRY_LIB = "arcade-plugin-hooks";

/** Pinned CI toolchain — keep in sync with package.json devDependencies and workflows. */
export const CI_NODE_VERSION = "22.23.2";
export const PLUGINS_CLI_VERSION = "1.3.4";
export const CLAUDE_CODE_CLI_VERSION = "2.1.258";

export const VENDORED_SCHEMAS = {
  [PLUGIN_SCHEMA]: "schemas/agent-plugins/1.0.0/plugin.schema.json",
  [MCP_SCHEMA]: "schemas/agent-plugins/1.0.0/mcp.schema.json",
};
