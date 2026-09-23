import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { generateManifests } from "../scripts/generate-manifests.mjs";
import { makeFixture, readRepoFile } from "./helpers.mjs";

test("committed generated files are current (run npm run generate if not)", () => {
  generateManifests({ check: true });
});

test("check mode fails on a hand edit to a generated file or rules block", () => {
  const root = makeFixture();
  try {
    generateManifests({ root });
    generateManifests({ check: true, root });

    const manifest = join(root, ".cursor-plugin/plugin.json");
    writeFileSync(manifest, `${readFileSync(manifest, "utf8")} `);
    assert.throws(() => generateManifests({ check: true, root }), /\.cursor-plugin\/plugin\.json is out of date/);

    generateManifests({ root });
    const skill = join(root, "skills/try-arcade/SKILL.md");
    writeFileSync(skill, readFileSync(skill, "utf8").replace("use only arcade", "use any server"));
    assert.throws(() => generateManifests({ check: true, root }), /skills\/try-arcade\/SKILL\.md is out of date/);

    generateManifests({ root });
    rmSync(join(root, "com.github.copilot/hooks/hooks.json"));
    assert.throws(() => generateManifests({ check: true, root }), /com\.github\.copilot\/hooks\/hooks\.json is out of date/);

    generateManifests({ root });
    writeFileSync(join(root, ".gitattributes"), `${readFileSync(join(root, ".gitattributes"), "utf8")}old/file.json linguist-generated=true\n`);
    assert.throws(() => generateManifests({ check: true, root }), /old\/file\.json is no longer generated/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Mirrors what release-please does with release-please-config.json.
test("a release-please version bump leaves generated files in sync", () => {
  const root = makeFixture();
  const config = JSON.parse(readRepoFile("release-please-config.json")).packages["."];
  try {
    generateManifests({ root });
    writeFileSync(join(root, config["version-file"]), "9.9.9\n");
    for (const { path, jsonpath } of config["extra-files"]) {
      const file = join(root, path);
      const document = JSON.parse(readFileSync(file, "utf8"));
      const keys = jsonpath.replace(/^\$\./, "").replace(/\[(\d+)\]/g, ".$1").split(".");
      const last = keys.pop();
      keys.reduce((node, key) => node[key], document)[last] = "9.9.9";
      writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    }
    generateManifests({ check: true, root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
