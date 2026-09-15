/** Local zero-egress hook health spool. Complements PostHog funnel telemetry. */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getInstallId } from "./install-id.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_FRAMES = 5;

const reportDir = () => join(homedir(), ".arcade-plugin", "self-reports");
const PLUGIN_VERSION = readFileSync(join(ROOT, "VERSION"), "utf8").trim();

export const isSelfReportEnabled = () => {
  const raw = process.env.ARCADE_PLUGIN_SELF_REPORT;
  if (raw === undefined || raw === "") return true;
  const normalized = raw.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
};

const errorClassFrom = (error) => {
  if (error instanceof Error) return error.name || "Error";
  if (typeof error === "string") return "Error";
  return "UnknownError";
};

const detectHost = (hookInput) => {
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

const sanitizeToken = (value) => {
  if (typeof value !== "string" || !value) return "unknown";
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
};

const pluginFrames = (stack) => {
  if (typeof stack !== "string") return undefined;
  const home = homedir();
  const frames = stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /arcade-plugin[/\\]hooks[/\\]/.test(line))
    .map((line) => line.replaceAll(home, "~"))
    .slice(0, MAX_FRAMES);
  return frames.length ? frames : undefined;
};

/** @param {{ hookInput?: object, hook: string, error: unknown }} input */
export const recordSelfReport = ({ hookInput = {}, hook, error }) => {
  if (!isSelfReportEnabled()) return;
  try {
    const reports = reportDir();
    mkdirSync(reports, { recursive: true });
    const record = {
      ts: new Date().toISOString(),
      install_id: getInstallId(),
      plugin_version: PLUGIN_VERSION,
      host: detectHost(hookInput),
      hook: sanitizeToken(hook),
      error_class: errorClassFrom(error),
    };
    if (error instanceof Error) {
      const frames = pluginFrames(error.stack);
      if (frames) record.frames = frames;
    }
    const day = record.ts.slice(0, 10);
    appendFileSync(join(reports, `${day}.jsonl`), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Self-report must never surface errors to the host.
  }
};
