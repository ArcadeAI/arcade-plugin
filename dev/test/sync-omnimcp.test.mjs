import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ROOT, readRepoFile } from "./helpers.mjs";

const template = "dev/templates/omnimcp-check.yml";
const workflow = ".github/workflows/check.yml";
const legacyValidator = `name: mirror-integrity

# Canonical template: installed only in the trusted destination base.
# pull_request_target uses the trusted base workflow and checkout. Never
# check out or execute the candidate, install its dependencies, or read its policy.
on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read

jobs:
  mirror-integrity:
    if: github.repository == 'arcadeai-labs/omnimcp'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22.23.2'
      - name: Compare Git data with trusted canonical main
        run: node .github/verify-mirror.mjs --github --token "$GH_TOKEN"
        env:
          GH_TOKEN: \${{ github.token }}
`;
// Files that only matter to this repository and stay out of omnimcp.
const INTERNAL = [
  "release-please-config.json",
  ".release-please-manifest.json",
  "dev/scripts/sync-omnimcp-tree.sh",
  "dev/scripts/configure-omnimcp-tree.mjs",
  "dev/test/sync-omnimcp.test.mjs",
  "dev/scripts/approve-after-bugbot.mjs",
  "dev/test/approve-after-bugbot.test.mjs",
  ".github/CODEOWNERS",
];
const OMNIMCP_PROFILE_INPUTS = [
  "hooks/hook-hosts.mjs",
  "hooks/user-prompt-submit.mjs",
  "hooks/telemetry-adapters/claude-code.mjs",
  "hooks/telemetry-contract.mjs",
  ".claude-plugin/hooks.json",
  "dev/test/fixtures/telemetry/claude-code/hooks.enabled.json",
  "docs/telemetry.md",
  "dev/scripts/telemetry-docs.mjs",
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
  for (const file of INTERNAL) {
    write(source, file, file === "dev/scripts/configure-omnimcp-tree.mjs" ? readRepoFile(file) : "canonical only\n");
  }
  for (const file of OMNIMCP_PROFILE_INPUTS) write(source, file, readRepoFile(file));
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
  f.write(f.dest, workflow, legacyValidator);
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
  symlinkSync(join(f.source, "plugin.json"), join(f.dest, workflow));
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

test("sync projects the SessionStart-only, secret-free Claude directory profile", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(f.dest, ".claude-plugin/hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.hooks), ["SessionStart"]);
  assert.ok(!existsSync(join(f.dest, "hooks/user-prompt-submit.mjs")));
  assert.ok(!existsSync(join(f.dest, "dev/test/fixtures/omnimcp/legacy-check.yml")));
  assert.match(readFileSync(join(f.dest, "hooks/hook-hosts.mjs"), "utf8"), /subagent-start\.mjs", event: "SubagentStart", hosts: \["copilot"\]/);
  assert.match(readFileSync(join(f.dest, "hooks/telemetry-adapters/claude-code.mjs"), "utf8"), /promptReminder: false/);
  assert.match(readFileSync(join(f.dest, "hooks/telemetry-contract.mjs"), "utf8"), /always `false`; this copy does not add one/);

  const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
  for (const file of files(f.dest)) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /secrets\.|github\.token|GH_TOKEN|--token/, file);
  }
});
