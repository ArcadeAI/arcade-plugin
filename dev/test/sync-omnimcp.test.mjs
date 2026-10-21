import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ROOT, readRepoFile } from "./helpers.mjs";

const template = "dev/templates/omnimcp-check.yml";
const legacy = "dev/test/fixtures/omnimcp/legacy-check.yml";
const workflow = ".github/workflows/check.yml";
// Files that only matter to this repository and stay out of omnimcp.
const INTERNAL = [
  "release-please-config.json",
  ".release-please-manifest.json",
  "dev/scripts/sync-omnimcp-tree.sh",
  "dev/test/sync-omnimcp.test.mjs",
  "dev/scripts/approve-after-bugbot.mjs",
  "dev/test/approve-after-bugbot.test.mjs",
  ".github/CODEOWNERS",
];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "omnimcp-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source");
  const dest = join(root, "dest");
  const write = (tree, file, content) => {
    mkdirSync(join(tree, file, ".."), { recursive: true });
    writeFileSync(join(tree, file), content);
  };
  write(source, template, readRepoFile(template));
  write(source, ".github/workflows/release-please.yml", "canonical release automation\n");
  write(source, ".github/workflows/sync-omnimcp.yml", "canonical sync automation\n");
  write(source, "plugin.json", "new release\n");
  write(source, "README.md", "canonical README\n");
  write(source, "CHANGELOG.md", "canonical changelog\n");
  for (const file of INTERNAL) write(source, file, "canonical only\n");
  write(dest, "plugin.json", "old release\n");
  write(dest, "README.md", "omnimcp listing README\n");
  write(dest, "CHANGELOG.md", "omnimcp changelog\n");
  write(dest, ".release-please-manifest.json", "old manifest\n");
  write(dest, ".github/CODEOWNERS", "@ArcadeAI/engineering\n");
  write(dest, ".github/verify-mirror.mjs", "obsolete verifier\n");
  write(dest, ".github/workflows/custom.yml", "custom destination CI\n");
  write(dest, "docs/migration/repository-controls.md", "notes about the old mirror check\n");
  return {
    source, dest, write,
    run: () => spawnSync("bash", [join(ROOT, "dev/scripts/sync-omnimcp-tree.sh"), source, dest], { encoding: "utf8" }),
  };
}

test("sync replaces the deployed legacy validator and preserves destination-owned files", (t) => {
  const f = fixture(t);
  cpSync(join(ROOT, legacy), join(f.dest, workflow));
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(f.dest, workflow), "utf8"), readRepoFile(template));
  assert.equal(readFileSync(join(f.dest, "plugin.json"), "utf8"), "new release\n");
  assert.equal(readFileSync(join(f.dest, ".github/workflows/custom.yml"), "utf8"), "custom destination CI\n");
  assert.ok(!existsSync(join(f.dest, "docs/migration/repository-controls.md")));
  assert.equal(readFileSync(join(f.dest, "README.md"), "utf8"), "omnimcp listing README\n");
  assert.equal(readFileSync(join(f.dest, "CHANGELOG.md"), "utf8"), "omnimcp changelog\n");
  assert.ok(!existsSync(join(f.dest, ".github/verify-mirror.mjs")));
  for (const file of INTERNAL) assert.ok(!existsSync(join(f.dest, file)), file);
  for (const file of ["release-please.yml", "sync-omnimcp.yml"]) {
    assert.ok(!existsSync(join(f.dest, ".github/workflows", file)), file);
  }
  assert.equal(f.run().status, 0, "repeating the same projection must succeed");
  assert.equal(readFileSync(join(f.dest, workflow), "utf8"), readRepoFile(template));
});

test("sync installs a validator when absent and repeats safely", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  assert.equal(f.run().status, 0);
  assert.equal(readFileSync(join(f.dest, workflow), "utf8"), readRepoFile(template));
});

test("sync upgrades its previously installed template but refuses local workflow edits", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const nextTemplate = readRepoFile(template).replace("timeout-minutes: 10", "timeout-minutes: 11");
  assert.notEqual(nextTemplate, readRepoFile(template));
  f.write(f.source, template, nextTemplate);
  const upgrade = f.run();
  assert.equal(upgrade.status, 0, upgrade.stderr);
  assert.equal(readFileSync(join(f.dest, workflow), "utf8"), nextTemplate);
  assert.equal(readFileSync(join(f.dest, template), "utf8"), nextTemplate);
  assert.equal(f.run().status, 0, "repeating an upgraded template must succeed");

  f.write(f.dest, workflow, nextTemplate.replace("npm test", "npm run custom-check"));
  f.write(f.source, "plugin.json", "later release\n");
  const edited = f.run();
  assert.notEqual(edited.status, 0);
  assert.match(edited.stderr, /Refusing to replace unfamiliar/);
  assert.equal(readFileSync(join(f.dest, "plugin.json"), "utf8"), "new release\n");
  assert.equal(readFileSync(join(f.dest, workflow), "utf8"), nextTemplate.replace("npm test", "npm run custom-check"));
});

test("sync refuses unfamiliar or non-regular validators before copying the tree", (t) => {
  const f = fixture(t);
  f.write(f.dest, workflow, "a destination owner's edited check\n");
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to replace unfamiliar/);
  assert.equal(readFileSync(join(f.dest, workflow), "utf8"), "a destination owner's edited check\n");
  assert.equal(readFileSync(join(f.dest, "plugin.json"), "utf8"), "old release\n");
  assert.ok(existsSync(join(f.dest, ".github/verify-mirror.mjs")));

  rmSync(join(f.dest, workflow));
  symlinkSync(join(ROOT, legacy), join(f.dest, workflow));
  assert.match(f.run().stderr, /Refusing to replace non-regular/);
  assert.equal(readFileSync(join(f.dest, "plugin.json"), "utf8"), "old release\n");
});

test("a saved custom template or a managed marker alone does not authorize replacement", (t) => {
  const f = fixture(t);
  const custom = "name: destination-custom\n";
  f.write(f.dest, workflow, custom);
  f.write(f.dest, template, custom);
  assert.match(f.run().stderr, /Refusing to replace unfamiliar/);

  const marked = readRepoFile(template).replace("npm test", "npm run custom-check");
  f.write(f.dest, workflow, marked);
  f.write(f.dest, template, readRepoFile(template));
  assert.match(f.run().stderr, /Refusing to replace unfamiliar/);

  rmSync(join(f.dest, template));
  f.write(f.source, "previous.yml", marked);
  symlinkSync(join(f.source, "previous.yml"), join(f.dest, template));
  assert.match(f.run().stderr, /Refusing to replace unfamiliar/);
  assert.equal(readFileSync(join(f.dest, "plugin.json"), "utf8"), "old release\n");
});
