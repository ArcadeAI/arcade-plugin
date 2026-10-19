import assert from "node:assert/strict";
import { test } from "node:test";
import { SYNC_CONTRACT, desiredTree, entryFromBytes, snapshotProvenance, releaseBranch } from "../scripts/legacy-projection.mjs";
import { syncCommitMessage } from "../scripts/sync-legacy.mjs";
import { verifyProjection, verifyGithubMirror, createGithubReader } from "../scripts/verify-mirror.mjs";

const sourceSha = "a".repeat(40), head = "b".repeat(40), base = "c".repeat(40), later = "d".repeat(40), tag = "v0.8.0";
const files = (input) => new Map(Object.entries(input).map(([path, value]) => [path, entryFromBytes("100644", value)]));
const fixture = () => {
  const sourceFiles = files({ "plugin.json": '{"version":"0.8.0"}', "binary": Buffer.from([0, 255, 128]), ".github/workflows/sync-omnimcp.yml": "must not escape", ...Object.fromEntries(Object.values(SYNC_CONTRACT.replacements).map((path) => [path, `trusted ${path}`])) });
  const baseFiles = files({ "plugin.json": '{"version":"0.7.1"}', "docs/migration/repository-controls.md": "human notice" });
  const candidateFiles = desiredTree({ sourceFiles, destFiles: baseFiles });
  return { sourceFiles, baseFiles, candidateFiles };
};
const event = () => ({ pull_request: { head: { sha: head, ref: releaseBranch(tag), repo: { full_name: SYNC_CONTRACT.destRepo } }, base: { sha: base, ref: "main", repo: { full_name: SYNC_CONTRACT.destRepo } } } });
const readerFor = (f) => ({
  async main(repo = SYNC_CONTRACT.sourceRepo) { return repo === SYNC_CONTRACT.sourceRepo ? later : base; },
  async release() { return { sha: sourceSha, tag }; },
  async isAncestor(repo, ancestor, descendant) { assert.equal(repo, SYNC_CONTRACT.sourceRepo); assert.equal(ancestor, sourceSha); assert.equal(descendant, later); return true; },
  async commit(repo, sha) { assert.equal(repo, SYNC_CONTRACT.destRepo); assert.equal(sha, head); return { message: syncCommitMessage(sourceSha, tag), parents: [{ sha: base }] }; },
  async version(repo) { return repo === SYNC_CONTRACT.sourceRepo ? "0.8.0" : "0.7.1"; },
  async tree(repo, sha) { return repo === SYNC_CONTRACT.sourceRepo ? f.sourceFiles : sha === head ? f.candidateFiles : f.baseFiles; },
});
const check = (f, reader = readerFor(f), e = event()) => verifyGithubMirror({ event: e, repository: SYNC_CONTRACT.destRepo, reader });

test("projection retains explicit exclusions/replacements and preserved controls", () => {
  const f = fixture();
  assert.equal(verifyProjection(f).differences, 0);
  assert.equal(f.candidateFiles.has(".github/workflows/sync-omnimcp.yml"), false);
  assert.equal(f.candidateFiles.has("dev/scripts/sync-version.mjs"), false);
  assert.equal(f.candidateFiles.get(".github/sync-version.mjs"), f.sourceFiles.get("dev/scripts/sync-version.mjs"));
  assert.equal(f.candidateFiles.get("plugin.json"), f.sourceFiles.get("plugin.json"));
});

test("unexpected/missing/content/mode/policy/control changes fail exact data comparison", () => {
  for (const mutate of [
    (m) => m.set("extra", entryFromBytes("100644", "human")), (m) => m.delete("plugin.json"),
    (m) => m.set("plugin.json", entryFromBytes("100644", "changed")),
    (m) => m.set("binary", { ...m.get("binary"), mode: "100755" }),
    ...Object.keys(SYNC_CONTRACT.replacements).map((path) => (m) => m.set(path, entryFromBytes("100644", "return success"))),
    (m) => m.set("docs/migration/repository-controls.md", entryFromBytes("100644", "changed notice")),
  ]) { const f = fixture(); mutate(f.candidateFiles); assert.throws(() => verifyProjection(f), /differs from trusted canonical projection/); }
  const f = fixture(); f.sourceFiles.delete("dev/scripts/sync-version.mjs"); assert.throws(() => verifyProjection(f), /missing/);
});

test("an older released commit remains valid after canonical main advances", async () => {
  const f = fixture(); const result = await check(f);
  assert.equal(result.sourceSha, sourceSha); assert.equal(result.tag, tag);
});

test("only fixed repository, base, branch and a single snapshot parent are accepted", async () => {
  const f = fixture();
  for (const mutate of [
    (e) => { e.pull_request.base.ref = "other"; },
    (e) => { e.pull_request.head.repo.full_name = "attacker/repo"; },
    (e) => { e.pull_request.head.ref = "sync/canonical-main"; },
  ]) { const e = event(); mutate(e); await assert.rejects(check(f, readerFor(f), e)); }
  const reader = readerFor(f), commit = reader.commit;
  reader.commit = async (...args) => ({ ...await commit(...args), parents: [{ sha: base }, { sha: later }] });
  await assert.rejects(check(f, reader), /single owned release snapshot/);
  await assert.rejects(verifyGithubMirror({ event: event(), repository: "attacker/repo", reader: readerFor(f) }), /fixed legacy/);
});

test("unpublished/moved release provenance, unrelated commits and ambiguous trailers fail closed", async () => {
  const f = fixture();
  const wrong = readerFor(f); wrong.release = async () => ({ sha: later, tag });
  await assert.rejects(check(f, wrong), /does not match the published release tag/);
  const unrelated = readerFor(f); unrelated.isAncestor = async () => false;
  await assert.rejects(check(f, unrelated), /not on canonical main/);
  for (const message of ["human", `${syncCommitMessage(sourceSha, tag)}Source-SHA: ${later}\n`, syncCommitMessage(sourceSha, tag).replace(SYNC_CONTRACT.sourceRepo, "attacker/repo")]) assert.throws(() => snapshotProvenance(message));
  const moved = readerFor(f); let count = 0; moved.release = async () => ({ sha: ++count === 1 ? sourceSha : later, tag });
  await assert.rejects(check(f, moved), /tag changed during verification/);
});

test("current actual destination base controls merge safety, not event base SHA", async () => {
  const f = fixture(), e = event(); e.pull_request.base.sha = later;
  assert.equal((await check(f, readerFor(f), e)).base, base);
  const advanced = readerFor(f); advanced.main = async () => later;
  await assert.rejects(check(f, advanced), /main changed since this snapshot/);
  const racing = readerFor(f); let count = 0;
  racing.main = async (repo) => repo === SYNC_CONTRACT.destRepo ? (++count === 1 ? base : later) : later;
  await assert.rejects(check(f, racing), /main advanced during verification/);
});

test("trusted verifier also rejects a downgrade or equal-version altered tree", async () => {
  for (const destinationVersion of ["0.8.1", "0.8.0"]) {
    const f = fixture(), reader = readerFor(f);
    reader.version = async (repo) => repo === SYNC_CONTRACT.sourceRepo ? "0.8.0" : destinationVersion;
    await assert.rejects(check(f, reader));
  }
});

test("GitHub reader resolves published annotated tags and ignores mutable target_commitish", async () => {
  const urls = [];
  const reader = createGithubReader({ fetch: async (url) => {
    urls.push(url);
    const value = url.includes("/releases/") ? { tag_name: tag, published_at: "now", draft: false, prerelease: false, target_commitish: "main" } : url.includes("/git/ref/tags/") ? { object: { type: "tag", sha: head } } : { object: { type: "commit", sha: sourceSha } };
    return { ok: true, json: async () => value };
  } });
  assert.deepEqual(await reader.release(tag), { tag, sha: sourceSha });
  assert.equal(urls.length, 3); assert.ok(urls[2].includes(`/git/tags/${head}`));
});

test("GitHub reader rejects drafts/prereleases, malformed or truncated trees and unknown ancestry", async () => {
  for (const release of [{ tag_name: tag, draft: true, published_at: "now" }, { tag_name: tag, prerelease: true, published_at: "now" }, { tag_name: tag }]) {
    const reader = createGithubReader({ fetch: async () => ({ ok: true, json: async () => release }) });
    await assert.rejects(reader.release(tag), /published stable/);
  }
  for (const tree of [{ truncated: true }, { tree: [{ path: "link", type: "blob", mode: "120000", sha: head }] }]) {
    const reader = createGithubReader({ fetch: async (url) => ({ ok: true, json: async () => url.includes("/git/commits/") ? { tree: { sha: head } } : tree }) });
    await assert.rejects(reader.tree(SYNC_CONTRACT.sourceRepo, sourceSha));
  }
  const reader = createGithubReader({ fetch: async () => ({ ok: true, json: async () => ({ status: "unknown" }) }) });
  await assert.rejects(reader.isAncestor(SYNC_CONTRACT.sourceRepo, sourceSha, head), /cannot establish ancestry/);
});
