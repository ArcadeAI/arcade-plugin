/** Opt-out plugin-side routing and discovery-link telemetry. Fire-and-forget PostHog via p.arcade.dev. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  POSTHOG_INGEST_HOST,
  POSTHOG_PROJECT_KEY,
  TELEMETRY_LIB,
} from "../scripts/constants.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

export { POSTHOG_INGEST_HOST, POSTHOG_PROJECT_KEY };

export const TELEMETRY_EVENTS = {
  SESSION_STARTED: "Plugin session started",
  SUBAGENT_STARTED: "Plugin subagent started",
  ROUTING_CONTEXT_EMITTED: "Plugin routing context emitted",
  ROUTING_SKIPPED_BARE_CONTINUATION: "Plugin routing skipped bare continuation",
  DISCOVERY_LINKED: "Plugin discovery linked",
  HOOK_ERROR: "Plugin hook error",
};

const ARCADE_TOOL_PREFIX_RE = /^mcp__(?:plugin_arcade_arcade|arcade)__(Arcade_.+)$/;
const CURSOR_TOOL_PREFIX_RE = /^MCP:(?:arcade:)?(Arcade_.+)$/i;
const ARCADE_SERVER_NAMES = new Set([
  "arcade",
  "plugin_arcade_arcade",
  "plugin-arcade-arcade",
]);
const OPT_OUT_VALUES = new Set(["0", "false", "off", "no"]);
const SAFE_TOKEN_RE = /^[a-zA-Z0-9._:-]{1,64}$/;
const SESSION_SOURCES = new Set(["startup", "resume", "clear", "compact"]);
const SELECT_TOOLS_NAME = "Arcade_SelectTools";

const parseJsonPayload = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/** Extract bare Arcade tool name from MCP-qualified identifiers. */
export const normalizeArcadeToolName = (rawName) => {
  if (typeof rawName !== "string" || !rawName) return undefined;
  const prefixed = rawName.match(ARCADE_TOOL_PREFIX_RE);
  if (prefixed) return prefixed[1];
  const cursorPrefixed = rawName.match(CURSOR_TOOL_PREFIX_RE);
  if (cursorPrefixed) return cursorPrefixed[1];
  if (rawName.startsWith("Arcade_")) return rawName;
  return undefined;
};

export const arcadeToolNameFromInput = (hookInput) => {
  if (!hookInput || typeof hookInput !== "object") return undefined;
  const serverName = hookInput.mcp_server_name ?? hookInput.mcpServerName;
  if (
    typeof serverName === "string" &&
    !ARCADE_SERVER_NAMES.has(serverName.trim().toLowerCase())
  ) {
    return undefined;
  }

  for (const candidate of [
    hookInput.tool_name,
    hookInput.toolName,
    hookInput.name,
    hookInput.tool?.name,
    hookInput.mcp_tool_name,
  ]) {
    const normalized = normalizeArcadeToolName(candidate);
    if (normalized) return normalized;
  }
  return undefined;
};

/** Read query_id from a verified Arcade_SelectTools response envelope only. */
export const queryIdFromSelectToolsResponse = (hookInput) => {
  if (arcadeToolNameFromInput(hookInput) !== SELECT_TOOLS_NAME) return undefined;

  const responsePayload =
    parseJsonPayload(hookInput.result_json) ??
    parseJsonPayload(hookInput.tool_response) ??
    parseJsonPayload(hookInput.tool_result) ??
    hookInput.tool_response ??
    hookInput.tool_result;

  if (!responsePayload || typeof responsePayload !== "object") return undefined;

  const candidate = responsePayload.query_id ?? responsePayload.queryId;
  return safeToken(candidate);
};

export const errorClassFrom = (error) => {
  if (error instanceof Error) return error.name || "Error";
  if (typeof error === "string") return "Error";
  return "UnknownError";
};

/** @param {{ hookInput?: object, hook: string, error: unknown }} input */
export const recordHookError = ({ hookInput = {}, hook, error }) => {
  recordTelemetry({
    event: TELEMETRY_EVENTS.HOOK_ERROR,
    hookInput,
    props: {
      hook,
      error_class: errorClassFrom(error),
    },
  });
};

export const PLUGIN_VERSION = readFileSync(join(ROOT, "VERSION"), "utf8").trim();

export const isTelemetryEnabled = (env = process.env) => {
  const raw = env.ARCADE_PLUGIN_TELEMETRY?.trim().toLowerCase();
  if (!raw) return true;
  return !OPT_OUT_VALUES.has(raw);
};

export const hashDistinctId = (sessionKey) => {
  const material = String(sessionKey);
  const digest = createHash("sha256").update(`arcade-plugin:${material}`).digest("hex");
  return `plugin:${digest.slice(0, 32)}`;
};

export const hostSessionHashFromInput = (hookInput) => {
  const sessionKey = sessionKeyFromInput(hookInput);
  if (!sessionKey) return undefined;
  return hashDistinctId(sessionKey);
};

export const detectHost = (hookInput, env = process.env) => {
  if (!hookInput || typeof hookInput !== "object") return "claude";
  if (
    "conversation_id" in hookInput ||
    "workspace_roots" in hookInput ||
    "cursor_version" in hookInput
  ) {
    return "cursor";
  }
  if (env.PLUGIN_ROOT || "turn_id" in hookInput) return "codex";
  return "claude";
};

export const sessionKeyFromInput = (hookInput) => {
  if (!hookInput || typeof hookInput !== "object") return undefined;
  return (
    hookInput.session_id ??
    hookInput.conversation_id ??
    hookInput.sessionId ??
    undefined
  );
};

export const hostVersionFromInput = (hookInput, host) => {
  if (!hookInput || typeof hookInput !== "object") return undefined;
  if (host === "cursor") return hookInput.cursor_version;
  if (host === "codex") return hookInput.codex_version ?? hookInput.client_version;
  return hookInput.claude_code_version ?? hookInput.claude_version;
};

const safeToken = (value) =>
  typeof value === "string" && SAFE_TOKEN_RE.test(value) ? value : undefined;

const safeProperties = (event, props) => {
  const hook = safeToken(props.hook);
  if (event === TELEMETRY_EVENTS.SESSION_STARTED) {
    const source = SESSION_SOURCES.has(props.source) ? props.source : "other";
    return {
      ...(hook ? { hook } : {}),
      source,
      ...(safeToken(props.composer_mode)
        ? { composer_mode: props.composer_mode }
        : {}),
      ...(typeof props.is_background_agent === "boolean"
        ? { is_background_agent: props.is_background_agent }
        : {}),
    };
  }
  if (event === TELEMETRY_EVENTS.SUBAGENT_STARTED) {
    return {
      ...(hook ? { hook } : {}),
      ...(safeToken(props.agent_type) ? { agent_type: props.agent_type } : {}),
    };
  }
  if (
    event === TELEMETRY_EVENTS.ROUTING_CONTEXT_EMITTED ||
    event === TELEMETRY_EVENTS.ROUTING_SKIPPED_BARE_CONTINUATION
  ) {
    return hook ? { hook } : {};
  }
  if (event === TELEMETRY_EVENTS.DISCOVERY_LINKED) {
    const queryId = safeToken(props.query_id);
    return {
      ...(hook ? { hook } : {}),
      ...(queryId ? { query_id: queryId } : {}),
    };
  }
  if (event === TELEMETRY_EVENTS.HOOK_ERROR) {
    const errorClass = safeToken(props.error_class);
    return {
      ...(hook ? { hook } : {}),
      ...(errorClass ? { error_class: errorClass } : {}),
    };
  }
  return {};
};

/** @param {{ event: string, hookInput?: object, props?: Record<string, unknown> }} input */
export const buildCapturePayload = (
  { event, hookInput = {}, props = {} },
  env = process.env,
) => {
  const sessionHash = hostSessionHashFromInput(hookInput);
  if (!sessionHash) return undefined;

  const host = detectHost(hookInput, env);
  const hostVersion = hostVersionFromInput(hookInput, host);

  return {
    api_key: env.ARCADE_PLUGIN_POSTHOG_KEY ?? POSTHOG_PROJECT_KEY,
    event,
    distinct_id: sessionHash,
    properties: {
      $lib: TELEMETRY_LIB,
      $process_person_profile: false,
      plugin_version: PLUGIN_VERSION,
      host,
      host_session_hash: sessionHash,
      ...(safeToken(hostVersion) ? { host_version: hostVersion } : {}),
      ...safeProperties(event, props),
    },
  };
};

/** Non-blocking capture. Spawns a detached sender so hooks always exit fast. */
export const recordTelemetry = (
  input,
  { env = process.env, spawnProcess = spawn } = {},
) => {
  if (!isTelemetryEnabled(env)) return false;
  try {
    const payload = buildCapturePayload(input, env);
    if (!payload) return false;
    const child = spawnProcess(
      process.execPath,
      [join(HOOKS_DIR, "telemetry-send.mjs"), JSON.stringify(payload)],
      { detached: true, stdio: "ignore", env },
    );
    child.once?.("error", () => {});
    child.unref?.();
    return true;
  } catch {
    return false;
  }
};
