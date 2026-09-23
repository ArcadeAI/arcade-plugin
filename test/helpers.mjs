import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COPIED_FILES, FILES_WITH_GENERATED_RULES } from "../scripts/generate-manifests.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const readRepoFile = (relativePath) =>
  readFileSync(path.join(ROOT, relativePath), "utf8");

export const runHook = (script, input = {}, args = []) =>
  spawnSync("node", [path.join(ROOT, "hooks", script), ...args], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });

/** A temp copy of the generator's source files, for tests that write. */
export const makeFixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), "arcade-plugin-"));
  const sources = ["VERSION", "plugin.json", "mcp.json", ...Object.keys(FILES_WITH_GENERATED_RULES), ...Object.values(COPIED_FILES)];
  for (const file of sources) {
    cpSync(path.join(ROOT, file), path.join(root, file));
  }
  return root;
};
