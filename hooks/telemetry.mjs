/** Optional plugin-side telemetry. Fire-and-forget PostHog capture via p.arcade.dev. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getInstallId } from "./install-id.mjs";
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
};

export const PLUGIN_VERSION = readFileSync(join(ROOT, "VERSION"), "utf8").trim();

export const isTelemetryEnabled = () => {
  const raw = process.env.ARCADE_PLUGIN_TELEMETRY;
  if (raw === undefined || raw === "") return true;
  const normalized = raw.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
};

export const bucketPromptLength = (length) => {
  if (length <= 0) return "0";
  if (length <= 20) return "1-20";
  if (length <= 100) return "21-100";
  if (length <= 500) return "101-500";
  return "501+";
};

export const hashDistinctId = (sessionKey) => {
  const material = String(sessionKey ?? "unknown");
  const digest = createHash("sha256").update(`arcade-plugin:${material}`).digest("hex");
  return `plugin:${digest.slice(0, 32)}`;
};

export const detectHost = (hookInput) => {
  if (!hookInput || typeof hookInput !== "object") return "claude";
  if (
    "conversation_id" in hookInput ||
    "workspace_roots" in hookInput ||
    "cursor_version" in hookInput
  ) {
    return "cursor";
  }
  if ("turn_id" in hookInput) return "codex";
  return "claude";
};

export const sessionKeyFromInput = (hookInput) => {
  if (!hookInput || typeof hookInput !== "object") return "unknown";
  return (
    hookInput.session_id ??
    hookInput.conversation_id ??
    hookInput.sessionId ??
    "unknown"
  );
};

export const hostVersionFromInput = (hookInput, host) => {
  if (!hookInput || typeof hookInput !== "object") return undefined;
  if (host === "cursor") return hookInput.cursor_version;
  if (host === "codex") return hookInput.codex_version ?? hookInput.client_version;
  return hookInput.claude_code_version ?? hookInput.claude_version;
};

/** @param {{ event: string, hookInput?: object, props?: Record<string, unknown> }} input */
export const buildCapturePayload = ({ event, hookInput = {}, props = {} }) => {
  const host = detectHost(hookInput);
  const distinctId = hashDistinctId(sessionKeyFromInput(hookInput));
  const hostVersion = hostVersionFromInput(hookInput, host);

  return {
    api_key: process.env.ARCADE_PLUGIN_POSTHOG_KEY ?? POSTHOG_PROJECT_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      $lib: TELEMETRY_LIB,
      plugin_version: PLUGIN_VERSION,
      install_id: getInstallId(),
      host,
      ...(hostVersion ? { host_version: hostVersion } : {}),
      ...props,
    },
  };
};

/** Non-blocking capture. Spawns a detached sender so hooks always exit fast. */
export const recordTelemetry = (input) => {
  if (!isTelemetryEnabled()) return;
  const payload = buildCapturePayload(input);
  const child = spawn(
    process.execPath,
    [join(HOOKS_DIR, "telemetry-send.mjs"), JSON.stringify(payload)],
    { detached: true, stdio: "ignore", env: process.env },
  );
  child.unref();
};
