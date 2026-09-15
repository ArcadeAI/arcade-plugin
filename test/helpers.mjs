import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const readRepoFile = (relativePath) =>
  readFile(path.join(ROOT, relativePath), "utf8");

export const readRepoJson = async (relativePath) =>
  JSON.parse(await readRepoFile(relativePath));

export const runHook = (script, stdin = "", env = {}) => {
  const [scriptPath, ...args] = script.split(" ");
  const result = spawnSync("node", [path.join(ROOT, "hooks", scriptPath), ...args], {
    input: stdin,
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, ARCADE_PLUGIN_TELEMETRY: "0", ...env },
  });

  return result;
};
