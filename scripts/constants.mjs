/** Shared plugin constants — single source for endpoint, pins, and doc URLs. */

export const ENDPOINT = "https://api.bosslevel.dev/mcp/all-optimized";
export const MCP_SERVER_NAME = "arcade";
export const MCP_REMOTE_VERSION = "0.1.38";
export const MCP_REMOTE_PACKAGE = `mcp-remote@${MCP_REMOTE_VERSION}`;
export const INSTALL_SLUG = "ArcadeAI/arcade-plugin";
export const PLUGIN_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
export const TRIAL_DASHBOARD_URL =
  "https://cloud.bosslevel.dev?utm_source=arcade-plugin";
export const ORG_DASHBOARD_URL =
  "https://app.arcade.dev?utm_source=arcade-plugin";

/** Pinned CI toolchain — keep in sync with package.json devDependencies and workflows. */
export const CI_NODE_VERSION = "22.23.2";
export const PLUGINS_CLI_VERSION = "1.3.4";
export const CLAUDE_CODE_CLI_VERSION = "2.1.258";

export const VENDORED_SCHEMAS = {
  [PLUGIN_SCHEMA]: "schemas/agent-plugins/1.0.0/plugin.schema.json",
  [MCP_SCHEMA]: "schemas/agent-plugins/1.0.0/mcp.schema.json",
};
