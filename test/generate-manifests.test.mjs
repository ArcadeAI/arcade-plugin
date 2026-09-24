import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { generateManifests } from "../scripts/generate-manifests.mjs";
import { makeFixture, readRepoFile } from "./helpers.mjs";

test("committed generated files are current (run npm run generate if not)", () => {
  generateManifests({ check: true });
});

test("check mode fails with a source-naming error when a generated file is hand-edited", () => {
  const root = makeFixture();
  try {
    generateManifests({ root });

    // Each case: edit a file in the fixture, expect an error that names the source.
    const cases = [
      {
        desc: "Cursor manifest",
        edit: (r) => { const p = join(r, ".cursor-plugin/plugin.json"); writeFileSync(p, `${readFileSync(p, "utf8")} `); },
        pattern: /\.cursor-plugin\/plugin\.json is generated from plugin\.json, mcp\.json, and VERSION/,
      },
      {
        desc: "hooks.json",
        edit: (r) => rmSync(join(r, "com.github.copilot/hooks/hooks.json")),
        pattern: /com\.github\.copilot\/hooks\/hooks\.json is generated from hooks\/hook-hosts\.mjs/,
      },
      {
        desc: "Cursor rule",
        edit: (r) => { const p = join(r, "clients/cursor/rules/arcade.mdc"); writeFileSync(p, `${readFileSync(p, "utf8")} `); },
        pattern: /clients\/cursor\/rules\/arcade\.mdc is generated from hooks\/routing-guidance\.mjs/,
      },
      {
        desc: "Copilot operator copy",
        edit: (r) => { const p = join(r, "com.github.copilot/agents/arcade-operator.agent.md"); writeFileSync(p, `${readFileSync(p, "utf8")} `); },
        pattern: /com\.github\.copilot\/agents\/arcade-operator\.agent\.md is a copy of agents\/arcade-operator\.agent\.md/,
      },
      {
        desc: "rules block in try-arcade/SKILL.md",
        edit: (r) => { const p = join(r, "skills/try-arcade/SKILL.md"); writeFileSync(p, readFileSync(p, "utf8").replace("use only arcade", "use any server")); },
        pattern: /skills\/try-arcade\/SKILL\.md: the rules block is generated from hooks\/routing-guidance\.mjs/,
      },
      {
        desc: ".gitattributes stale entry",
        edit: (r) => writeFileSync(join(r, ".gitattributes"), `${readFileSync(join(r, ".gitattributes"), "utf8")}old/file.json linguist-generated=true\n`),
        pattern: /old\/file\.json is no longer generated/,
      },
    ];

    for (const { edit, pattern } of cases) {
      generateManifests({ root });
      edit(root);
      assert.throws(() => generateManifests({ check: true, root }), pattern);
    }
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
