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
  const result = spawnSync("node", [path.join(ROOT, "hooks", script)], {
    input: stdin,
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, ...env },
  });

  return result;
};
