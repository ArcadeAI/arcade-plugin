/** Stable per-machine install id for correlating hook events with gateway telemetry. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const INSTALL_ID_ENV = "ARCADE_PLUGIN_INSTALL_ID";
const STATE_DIR = join(homedir(), ".arcade-plugin");
const STATE_FILE = join(STATE_DIR, "install-id");

let cachedInstallId;

export const resetInstallIdCache = () => {
  cachedInstallId = undefined;
};

export const getInstallId = () => {
  if (cachedInstallId) return cachedInstallId;

  const fromEnv = process.env[INSTALL_ID_ENV]?.trim();
  if (fromEnv) {
    cachedInstallId = fromEnv;
    return cachedInstallId;
  }

  try {
    const existing = readFileSync(STATE_FILE, "utf8").trim();
    if (existing) {
      cachedInstallId = existing;
      return cachedInstallId;
    }
  } catch {
    // First run on this machine.
  }

  const created = randomUUID();
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, `${created}\n`, { encoding: "utf8", flag: "wx" });
    cachedInstallId = created;
    return cachedInstallId;
  } catch {
    try {
      const existing = readFileSync(STATE_FILE, "utf8").trim();
      if (existing) {
        cachedInstallId = existing;
        return cachedInstallId;
      }
    } catch {
      // Fall through to ephemeral id for this process.
    }
    cachedInstallId = created;
    return cachedInstallId;
  }
};
