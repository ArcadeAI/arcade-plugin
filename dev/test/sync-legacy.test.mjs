import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyGithubMirror } from "../scripts/verify-mirror.mjs";
import { runSync, readGitTree, createGitSource, createGitDestination, liveSyncGate, createGithub, syncPullBody, releaseBranch, SYNC_CONTRACT } from "../scripts/sync-legacy.mjs";

const git = (repo, args, input) => {
  const r = spawnSync("git", args, { cwd: repo, input, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" } });
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
};
const tag = "v0.8.0", branch = releaseBranch(tag);
const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), "release-sync-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceRepo = join(root, "source"), seed = join(root, "seed"), remote = join(root, "destination.git"), clone = join(root, "clone");
  mkdirSync(sourceRepo); mkdirSync(seed);
  for (const repo of [sourceRepo, seed]) git(repo, ["init", "-b", "main"]);
  const file = (repo, path, content) => { mkdirSync(join(repo, path, ".."), { recursive: true }); writeFileSync(join(repo, path), content); };
  file(sourceRepo, "plugin.json", JSON.stringify({ name: "arcade", version: "0.8.0" }));
  file(sourceRepo, "binary.dat", Buffer.from([0, 255, 10, 128]));
  file(sourceRepo, "exec.sh", "#!/bin/sh\necho hi\n");
  for (const path of Object.values(SYNC_CONTRACT.replacements)) file(sourceRepo, path, `source ${path}\n`);
  git(sourceRepo, ["add", "."]); git(sourceRepo, ["update-index", "--chmod=+x", "exec.sh"]); git(sourceRepo, ["commit", "-m", "release"]);
  git(sourceRepo, ["tag", "-a", tag, "-m", "annotated release"]);
  git(sourceRepo, ["remote", "add", "origin", sourceRepo]);
  file(seed, "plugin.json", JSON.stringify({ name: "arcade", version: "0.7.1" }));
  file(seed, "obsolete.txt", "remove me");
  file(seed, "docs/migration/repository-controls.md", "human-owned notice\n");
  git(seed, ["add", "."]); git(seed, ["commit", "-m", "legacy"]);
  git(root, ["clone", "--bare", seed, remote]); git(root, ["clone", "--no-checkout", remote, clone]);
  const sourceSha = git(sourceRepo, ["rev-parse", `${tag}^{commit}`]);
  const base = git(seed, ["rev-parse", "HEAD"]);
  const pulls = [];
  const github = {
    async release(releaseTag) { return { tag_name: releaseTag, draft: false, prerelease: false, published_at: "2026-10-19T00:00:00Z", target_commitish: "deliberately-not-a-sha" }; },
    async pulls() { return pulls; },
    async createPull({ branch: b, sourceSha: s, tag: rt }) {
      const head = git(remote, ["rev-parse", `refs/heads/${b}`]);
      const pull = { number: 1, state: "open", body: syncPullBody(s, rt), head: { ref: b, sha: head, repo: { full_name: SYNC_CONTRACT.destRepo } }, base: { ref: "main", repo: { full_name: SYNC_CONTRACT.destRepo } } };
      pulls.push(pull); return pull;
    },
  };
  const source = createGitSource({ repo: sourceRepo, releases: github });
  const destination = createGitDestination({ repo: clone });
  return { root, sourceRepo, seed, remote, clone, sourceSha, base, github, source, destination, pulls, file, run: () => runSync({ tag, source, destination, github }) };
};

test("published release event is the only live gate", () => {
  const event = { action: "published", release: { tag_name: tag, published_at: "now", draft: false, prerelease: false } };
  const env = { SYNC_LEGACY_APPLY: "1", GITHUB_REPOSITORY: SYNC_CONTRACT.sourceRepo, GITHUB_EVENT_NAME: "release", GITHUB_REF: `refs/tags/${tag}` };
  assert.ok(liveSyncGate(env, event));
  for (const changes of [{ GITHUB_EVENT_NAME: "push" }, { GITHUB_REF: "refs/heads/main" }, { SYNC_LEGACY_APPLY: "0" }, { GITHUB_REPOSITORY: "other/repo" }]) assert.ok(!liveSyncGate({ ...env, ...changes }, event));
  for (const changes of [{ draft: true }, { prerelease: true }, { published_at: null }]) assert.ok(!liveSyncGate(env, { ...event, release: { ...event.release, ...changes } }));
  for (const bad of ["main", "v01.8.0", "v0.8.0-beta.1", "v0.8.0/../../main"]) assert.throws(() => releaseBranch(bad));
});

test("ordinary Git snapshots preserve binary/mode, delete obsolete files, keep human notice and main/history", async (t) => {
  const f = fixture(t), result = await f.run();
  assert.equal(result.action, "create"); assert.equal(result.sourceSha, f.sourceSha);
  assert.equal(git(f.remote, ["rev-parse", "main"]), f.base);
  assert.equal(git(f.remote, ["show", "-s", "--format=%P", branch]), f.base);
  const files = readGitTree(f.remote, branch);
  assert.deepEqual(files.get("binary.dat").bytes, Buffer.from([0, 255, 10, 128]));
  assert.equal(files.get("exec.sh").mode, "100755"); assert.equal(files.has("obsolete.txt"), false);
  assert.equal(files.get("docs/migration/repository-controls.md").bytes.toString(), "human-owned notice\n");
  assert.equal(spawnSync("git", ["cat-file", "-e", f.sourceSha], { cwd: f.remote }).status !== 0, true);
  assert.equal((await f.run()).action, "noop"); assert.equal(f.pulls.length, 1);
});

test("canonical main may advance after release; actual annotated tag selects the snapshot", async (t) => {
  const f = fixture(t);
  f.file(f.sourceRepo, "later.txt", "not released"); git(f.sourceRepo, ["add", "."]); git(f.sourceRepo, ["commit", "-m", "later"]);
  await f.run(); assert.equal(readGitTree(f.remote, branch).has("later.txt"), false);
});

test("draft, prerelease, non-main and moved tags fail before publishing", async (t) => {
  for (const changes of [{ draft: true }, { prerelease: true }, { published_at: null }]) {
    const f = fixture(t), original = f.github.release;
    f.github.release = async (rt) => ({ ...await original(rt), ...changes });
    await assert.rejects(f.run(), /published stable release/); assert.equal(await f.destination.branch(branch), null);
  }
  const f = fixture(t);
  git(f.sourceRepo, ["checkout", "--orphan", "unrelated"]); git(f.sourceRepo, ["commit", "-m", "other"]); git(f.sourceRepo, ["tag", "-f", tag]);
  await assert.rejects(f.run(), /not on canonical main/);
  const g = fixture(t), original = g.source.release; let reads = 0;
  g.source.release = async (rt) => ({ ...await original(rt), sha: ++reads > 1 ? "a".repeat(40) : g.sourceSha });
  await assert.rejects(g.run(), /tag changed/); assert.equal(await g.destination.branch(branch), null);
});

test("downgrades and equal-version changed snapshots cannot create refs or PRs", async (t) => {
  for (const version of ["0.8.1", "0.8.0"]) {
    const f = fixture(t);
    f.file(f.seed, "plugin.json", JSON.stringify({ version })); git(f.seed, ["add", "."]); git(f.seed, ["commit", "-m", "destination release"]);
    git(f.seed, ["push", f.remote, "main"]);
    await assert.rejects(f.run()); assert.equal(await f.destination.branch(branch), null); assert.equal(f.pulls.length, 0);
  }
});

test("unowned/differing existing branches and intentionally closed PRs are never changed or reopened", async (t) => {
  const f = fixture(t); git(f.seed, ["push", f.remote, `main:refs/heads/${branch}`]);
  await assert.rejects(f.run(), /provenance/); assert.equal(git(f.remote, ["rev-parse", branch]), f.base);
  const g = fixture(t); const result = await g.run();
  g.pulls[0].state = "closed";
  assert.equal((await g.run()).action, "closed"); assert.equal(git(g.remote, ["rev-parse", branch]), result.commit); assert.equal(g.pulls.length, 1);
  g.pulls.length = 0; await assert.rejects(g.run(), /retained without a PR/);
  const h = fixture(t); await h.run();
  git(h.seed, ["fetch", h.remote, branch]); git(h.seed, ["checkout", "FETCH_HEAD"]); h.file(h.seed, "human.txt", "human"); git(h.seed, ["add", "."]); git(h.seed, ["commit", "-m", "human work"]); git(h.seed, ["push", h.remote, `HEAD:refs/heads/${branch}`]);
  const human = git(h.remote, ["rev-parse", branch]); await assert.rejects(h.run()); assert.equal(git(h.remote, ["rev-parse", branch]), human);
});

test("destination advance and a concurrent human branch fail without overwriting work", async (t) => {
  const f = fixture(t), snapshot = f.destination.snapshot;
  f.destination.snapshot = async (args) => {
    const commit = await snapshot(args);
    f.file(f.seed, "new-main.txt", "human"); git(f.seed, ["add", "."]); git(f.seed, ["commit", "-m", "main advanced"]); git(f.seed, ["push", f.remote, "main"]);
    return commit;
  };
  await assert.rejects(f.run(), /main changed/); assert.equal(await f.destination.branch(branch), null);
  const g = fixture(t), push = g.destination.push;
  g.destination.push = async (b, c) => { git(g.seed, ["push", g.remote, `main:refs/heads/${branch}`]); return push.call(g.destination, b, c); };
  await assert.rejects(g.run(), /already exists/); assert.equal(git(g.remote, ["rev-parse", branch]), g.base);
});

test("lost accepted PR response is reconciled once; rejected/unknown outcome retains branch for manual review", async (t) => {
  const f = fixture(t), create = f.github.createPull;
  f.github.createPull = async (args) => { await create(args); throw new Error("connection lost"); };
  assert.equal((await f.run()).action, "recovered"); assert.equal(f.pulls.length, 1);
  const g = fixture(t); let attempts = 0;
  g.github.createPull = async () => { attempts++; throw new Error("denied"); };
  await assert.rejects(g.run(), /manual inspection; branch retained/); assert.ok(await g.destination.branch(branch));
  await assert.rejects(g.run(), /retained without a PR/); assert.equal(attempts, 1);
});

test("gh only serves release/PR API with structured request body", async () => {
  const calls = [];
  const github = createGithub({ token: "test", run: (program, args, options) => { calls.push({ program, args, options }); return Buffer.from(args.includes("--input") ? '{"number":1}' : args.some((v) => v.includes("/pulls")) ? "[]" : "{}"); } });
  await github.release(tag); await github.pulls(branch); await github.createPull({ branch, sourceSha: "a".repeat(40), tag });
  assert.equal(calls.length, 3); assert.ok(calls.every(({ program, args }) => program === "gh" && !args.some((a) => /git\/(blobs|trees|commits)/.test(a))));
  assert.equal(JSON.parse(calls[2].options.input).base, "main"); assert.equal(JSON.parse(calls[2].options.input).draft, true);
});


test("real Git release snapshot passes trusted data-only integrity verification", async (t) => {
  const f = fixture(t), result = await f.run();
  const reader = {
    async main(repo = SYNC_CONTRACT.sourceRepo) { return repo === SYNC_CONTRACT.sourceRepo ? f.sourceSha : f.base; },
    async release(rt) { return f.source.release(rt); },
    async isAncestor() { return true; },
    async commit() { const c = await f.destination.commit(result.commit); return { ...c, parents: c.parents.map((s) => ({ sha: s })) }; },
    async tree(repo, rev) { return readGitTree(repo === SYNC_CONTRACT.sourceRepo ? f.sourceRepo : f.remote, rev); },
    async version(repo, rev) { return JSON.parse(readGitTree(repo === SYNC_CONTRACT.sourceRepo ? f.sourceRepo : f.remote, rev).get("plugin.json").bytes).version; },
  };
  const verified = await verifyGithubMirror({ repository: SYNC_CONTRACT.destRepo, reader, event: { pull_request: { head: f.pulls[0].head, base: f.pulls[0].base } } });
  assert.equal(verified.differences, 0); assert.equal(verified.sourceSha, f.sourceSha);
});
