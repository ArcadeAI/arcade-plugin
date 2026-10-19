import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SYNC_CONTRACT, desiredTree, entryFromBytes } from "../scripts/legacy-projection.mjs";
import { sourceProvenance, verifyProjection, verifyGithubMirror, createGithubReader } from "../scripts/verify-mirror.mjs";

const sourceSha = "a".repeat(40), head = "b".repeat(40), base = "c".repeat(40);
const files = (input) => new Map(Object.entries(input).map(([p, bytes]) => [p, entryFromBytes("100644", bytes)]));
const source = () => files({
  "plugin.json": '{"name":"arcade","version":"0.7.0"}\n',
  ".github/workflows/check.yml": "full source validation and review\n",
  ".github/workflows/release-please.yml": "release\n",
  ".github/workflows/sync-legacy.yml": "active sync must not escape\n",
  "sync/destination-check.yml": "trusted base integrity workflow\n",
  "scripts/legacy-projection.mjs": "trusted projection policy\n",
  "scripts/verify-mirror.mjs": "trusted verifier\n",
  "scripts/sync-legacy.mjs": "inert sync\n",
  "test/mirror-integrity.test.mjs": "canonical regression tests\n",
  "docs/migration/legacy-sync.md": "canonical controls\n",
});
const event = () => ({ pull_request: { head: { sha: head }, base: { sha: base, ref: "main", repo: { full_name: SYNC_CONTRACT.destRepo } } } });
const fixture = () => {
  const sourceFiles = source(), baseFiles = files({ "docs/migration/repository-controls.md": "trusted base notice\n" });
  return { sourceFiles, baseFiles, candidateFiles: desiredTree({ sourceFiles, destFiles: baseFiles }) };
};
const readerFor = (f) => ({
  async main() { return sourceSha; },
  async commit(repo, sha) { assert.equal(repo, SYNC_CONTRACT.destRepo); assert.equal(sha, head); return { message: `mirror\n\nSource-SHA: ${sourceSha}\n` }; },
  async tree(repo, sha) {
    if (repo === SYNC_CONTRACT.sourceRepo && sha === sourceSha) return f.sourceFiles;
    assert.equal(repo, SYNC_CONTRACT.destRepo);
    if (sha === head) return f.candidateFiles;
    assert.equal(sha, base); return f.baseFiles;
  },
});

test("projection replaces all canonical workflows and keeps package identity unchanged", () => {
  const f = fixture();
  assert.equal(verifyProjection(f).differences, 0);
  assert.equal(f.candidateFiles.get("plugin.json"), f.sourceFiles.get("plugin.json"));
  assert.equal(f.candidateFiles.get(".github/workflows/check.yml"), f.sourceFiles.get("sync/destination-check.yml"));
  for (const path of [".github/workflows/release-please.yml", ".github/workflows/sync-legacy.yml", "scripts/sync-legacy.mjs"]) assert.equal(f.candidateFiles.has(path), false);
});

test("unexpected, missing, changed, or executable-mode files fail exact comparison", () => {
  for (const mutate of [
    (m) => m.set("extra.mjs", entryFromBytes("100644", "unexpected")),
    (m) => m.delete("plugin.json"),
    (m) => m.set("plugin.json", entryFromBytes("100644", '{"name":"other"}')),
    (m) => m.set("plugin.json", { ...m.get("plugin.json"), mode: "100755" }),
    (m) => m.set(".github/verify-mirror.mjs", entryFromBytes("100644", "process.exit(0)")),
    (m) => m.set(".github/legacy-projection.mjs", entryFromBytes("100644", "exclude everything")),
    (m) => m.set(".github/workflows/check.yml", entryFromBytes("100644", "skip this check")),
    (m) => m.set("docs/migration/repository-controls.md", entryFromBytes("100644", "candidate-controlled notice")),
  ]) {
    const f = fixture(); mutate(f.candidateFiles);
    assert.throws(() => verifyProjection(f), /differs from trusted canonical projection/);
  }
});

test("candidate-owned source manifests cannot choose another expected tree", async () => {
  const f = fixture();
  f.candidateFiles.set("mirror.json", entryFromBytes("100644", JSON.stringify({ sourceSha: head, sourceRepo: "attacker/repo", exclude: ["*"] })));
  await assert.rejects(verifyGithubMirror({ event: event(), repository: SYNC_CONTRACT.destRepo, reader: readerFor(f) }), /differs from trusted canonical projection/);
});

test("candidate source trailers cannot override external canonical main", async () => {
  const reader = readerFor(fixture());
  reader.commit = async () => ({ message: `Source-SHA: ${head}\n` });
  reader.tree = async () => { throw new Error("must not read a candidate-selected tree"); };
  await assert.rejects(verifyGithubMirror({ event: event(), repository: SYNC_CONTRACT.destRepo, reader }), /not current trusted canonical main/);
});

test("nonmirror human PRs and ambiguous provenance require explicit review", () => {
  assert.throws(() => sourceProvenance("human change"), /human changes need explicit review/);
  assert.throws(() => sourceProvenance(`Source-SHA: ${sourceSha}\nSource-SHA: ${head}\n`), /ambiguous/);
  assert.equal(sourceProvenance(`Source-SHA: ${sourceSha}\n`), sourceSha);
});

test("only fixed repository/main is accepted and a source advance fails closed", async () => {
  const f = fixture();
  assert.equal((await verifyGithubMirror({ event: event(), repository: SYNC_CONTRACT.destRepo, reader: readerFor(f) })).sourceSha, sourceSha);
  await assert.rejects(verifyGithubMirror({ event: event(), repository: "attacker/repo", reader: readerFor(f) }), /fixed legacy repository main/);
  const otherBase = event(); otherBase.pull_request.base.ref = "release";
  await assert.rejects(verifyGithubMirror({ event: otherBase, repository: SYNC_CONTRACT.destRepo, reader: readerFor(f) }), /fixed legacy repository main/);
  const reader = readerFor(f); let reads = 0;
  reader.main = async () => ++reads === 1 ? sourceSha : head;
  await assert.rejects(verifyGithubMirror({ event: event(), repository: SYNC_CONTRACT.destRepo, reader }), /advanced during verification/);
});

test("missing canonical checker assets block bootstrap", () => {
  const f = fixture(); f.sourceFiles.delete("scripts/verify-mirror.mjs");
  assert.throws(() => verifyProjection(f), /canonical source is not ready/);
});

test("GitHub reader refuses truncated trees and symlinks", async () => {
  for (const tree of [{ truncated: true }, { tree: [{ path: "evil", mode: "120000", type: "blob", sha: head }] }]) {
    const reader = createGithubReader({ fetch: async (url) => ({ ok: true, async json() { return url.includes("/git/commits/") ? { tree: { sha: sourceSha } } : tree; } }) });
    await assert.rejects(reader.tree(SYNC_CONTRACT.sourceRepo, sourceSha), /truncated|unsupported mirror entry/);
  }
});

test("GitHub reader refuses submodules", async () => {
  const tree = { tree: [{ path: "vendor/lib", mode: "160000", type: "commit", sha: head }] };
  const reader = createGithubReader({ fetch: async (url) => ({ ok: true, async json() { return url.includes("/git/commits/") ? { tree: { sha: sourceSha } } : tree; } }) });
  await assert.rejects(reader.tree(SYNC_CONTRACT.sourceRepo, sourceSha), /unsupported mirror entry vendor\/lib/);
});

test("destination runs only trusted base code and source checks remain full", () => {
  const workflow = readFileSync(new URL("../sync/destination-check.yml", import.meta.url), "utf8");
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.base.sha \}\}/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /head\.sha|head\.ref|github\.head_ref|refs\/pull\/|merge_commit_sha|npm |Bugbot|matrix:|secrets\./);
  const canonical = readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8");
  for (const check of ["verify:claude", "verify:cursor", "verify:codex", "verify:copilot", "Require Cursor Bugbot"]) assert.ok(canonical.includes(check));
});

test("local pinned verification reads Git data without executing candidate files", () => {
  const work = mkdtempSync(join(tmpdir(), "mirror-integrity-"));
  const git = (repo, args) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const init = (name, entries) => {
    const repo = join(work, name); mkdirSync(repo);
    git(repo, ["init", "-b", "main"]); git(repo, ["config", "user.name", "Test"]); git(repo, ["config", "user.email", "test@example.com"]);
    for (const [path, entry] of entries) { mkdirSync(join(repo, path, ".."), { recursive: true }); writeFileSync(join(repo, path), entry.bytes); }
    git(repo, ["add", "."]); git(repo, ["commit", "-m", "base"]); return repo;
  };
  // Each candidate script writes this marker if anything imports or runs it.
  const marker = join(work, "candidate-executed");
  const tripwire = entryFromBytes("100644", `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "executed\\n");\n`);
  try {
    const sourceFiles = source();
    for (const path of ["candidate.mjs", "scripts/verify-mirror.mjs", "scripts/legacy-projection.mjs"]) sourceFiles.set(path, tripwire);
    sourceFiles.set("package\twith\nseparators.txt", entryFromBytes("100644", "trusted file with literal separators"));
    const sourceRepo = init("source", sourceFiles); const sha = git(sourceRepo, ["rev-parse", "HEAD"]);
    const baseFiles = files({ "old.txt": "legacy" }); const dest = init("dest", baseFiles); const baseSha = git(dest, ["rev-parse", "HEAD"]);
    rmSync(join(dest, "old.txt"));
    for (const [path, entry] of desiredTree({ sourceFiles, destFiles: baseFiles })) { mkdirSync(join(dest, path, ".."), { recursive: true }); writeFileSync(join(dest, path), entry.bytes); }
    git(dest, ["add", "."]); git(dest, ["commit", "-m", `mirror\n\nSource-SHA: ${sha}`]); const destSha = git(dest, ["rev-parse", "HEAD"]);
    const result = spawnSync(process.execPath, [new URL("../scripts/verify-mirror.mjs", import.meta.url).pathname, "--source", sourceRepo, "--dest", dest, "--source-sha", sha, "--head", destSha, "--base", baseSha], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).differences, 0);
    const checker = ".github/verify-mirror.mjs";
    git(dest, ["mv", checker, `${checker}\tmissing`]);
    git(dest, ["commit", "-m", `rename checker\n\nSource-SHA: ${sha}`]);
    const renamed = git(dest, ["rev-parse", "HEAD"]);
    const rejected = spawnSync(process.execPath, [new URL("../scripts/verify-mirror.mjs", import.meta.url).pathname, "--source", sourceRepo, "--dest", dest, "--source-sha", sha, "--head", renamed, "--base", baseSha], { encoding: "utf8" });
    assert.equal(rejected.status, 1, "a tab-suffixed checker rename must not pass bootstrap verification");
    assert.match(rejected.stderr, /differs from trusted canonical projection/);
    assert.ok(rejected.stderr.includes("verify-mirror.mjs\\tmissing"), rejected.stderr);
    assert.equal(existsSync(marker), false, "the checker executed a candidate file");
    spawnSync(process.execPath, [join(dest, "candidate.mjs")]);
    assert.equal(existsSync(marker), true, "the candidate file must write the marker when it runs");
  } finally { rmSync(work, { recursive: true, force: true }); }
});
