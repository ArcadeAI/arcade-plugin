/** Opt-out plugin-side telemetry. Fire-and-forget PostHog capture via p.arcade.dev. */

import { createHash, randomUUID } from "node:crypto";
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
  PROMPT_SUBMITTED: "Plugin prompt submitted",
  SUBAGENT_STARTED: "Plugin subagent started",
  ROUTING_CONTEXT_EMITTED: "Plugin routing context emitted",
  ROUTING_SKIPPED_BARE_CONTINUATION: "Plugin routing skipped bare continuation",
  HOOK_ERROR: "Plugin hook error",
  ARCADE_TOOL_CALLED: "Plugin arcade tool called",
  ARCADE_TOOL_FAILED: "Plugin arcade tool failed",
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
const PROMPT_BUCKETS = new Set(["0", "1-20", "21-100", "101-500", "501+"]);
const SESSION_SOURCES = new Set(["startup", "resume", "clear", "compact"]);

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

/** Extract an Arcade tool name while rejecting events from another MCP server. */
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

export const bucketPromptLength = (length) => {
  if (length <= 0) return "0";
  if (length <= 20) return "1-20";
  if (length <= 100) return "21-100";
  if (length <= 500) return "101-500";
  return "501+";
};

export const hashDistinctId = (sessionKey = randomUUID()) => {
  const material = String(sessionKey);
  const digest = createHash("sha256").update(`arcade-plugin:${material}`).digest("hex");
  return `plugin:${digest.slice(0, 32)}`;
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
  if (event === TELEMETRY_EVENTS.PROMPT_SUBMITTED) {
    return {
      ...(hook ? { hook } : {}),
      ...(PROMPT_BUCKETS.has(props.prompt_length_bucket)
        ? { prompt_length_bucket: props.prompt_length_bucket }
        : {}),
      ...(typeof props.routing_injected === "boolean"
        ? { routing_injected: props.routing_injected }
        : {}),
      ...(typeof props.is_continuation === "boolean"
        ? { is_continuation: props.is_continuation }
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
  if (event === TELEMETRY_EVENTS.HOOK_ERROR) {
    const errorClass = safeToken(props.error_class);
    return {
      ...(hook ? { hook } : {}),
      ...(errorClass ? { error_class: errorClass } : {}),
    };
  }
  if (
    event === TELEMETRY_EVENTS.ARCADE_TOOL_CALLED ||
    event === TELEMETRY_EVENTS.ARCADE_TOOL_FAILED
  ) {
    const toolName = normalizeArcadeToolName(props.tool_name);
    const outcome = ["success", "failure"].includes(props.outcome)
      ? props.outcome
      : undefined;
    return {
      ...(toolName ? { tool_name: toolName } : {}),
      ...(outcome ? { outcome } : {}),
    };
  }
  return {};
};

/** @param {{ event: string, hookInput?: object, props?: Record<string, unknown> }} input */
export const buildCapturePayload = (
  { event, hookInput = {}, props = {} },
  env = process.env,
) => {
  const host = detectHost(hookInput, env);
  const distinctId = hashDistinctId(sessionKeyFromInput(hookInput));
  const hostVersion = hostVersionFromInput(hookInput, host);

  return {
    api_key: env.ARCADE_PLUGIN_POSTHOG_KEY ?? POSTHOG_PROJECT_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      $lib: TELEMETRY_LIB,
      $process_person_profile: false,
      plugin_version: PLUGIN_VERSION,
      host,
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
