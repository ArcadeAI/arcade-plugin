import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  CLAUDE_CODE_CLI_VERSION,
  CI_NODE_VERSION,
  ENDPOINT,
  MCP_REMOTE_PACKAGE,
  PLUGINS_CLI_VERSION,
} from "../scripts/constants.mjs";
import { generateManifests } from "../scripts/generate-manifests.mjs";
import { VERSIONED_MANIFESTS, readVersion } from "../scripts/version.mjs";
import { readRepoFile, readRepoJson, ROOT } from "./helpers.mjs";

test("mcp-remote pin is consistent across Claude Desktop config", async () => {
  const config = await readRepoFile("clients/claude-desktop/claude_desktop_config.json");

  assert.match(config, new RegExp(MCP_REMOTE_PACKAGE.replace(".", "\\.")));
  assert.match(config, new RegExp(ENDPOINT.replace(/\./g, "\\.")));
});

test("adapter manifest versions match VERSION", async () => {
  const version = readVersion(ROOT);

  for (const path of VERSIONED_MANIFESTS) {
    const manifest = await readRepoJson(path);
    assert.equal(manifest.version, version, `${path} version drift`);
  }

  const marketplace = await readRepoJson(".claude-plugin/marketplace.json");
  assert.equal(
    marketplace.plugins?.[0]?.version,
    version,
    ".claude-plugin/marketplace.json plugins[0] version drift",
  );
});

const releaseExtraFiles = [
  ["plugin.json", "$.version"],
  [".cursor-plugin/plugin.json", "$.version"],
  [".claude-plugin/plugin.json", "$.version"],
  [".claude-plugin/marketplace.json", "$.version"],
  [".claude-plugin/marketplace.json", "$.plugins[0].version"],
];

const setJsonPath = (document, jsonPath, value) => {
  const segments = jsonPath
    .replace(/^\$\./, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".");
  const property = segments.pop();
  let target = document;
  for (const segment of segments) target = target[segment];
  target[property] = value;
};

test("release-please config bumps every version-bearing manifest", async () => {
  const config = await readRepoJson("release-please-config.json");
  const pkg = config.packages?.["."];

  assert.equal(pkg?.["version-file"], "VERSION");
  assert.deepEqual(
    pkg?.["extra-files"]?.map(({ path, jsonpath }) => [path, jsonpath]),
    releaseExtraFiles,
  );

  const workflow = await readRepoFile(".github/workflows/release-please.yml");
  assert.match(workflow, /release-please-action@v4/);
});

test("a release-style version bump leaves generated manifests in sync", async () => {
  const root = mkdtempSync(join(tmpdir(), "arcade-release-"));
  const config = await readRepoJson("release-please-config.json");
  const extraFiles = config.packages["."]["extra-files"];

  try {
    for (const file of [
      "VERSION",
      "plugin.json",
      "mcp.json",
      "agents/arcade-operator.agent.md",
      "skills/try-arcade/SKILL.md",
      "docs/telemetry.md",
    ]) {
      if (file.includes("/")) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
      }
      copyFileSync(join(ROOT, file), join(root, file));
    }
    generateManifests({ root });

    const nextVersion = "9.9.9";
    writeFileSync(join(root, "VERSION"), `${nextVersion}\n`);
    for (const { path, jsonpath } of extraFiles) {
      const target = join(root, path);
      const document = JSON.parse(readFileSync(target, "utf8"));
      setJsonPath(document, jsonpath, nextVersion);
      writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
    }

    generateManifests({ check: true, root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CI toolchain versions are pinned in package.json", async () => {
  const packageJson = await readRepoJson("package.json");
  assert.equal(packageJson.devDependencies?.plugins, PLUGINS_CLI_VERSION);
  assert.equal(
    packageJson.devDependencies?.["@anthropic-ai/claude-code"],
    CLAUDE_CODE_CLI_VERSION,
  );
  assert.equal(packageJson.engines?.node, CI_NODE_VERSION);
  assert.equal(packageJson.scripts?.generate, "node scripts/generate-manifests.mjs");
  assert.equal(
    packageJson.scripts?.["generate:check"],
    "node scripts/generate-manifests.mjs --check",
  );
  assert.equal(packageJson.scripts?.["verify:discover"], "plugins discover .");
  assert.equal(
    packageJson.scripts?.["verify:claude"],
    "claude plugin validate . --strict",
  );
  assert.match(packageJson.scripts?.verify, /generate:check/);

  const workflow = await readRepoFile(".github/workflows/check.yml");
  assert.match(workflow, new RegExp(`node-version: "${CI_NODE_VERSION}"`));
});
