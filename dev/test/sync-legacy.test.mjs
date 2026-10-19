import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  SYNC_CONTRACT,
  createGithubDestination,
  desiredTree,
  diffTrees,
  entryFromBytes,
  gitBlobSha,
  githubRefPath,
  isExcluded,
  liveSyncGate,
  readGitTree,
  reportSyncResult,
  repositoryControlsDocument,
  runSync as syncRun,
  createGitSource,
  syncCommitMessage,
  syncPullBody,
  syncPullTitle,
  selectSyncPull,
} from "../scripts/sync-legacy.mjs";
import { verifyGithubMirror, sourceProvenance } from "../scripts/verify-mirror.mjs";

const SOURCE_SHA = "a".repeat(40);
const NEXT_SHA = "b".repeat(40);
const SCRIPT = fileURLToPath(new URL("../scripts/sync-legacy.mjs", import.meta.url));

const git = (repo, args, options = {}) => {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
};

const initRepo = (files) => {
  const repo = mkdtempSync(join(tmpdir(), "sync-legacy-"));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "sync-test@example.com"]);
  git(repo, ["config", "user.name", "Sync Test"]);
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(repo, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, contents);
  }
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-m", "base"]);
  return repo;
};

const controls = () => repositoryControlsDocument();

/**
 * Destination port backed by local git refs. Pull requests stay in `pulls`.
 * `compareAndSwap` refuses `main` and `master`.
 */
const createGitDestination = ({ repo, pulls, failCreate = false, failSwap = false }) => ({
  async getBranchSha(branch) {
    const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: repo,
      encoding: "utf8",
    });
    if (result.status !== 0) return null;
    return result.stdout.trim() || null;
  },
  async readFiles(sha) {
    return readGitTree(repo, sha);
  },
  async getCommit(sha) {
    return { message: git(repo, ["show", "-s", "--format=%B", sha]),
      parents: git(repo, ["show", "-s", "--format=%P", sha]).trim().split(" ").filter(Boolean) };
  },
  async isAncestor(ancestor, descendant) {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: repo });
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new Error("cannot establish destination ancestry");
  },
  async createCommit({ parent, files, message }) {
    const index = join(tmpdir(), `sync-index-${randomUUID()}`);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const run = (args, input) => {
      const result = spawnSync("git", args, { cwd: repo, env, input, maxBuffer: 32 * 1024 * 1024 });
      if (result.status !== 0) {
        throw new Error(result.stderr?.toString() || `git ${args.join(" ")} failed`);
      }
      return result.stdout;
    };
    try {
      run(["read-tree", "--empty"]);
      for (const [path, entry] of files) {
        if (!entry.bytes) throw new Error(`${path} has no bytes to commit`);
        const blob = run(["hash-object", "-w", "--stdin"], entry.bytes).toString().trim();
        run(["update-index", "--add", `--cacheinfo`, `${entry.mode},${blob},${path}`]);
      }
      const tree = run(["write-tree"]).toString().trim();
      return git(repo, ["commit-tree", tree, "-p", parent, "-m", message]).trim();
    } finally {
      rmSync(index, { force: true });
    }
  },
  async compareAndSwap({ branch, from, to }) {
    if (branch === "main" || branch === "master") {
      throw new Error(`refusing to update protected branch ${branch}`);
    }
    if (failSwap) throw new Error("mock ref update failed");
    if (to === null) throw new Error("automation never deletes a review branch");
    git(repo, ["update-ref", `refs/heads/${branch}`, to, from ?? "0".repeat(40)]);
  },
  async findOpenPull(branch, contract = SYNC_CONTRACT) {
    return selectSyncPull(pulls.filter((pull) => pull.branch === branch && pull.state === "open"), branch, contract);
  },
  async createPull({ branch, base, title, body, draft }) {
    if (failCreate) throw new Error("mock pull create failed");
    const pull = { number: pulls.length + 1, branch, base, title, body, draft, state: "open", headRepo: SYNC_CONTRACT.destRepo, baseRepo: SYNC_CONTRACT.destRepo };
    pulls.push(pull);
    return pull;
  },
  async updatePull({ number, title, body }) {
    const pull = pulls.find((item) => item.number === number);
    if (!pull) throw new Error(`pull ${number} not found`);
    if (pull.state !== "open") throw new Error(`pull ${number} is not open`);
    pull.title = title;
    pull.body = body;
  },
});

const sourceFrom = (files) => new Map(Object.entries(files).map(([path, contents]) => [path, entryFromBytes("100644", contents)]));

// The core requires an explicit canonical reader. Small snapshot fixtures use
// deterministic ancestry; the regression below also exercises real Git ancestry.
const snapshots = new Map();
const runSync = (args) => {
  snapshots.set(args.sourceSha, args.sourceFiles);
  const source = args.source ?? {
    async getBranchSha() { return args.sourceSha; },
    async isAncestor(a, b) { return a === b || a === SOURCE_SHA && b === NEXT_SHA; },
    async readFiles(sha) { if (!snapshots.has(sha)) throw new Error("unknown canonical snapshot"); return snapshots.get(sha); },
  };
  return syncRun({ ...args, source });
};

const run = async (repo, sourceFiles, { pulls = [], sourceSha = SOURCE_SHA, sourceMessage = "", failCreate = false, failSwap = false, contract } = {}) => {
  const before = git(repo, ["rev-parse", "main"]).trim();
  const destination = createGitDestination({ repo, pulls, failCreate, failSwap });
  try {
    const result = await runSync({
      sourceFiles,
      sourceSha,
      sourceMessage,
      destination,
      contract,
    });
    return { result, pulls, before };
  } finally {
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), before);
  }
};

test("githubRefPath encodes a slash in a nested branch", () => {
  assert.equal(githubRefPath("main"), "heads/main");
  assert.equal(githubRefPath("sync/canonical-main"), "heads/sync%2Fcanonical-main");
});

test("gitBlobSha matches git hash-object", () => {
  const repo = initRepo({ "hello.txt": "hello\n" });
  try {
    const expected = git(repo, ["hash-object", "hello.txt"]).trim();
    assert.equal(gitBlobSha(Buffer.from("hello\n")), expected);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("desired tree drops repository controls and keeps the destination notice", () => {
  const source = sourceFrom({
    "plugin.json": "{\"version\":\"0.7.0\"}\n",
    ".github/workflows/release-please.yml": "name: release\n",
    "dev/scripts/sync-legacy.mjs": "export {}\n",
    "dev/test/sync-legacy.test.mjs": "test\n",
    "sync/legacy-sync.workflow.yml": "name: sync-legacy\n",
    "docs/migration/legacy-sync.md": "inert\n",
    "docs/install/cursor.md": "install\n",
  });
  const dest = new Map([[SYNC_CONTRACT.preserve[0], entryFromBytes("100644", "keep me\n")]]);
  const desired = desiredTree({ sourceFiles: source, destFiles: dest });
  assert.deepEqual([...desired.keys()].sort(), [
    "docs/install/cursor.md",
    "docs/migration/repository-controls.md",
    "plugin.json",
  ]);
  assert.equal(desired.get(SYNC_CONTRACT.preserve[0]).bytes.toString(), "keep me\n");
  assert.equal(isExcluded(".github/workflows/release-please.yml"), true);
  assert.equal(isExcluded(".github/workflows/check.yml"), true);
});

test("diff reports additions, changes, deletions, and no-op", () => {
  const current = sourceFrom({ "same.txt": "same\n", "old.txt": "old\n", "changed.txt": "before\n" });
  const desired = sourceFrom({ "same.txt": "same\n", "changed.txt": "after\n", "new.txt": "new\n" });
  const plan = diffTrees(current, desired);
  assert.deepEqual(plan.additions, ["new.txt"]);
  assert.deepEqual(plan.changes, ["changed.txt"]);
  assert.deepEqual(plan.deletions, ["old.txt"]);
  assert.equal(plan.noop, false);
  assert.equal(diffTrees(desired, desired).noop, true);
});

test("a mirror commit adds files without moving main", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls() });
  try {
    const source = sourceFrom({ "pkg/added.txt": "added\n" });
    const { result, pulls } = await run(repo, source);
    assert.equal(result.action, "create");
    assert.equal(result.plan.additions.includes("pkg/added.txt"), true);
    assert.equal(pulls.length, 1);
    assert.equal(pulls[0].draft, true);
    assert.match(pulls[0].body, new RegExp(`Source-SHA: ${SOURCE_SHA}`));
    const synced = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    assert.equal(git(repo, ["rev-parse", `${synced}^`]).trim(), git(repo, ["rev-parse", "main"]).trim());
    assert.equal(git(repo, ["show", `${synced}:pkg/added.txt`]), "added\n");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a mirror commit changes and deletes files and leaves main intact", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "before\n",
    "obsolete.txt": "gone\n",
  });
  const main = git(repo, ["rev-parse", "main"]).trim();
  try {
    const source = sourceFrom({ "pkg/file.txt": "after\n" });
    const { result } = await run(repo, source);
    assert.deepEqual(result.plan.changes, ["pkg/file.txt"]);
    assert.deepEqual(result.plan.deletions, ["obsolete.txt"]);
    const synced = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    assert.equal(git(repo, ["show", `${synced}:pkg/file.txt`]), "after\n");
    const missing = spawnSync("git", ["cat-file", "-e", `${synced}:obsolete.txt`], { cwd: repo });
    assert.notEqual(missing.status, 0);
    assert.equal(git(repo, ["show", `${main}:obsolete.txt`]), "gone\n");
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), main);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("matching trees are a no-op and a second run does not open another pull", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "same\n",
  });
  try {
    const source = sourceFrom({ "pkg/file.txt": "same\n" });
    const pulls = [];
    const first = await run(repo, source, { pulls });
    assert.equal(first.result.action, "noop");
    assert.equal(pulls.length, 0);
    assert.notEqual(spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${SYNC_CONTRACT.syncBranch}`], { cwd: repo }).status, 0);

    const seeded = await run(repo, sourceFrom({ "pkg/file.txt": "v1\n" }), { pulls });
    assert.equal(seeded.result.action, "create");
    const head = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    const second = await run(repo, sourceFrom({ "pkg/file.txt": "v1\n" }), { pulls, sourceSha: SOURCE_SHA });
    assert.equal(second.result.action, "noop");
    assert.equal(second.result.pr, 1);
    assert.equal(pulls.length, 1);
    assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), head);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a closed unmerged sync pull with a matching branch is blocked and does not reopen", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "base\n",
  });
  const main = git(repo, ["rev-parse", "main"]).trim();
  try {
    const pulls = [];
    const created = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls });
    assert.equal(created.result.action, "create");
    pulls[0].state = "closed";
    const retained = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    const blocked = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls });
    assert.equal(blocked.result.action, "blocked");
    assert.equal(blocked.result.outcome, "action-required");
    assert.equal(blocked.result.pr, null);
    assert.equal(blocked.result.plan.noop, true);
    assert.equal(blocked.result.basePlan.noop, false);
    assert.match(blocked.result.reason, /Action required:/);
    assert.match(blocked.result.reason, new RegExp(retained));
    assert.match(blocked.result.reason, /no open pull request/);
    assert.match(blocked.result.recovery, /leave it closed/);
    assert.match(blocked.result.recovery, /by hand/);
    assert.match(blocked.result.recovery, /Do not reopen a deliberately closed pull request/);
    assert.equal(pulls.length, 1);
    assert.equal(pulls[0].state, "closed");
    assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), retained);
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), main);
    const repeat = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls });
    assert.equal(repeat.result.action, "blocked");
    assert.equal(pulls.length, 1);
    assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), retained);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("blocked recovery gives the exact pull request title and body that later runs accept", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "base\n",
  });
  try {
    const pulls = [];
    await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls });
    pulls[0].state = "closed";
    const blocked = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls });
    assert.equal(blocked.result.action, "blocked");
    const handOpened = blocked.result.recovery.match(/\n\nTitle:\n(.+)\n\nBody:\n([\s\S]*)$/);
    assert.ok(handOpened, blocked.result.recovery);
    const [, title, body] = handOpened;
    assert.equal(title, syncPullTitle(SOURCE_SHA));
    assert.equal(body, syncPullBody(SOURCE_SHA));
    // The GitHub web form submits a pull request body with CRLF line endings.
    pulls.push({ number: 2, branch: SYNC_CONTRACT.syncBranch, base: "main", title, body: body.replaceAll("\n", "\r\n"),
      draft: true, state: "open", headRepo: SYNC_CONTRACT.destRepo, baseRepo: SYNC_CONTRACT.destRepo });
    const next = await run(repo, sourceFrom({ "pkg/file.txt": "v2\n" }), { pulls, sourceSha: NEXT_SHA });
    assert.equal(next.result.action, "update");
    assert.equal(next.result.pr, 2);
    assert.equal(pulls[1].body, syncPullBody(NEXT_SHA));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a failed pull create on an existing branch is blocked on retry without a new pull", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "base\n",
  });
  try {
    const pulls = [];
    await run(repo, sourceFrom({ "pkg/file.txt": "v1\n" }), { pulls });
    git(repo, ["merge", "--no-ff", SYNC_CONTRACT.syncBranch, "-m", "merge sync"]);
    pulls[0].state = "closed";
    const main = git(repo, ["rev-parse", "main"]).trim();
    const failed = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls, sourceSha: NEXT_SHA, failCreate: true });
    assert.equal(failed.result.action, "blocked");
    assert.equal(pulls.length, 1);
    const retained = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    assert.notEqual(retained, main);
    assert.equal(git(repo, ["show", `${retained}:pkg/file.txt`]), "synced\n");
    const destination = createGitDestination({ repo, pulls });
    let commits = 0;
    let pullsCreated = 0;
    let swaps = 0;
    destination.createCommit = async () => {
      commits += 1;
      throw new Error("retry must not create a commit");
    };
    destination.createPull = async () => {
      pullsCreated += 1;
      throw new Error("retry must not create a pull");
    };
    destination.compareAndSwap = async () => {
      swaps += 1;
      throw new Error("retry must not move a branch");
    };
    const blocked = await runSync({
      sourceFiles: sourceFrom({ "pkg/file.txt": "synced\n" }),
      sourceSha: NEXT_SHA,
      destination,
    });
    assert.equal(blocked.action, "blocked");
    assert.equal(blocked.outcome, "action-required");
    assert.equal(blocked.pr, null);
    assert.equal(commits, 0);
    assert.equal(pullsCreated, 0);
    assert.equal(swaps, 0);
    assert.equal(pulls.length, 1);
    assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), retained);
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), main);
    const again = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls, sourceSha: NEXT_SHA });
    assert.equal(again.result.action, "blocked");
    assert.equal(pulls.length, 1);
    assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), retained);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a sync branch merged by squash or rebase is blocked instead of building a conflicting pull", async () => {
  for (const mergeBy of ["squash", "rebase"]) {
    const repo = initRepo({
      "docs/migration/repository-controls.md": controls(),
      "a.txt": "legacy\n",
      "b.txt": "legacy\n",
    });
    try {
      const pulls = [];
      await run(repo, sourceFrom({ "a.txt": "A1\n", "b.txt": "B1\n" }), { pulls });
      const retained = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
      if (mergeBy === "squash") {
        git(repo, ["merge", "--squash", SYNC_CONTRACT.syncBranch]);
        git(repo, ["commit", "-m", "squash sync"]);
      } else {
        // GitHub's rebase merge sets itself as committer, so the new commit on
        // main never has the branch head's SHA.
        git(repo, ["cherry-pick", retained], { env: { ...process.env, GIT_COMMITTER_NAME: "GitHub", GIT_COMMITTER_EMAIL: "noreply@github.com" } });
      }
      pulls[0].state = "closed";
      const main = git(repo, ["rev-parse", "main"]).trim();
      const destination = createGitDestination({ repo, pulls });
      destination.createCommit = async () => { throw new Error("must not create a commit"); };
      destination.compareAndSwap = async () => { throw new Error("must not move a branch"); };
      destination.createPull = async () => { throw new Error("must not open a pull request"); };
      for (const [sourceSha, files] of [[SOURCE_SHA, { "a.txt": "A1\n", "b.txt": "B1\n" }], [NEXT_SHA, { "a.txt": "A2\n", "b.txt": "B1\n" }]]) {
        const result = await runSync({ sourceFiles: sourceFrom(files), sourceSha, destination });
        assert.equal(result.action, "blocked", `${mergeBy} ${sourceSha}`);
        assert.equal(result.outcome, "action-required");
        assert.equal(result.syncSha, retained);
        assert.equal(result.baseSha, main);
        assert.match(result.recovery, /merged by squash or rebase/);
        assert.match(result.recovery, new RegExp(`Delete ${SYNC_CONTRACT.syncBranch} by hand`));
        assert.match(result.recovery, /Automatically delete head branches/);
      }
      assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), retained);
      assert.equal(git(repo, ["rev-parse", "main"]).trim(), main);
      assert.equal(pulls.length, 1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test("a merged destination base stays a no-op when the sync branch is retained", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "base\n",
  });
  try {
    const pulls = [];
    const created = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls });
    assert.equal(created.result.action, "create");
    const retained = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    git(repo, ["merge", "--no-ff", SYNC_CONTRACT.syncBranch, "-m", "merge sync"]);
    const merged = git(repo, ["rev-parse", "main"]).trim();
    assert.notEqual(merged, retained);
    pulls[0].state = "closed";
    const again = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls });
    assert.equal(again.result.action, "noop");
    assert.equal(again.result.pr, null);
    assert.equal(pulls.length, 1);
    assert.equal(pulls[0].state, "closed");
    assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), retained);
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), merged);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("an edit to the destination-only notice on main does not block the next sync", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "base\n",
  });
  try {
    const pulls = [];
    await run(repo, sourceFrom({ "pkg/file.txt": "v1\n" }), { pulls });
    git(repo, ["merge", "--no-ff", SYNC_CONTRACT.syncBranch, "-m", "merge sync"]);
    pulls[0].state = "closed";
    writeFileSync(join(repo, "docs/migration/repository-controls.md"), `${controls()}\nOwner note.\n`);
    git(repo, ["commit", "-am", "edit repository controls"]);
    const next = await run(repo, sourceFrom({ "pkg/file.txt": "v2\n" }), { pulls, sourceSha: NEXT_SHA });
    assert.equal(next.result.action, "create");
    // The destination check fails a pull request whose head does not contain main.
    assert.equal(git(repo, ["show", "-s", "--format=%P", SYNC_CONTRACT.syncBranch]).trim(), git(repo, ["rev-parse", "main"]).trim());
    assert.equal(git(repo, ["show", `${SYNC_CONTRACT.syncBranch}:pkg/file.txt`]), "v2\n");
    assert.equal(git(repo, ["show", `${SYNC_CONTRACT.syncBranch}:docs/migration/repository-controls.md`]), `${controls()}\nOwner note.\n`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("an open sync pull advances head and body provenance together", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "base\n",
  });
  try {
    const pulls = [];
    const created = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls });
    assert.equal(created.result.action, "create");
    const retained = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    pulls[0].body = pulls[0].body.replace(`Source-SHA: ${SOURCE_SHA}`, `Source-SHA: ${"c".repeat(40)}`);
    const refreshed = await run(repo, sourceFrom({ "pkg/file.txt": "synced\n" }), { pulls, sourceSha: NEXT_SHA });
    assert.equal(refreshed.result.action, "update-provenance");
    assert.equal(refreshed.result.pr, 1);
    assert.equal(pulls.length, 1);
    assert.match(pulls[0].body, new RegExp(`Source-SHA: ${NEXT_SHA}`));
    const refreshedHead = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    assert.notEqual(refreshedHead, retained);
    assert.equal(git(repo, ["rev-parse", `${refreshedHead}^`]).trim(), retained);
    assert.equal(sourceProvenance(git(repo, ["show", "-s", "--format=%B", refreshedHead])), NEXT_SHA);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("an existing sync pull is updated in place", async () => {
  const repo = initRepo({
    "docs/migration/repository-controls.md": controls(),
    "pkg/file.txt": "v1\n",
  });
  try {
    const pulls = [];
    const created = await run(repo, sourceFrom({ "pkg/file.txt": "v1\n", "extra.txt": "one\n" }), { pulls });
    assert.equal(created.result.action, "create");
    const updated = await run(repo, sourceFrom({ "pkg/file.txt": "v2\n" }), { pulls, sourceSha: NEXT_SHA });
    assert.equal(updated.result.action, "update");
    assert.equal(updated.result.pr, created.result.pr);
    assert.equal(pulls.length, 1);
    assert.match(pulls[0].body, new RegExp(`Source-SHA: ${NEXT_SHA}`));
    assert.equal(git(repo, ["show", `${SYNC_CONTRACT.syncBranch}:pkg/file.txt`]), "v2\n");
    const missing = spawnSync("git", ["cat-file", "-e", `${SYNC_CONTRACT.syncBranch}:extra.txt`], { cwd: repo });
    assert.notEqual(missing.status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a failed pull create retains the review branch and does not write main", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls(), "pkg/file.txt": "base\n" });
  const main = git(repo, ["rev-parse", "main"]).trim();
  try {
    const failed = await run(repo, sourceFrom({ "pkg/file.txt": "changed\n" }), { failCreate: true });
    assert.equal(failed.result.action, "blocked");
    assert.match(failed.result.reason, /mock pull create failed/);
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), main);
    const branch = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${SYNC_CONTRACT.syncBranch}`], { cwd: repo });
    assert.equal(branch.status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a failed pull update keeps the fast-forward and does not open a second pull", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls(), "pkg/file.txt": "v1\n" });
  const main = git(repo, ["rev-parse", "main"]).trim();
  try {
    const pulls = [];
    const created = await run(repo, sourceFrom({ "pkg/file.txt": "v1\n", "extra.txt": "one\n" }), { pulls });
    assert.equal(created.result.action, "create");
    const destination = createGitDestination({ repo, pulls });
    destination.updatePull = async () => {
      throw new Error("mock pull update failed");
    };
    const failed = await runSync({ sourceFiles: sourceFrom({ "pkg/file.txt": "v2\n" }), sourceSha: NEXT_SHA, destination });
    assert.equal(failed.action, "blocked");
    assert.match(failed.reason, /mock pull update failed/);
    assert.equal(pulls.length, 1);
    assert.equal(git(repo, ["show", `${SYNC_CONTRACT.syncBranch}:pkg/file.txt`]), "v2\n");
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), main);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a failed ref update does not open a pull request", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls() });
  try {
    const pulls = [];
    await assert.rejects(run(repo, sourceFrom({ "pkg/file.txt": "x\n" }), { pulls, failSwap: true }), /mock ref update failed/);
    assert.equal(pulls.length, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("protected branches and sync markers do not write", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls(), "pkg/file.txt": "base\n" });
  const main = git(repo, ["rev-parse", "main"]).trim();
  try {
    await assert.rejects(
      run(repo, sourceFrom({ "pkg/file.txt": "x\n" }), { contract: { ...SYNC_CONTRACT, syncBranch: "main" } }),
      /protected branch/,
    );
    const pulls = [];
    const skipped = await run(repo, sourceFrom({ "pkg/file.txt": "x\n" }), {
      pulls,
      sourceMessage: "sync: mirror\n\nLegacy-Sync-Commit: true\n",
    });
    assert.equal(skipped.result.action, "skip");
    assert.equal(pulls.length, 0);
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), main);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a source message that only quotes the sync marker still syncs", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls(), "pkg/file.txt": "base\n" });
  try {
    const pulls = [];
    const synced = await run(repo, sourceFrom({ "pkg/file.txt": "x\n" }), {
      pulls,
      sourceMessage: "docs: explain the `Legacy-Sync-Commit: true` trailer\n",
    });
    assert.equal(synced.result.action, "create");
    assert.equal(pulls.length, 1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("release-please is absent from the synced tree", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls() });
  try {
    const source = sourceFrom({
      "plugin.json": "{\"version\":\"0.7.0\"}\n",
      ".github/workflows/release-please.yml": "name: Release Please\n",
      ".github/workflows/check.yml": "name: check\n",
      "sync/destination-check.yml": "name: mirror-integrity\n",
    });
    await run(repo, source);
    const synced = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    assert.equal(git(repo, ["show", `${synced}:.github/workflows/check.yml`]), "name: mirror-integrity\n");
    const release = spawnSync("git", ["cat-file", "-e", `${synced}:.github/workflows/release-please.yml`], { cwd: repo });
    assert.notEqual(release.status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("--plan prints a diff and does not update refs", () => {
  const source = initRepo({ "plugin.json": "{\"version\":\"0.7.0\"}\n" });
  const dest = initRepo({ "docs/migration/repository-controls.md": controls(), "obsolete.txt": "old\n" });
  const main = git(dest, ["rev-parse", "main"]).trim();
  try {
    const result = spawnSync(process.execPath, [SCRIPT, "--plan", "--source", source, "--dest", dest], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.action, "plan");
    assert.deepEqual(plan.deletions, ["obsolete.txt"]);
    assert.equal(plan.additions.includes("plugin.json"), true);
    assert.equal(git(dest, ["rev-parse", "main"]).trim(), main);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
});

test("live apply stays inert for pull requests, branch pushes, and a missing opt-in", () => {
  assert.equal(liveSyncGate({ GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/heads/main", SYNC_LEGACY_APPLY: "1" }).ok, false);
  assert.equal(liveSyncGate({ GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/feature", SYNC_LEGACY_APPLY: "1" }).ok, false);
  assert.equal(liveSyncGate({ GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" }).ok, false);
  assert.equal(liveSyncGate({ GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", SYNC_LEGACY_APPLY: "1" }).ok, true);

  for (const env of [
    { GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/1/merge", SYNC_LEGACY_APPLY: "1", LEGACY_SYNC_TOKEN: "token" },
    { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/cursor/task", SYNC_LEGACY_APPLY: "1", LEGACY_SYNC_TOKEN: "token" },
    { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", LEGACY_SYNC_TOKEN: "token" },
  ]) {
    const result = spawnSync(process.execPath, [SCRIPT, "--apply"], { encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /inert|SYNC_LEGACY_APPLY/);
  }
});

test("--apply without a token refuses before any GitHub call", () => {
  const result = spawnSync(process.execPath, [SCRIPT, "--apply"], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      SYNC_LEGACY_APPLY: "1",
      LEGACY_SYNC_TOKEN: "",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /LEGACY_SYNC_TOKEN/);
});

test("the staged workflow is outside active workflow paths and cannot trigger on pull requests", () => {
  const root = join(import.meta.dirname, "../..");
  const workflow = readFileSync(join(root, "sync/legacy-sync.workflow.yml"), "utf8");
  const activeYaml = workflow
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.equal(spawnSync("test", ["-e", join(root, ".github/workflows/sync-legacy.yml")]).status, 1);
  assert.match(activeYaml, /branches: \[main\]/);
  assert.doesNotMatch(activeYaml, /pull_request/);
  assert.doesNotMatch(activeYaml, /workflow_dispatch/);
  assert.match(activeYaml, /contents: read/);
  for (const name of readdirSync(join(root, ".github/workflows"))) {
    const text = readFileSync(join(root, ".github/workflows", name), "utf8");
    assert.doesNotMatch(text, /sync-legacy/);
    assert.doesNotMatch(text, /LEGACY_SYNC_TOKEN/);
  }
  const doc = readFileSync(join(root, "docs/migration/legacy-sync.md"), "utf8");
  for (const path of [...SYNC_CONTRACT.exclude, ...SYNC_CONTRACT.preserve]) {
    assert.equal(doc.includes(path), true, path);
  }
});

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() {
    return body === undefined ? "" : JSON.stringify(body);
  },
});

test("the GitHub client creates one draft pull and never writes main", async () => {
  const calls = [];
  const mainSha = "1".repeat(40);
  const blobSha = "2".repeat(40);
  const treeSha = "3".repeat(40);
  const commitSha = "4".repeat(40);
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/git/ref/heads/main") && options.method === "GET") {
      return jsonResponse(200, { object: { sha: mainSha, type: "commit" } });
    }
    if (url.endsWith("/git/ref/heads/sync%2Fcanonical-main") && options.method === "GET") return jsonResponse(404);
    if (url.endsWith(`/git/commits/${mainSha}`)) return jsonResponse(200, { tree: { sha: treeSha } });
    if (url.includes("/git/trees/") && options.method === "GET") {
      return jsonResponse(200, { truncated: false, tree: [{ path: "old.txt", mode: "100644", type: "blob", sha: blobSha }] });
    }
    if (url.endsWith("/git/blobs")) return jsonResponse(201, { sha: "5".repeat(40) });
    if (url.endsWith("/git/trees") && options.method === "POST") return jsonResponse(201, { sha: "6".repeat(40) });
    if (url.endsWith("/git/commits") && options.method === "POST") return jsonResponse(201, { sha: commitSha });
    if (url.endsWith("/git/refs") && options.method === "POST") return jsonResponse(201, {});
    if (url.includes("/pulls?") && options.method === "GET") return jsonResponse(200, []);
    if (url.endsWith("/pulls") && options.method === "POST") return jsonResponse(201, { number: 7 });
    return jsonResponse(500, { message: `unexpected ${options.method} ${url}` });
  };
  const destination = createGithubDestination({ repo: "arcadeai-labs/omnimcp", token: "test-token", fetch, sleep: async () => {} });
  const result = await runSync({
    sourceFiles: sourceFrom({ "plugin.json": "{\"version\":\"0.7.0\"}\n" }),
    sourceSha: SOURCE_SHA,
    destination,
  });
  assert.equal(result.action, "create");
  assert.equal(result.pr, 7);
  const writes = calls.filter((call) => call.method !== "GET");
  assert.equal(writes.some((call) => call.url.includes("heads/main")), false);
  const pull = writes.find((call) => call.method === "POST" && call.url.endsWith("/pulls"));
  assert.equal(pull.body.draft, true);
  assert.equal(pull.body.base, "main");
  assert.equal(pull.body.head, SYNC_CONTRACT.syncBranch);
  const ref = writes.find((call) => call.method === "POST" && call.url.endsWith("/git/refs"));
  assert.equal(ref.body.ref, "refs/heads/sync/canonical-main");
  assert.equal(
    calls.some((call) => call.method === "GET" && call.url.endsWith("/git/ref/heads/sync%2Fcanonical-main")),
    true,
  );
  assert.equal(
    calls.some((call) => call.method === "GET" && call.url.includes("head=arcadeai-labs:sync%2Fcanonical-main")),
    true,
  );
  assert.equal(writes.filter((call) => call.method === "POST" && call.url.endsWith("/pulls")).length, 1);
});

test("a failed GitHub pull create never deletes a possibly accepted review head", async () => {
  const calls = [];
  const mainSha = "1".repeat(40);
  const createdSha = "4".repeat(40);
  let syncSha = null;
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/git/ref/heads/main") && options.method === "GET") {
      return jsonResponse(200, { object: { sha: mainSha } });
    }
    if (url.endsWith("/git/ref/heads/sync%2Fcanonical-main") && options.method === "GET") {
      return syncSha ? jsonResponse(200, { object: { sha: syncSha } }) : jsonResponse(404);
    }
    if (url.includes("/git/commits/")) return jsonResponse(200, { tree: { sha: "3".repeat(40) } });
    if (url.includes("/git/trees/") && options.method === "GET") return jsonResponse(200, { truncated: false, tree: [] });
    if (url.endsWith("/git/blobs")) return jsonResponse(201, { sha: "5".repeat(40) });
    if (url.endsWith("/git/trees") && options.method === "POST") return jsonResponse(201, { sha: "6".repeat(40) });
    if (url.endsWith("/git/commits") && options.method === "POST") return jsonResponse(201, { sha: createdSha });
    if (url.endsWith("/git/refs") && options.method === "POST") {
      syncSha = createdSha;
      return jsonResponse(201, {});
    }
    if (url.includes("/pulls?") && options.method === "GET") return jsonResponse(200, []);
    if (url.endsWith("/pulls") && options.method === "POST") return jsonResponse(500, { message: "no" });
    if (options.method === "DELETE" && url.endsWith("/git/refs/heads/sync%2Fcanonical-main")) {
      syncSha = null;
      return jsonResponse(204);
    }
    return jsonResponse(500, { message: `unexpected ${options.method} ${url}` });
  };
  const destination = createGithubDestination({ repo: "arcadeai-labs/omnimcp", token: "test-token", fetch, sleep: async () => {} });
  const failed = await runSync({ sourceFiles: sourceFrom({ "plugin.json": "{}\n" }), sourceSha: SOURCE_SHA, destination });
  assert.equal(failed.action, "blocked");
  assert.match(failed.reason, /GitHub POST .*\/pulls failed: 500/);
  assert.equal(calls.some((call) => call.url.includes("heads/main") && call.method !== "GET"), false);
  assert.equal(calls.filter((call) => call.method === "POST" && call.url.endsWith("/pulls")).length, 1);
  assert.equal(calls.some((call) => call.method === "DELETE"), false);
  assert.equal(syncSha, createdSha);
});

test("a blocked result is a failed delivery and a no-op is not", () => {
  const out = [];
  const err = [];
  const sink = (chunks) => ({
    write(text) {
      chunks.push(text);
    },
  });
  const blocked = {
    action: "blocked",
    outcome: "action-required",
    reason: "Action required: retained branch",
    recovery: "Open one draft pull request by hand. Do not reopen a deliberately closed pull request.",
  };
  assert.equal(reportSyncResult(blocked, { stdout: sink(out), stderr: sink(err) }), 1);
  assert.match(out.join(""), /"action": "blocked"/);
  assert.match(err.join(""), /Action required: retained branch/);
  assert.match(err.join(""), /by hand/);
  const quiet = [];
  assert.equal(reportSyncResult({ action: "noop", pr: null }, { stdout: sink(quiet), stderr: sink([]) }), 0);
  assert.match(quiet.join(""), /"action": "noop"/);
});

test("the GitHub client blocks a retained matching branch without writes", async () => {
  const calls = [];
  const mainSha = "1".repeat(40);
  const syncSha = "8".repeat(40);
  const mainTree = "3".repeat(40);
  const syncTree = "6".repeat(40);
  const plugin = entryFromBytes("100644", "{\"version\":\"0.7.0\"}\n");
  const notice = entryFromBytes("100644", repositoryControlsDocument());
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/git/ref/heads/main") && options.method === "GET") return jsonResponse(200, { object: { sha: mainSha } });
    if (url.endsWith("/git/ref/heads/sync%2Fcanonical-main") && options.method === "GET") {
      return jsonResponse(200, { object: { sha: syncSha } });
    }
    if (url.endsWith(`/git/commits/${mainSha}`)) return jsonResponse(200, { tree: { sha: mainTree } });
    if (url.endsWith(`/git/commits/${syncSha}`)) return jsonResponse(200, { tree: { sha: syncTree }, message: syncCommitMessage(SOURCE_SHA), parents: [{sha: mainSha}] });
    if (url.includes(`/git/trees/${mainTree}`)) {
      return jsonResponse(200, { truncated: false, tree: [{ path: "old.txt", mode: "100644", type: "blob", sha: "2".repeat(40) }] });
    }
    if (url.includes(`/git/trees/${syncTree}`)) {
      return jsonResponse(200, {
        truncated: false,
        tree: [
          { path: "plugin.json", mode: "100644", type: "blob", sha: plugin.blobSha },
          { path: SYNC_CONTRACT.preserve[0], mode: "100644", type: "blob", sha: notice.blobSha },
        ],
      });
    }
    if (url.includes("/pulls?") && options.method === "GET") return jsonResponse(200, []);
    if (url.includes(`/compare/${syncSha}...${mainSha}`)) return jsonResponse(200, { status: "behind" });
    return jsonResponse(500, { message: `unexpected ${options.method} ${url}` });
  };
  const destination = createGithubDestination({ repo: "arcadeai-labs/omnimcp", token: "test-token", fetch, sleep: async () => {} });
  const result = await runSync({
    sourceFiles: sourceFrom({ "plugin.json": "{\"version\":\"0.7.0\"}\n" }),
    sourceSha: SOURCE_SHA,
    destination,
  });
  assert.equal(result.action, "blocked");
  assert.equal(result.outcome, "action-required");
  assert.equal(result.pr, null);
  assert.equal(result.syncSha, syncSha);
  assert.equal(result.baseSha, mainSha);
  assert.equal(result.plan.noop, true);
  assert.equal(result.basePlan.noop, false);
  assert.equal(result.basePlan.additions.includes("plugin.json"), true);
  assert.equal(result.basePlan.deletions.includes("old.txt"), true);
  assert.equal(calls.some((call) => call.method !== "GET"), false);
  assert.equal(calls.filter((call) => call.method === "POST" && call.url.endsWith("/pulls")).length, 0);
});

test("the GitHub client uploads only blobs that the parent and base trees do not already have", async () => {
  const mainSha = "1".repeat(40);
  const syncSha = "8".repeat(40);
  const mainTree = "3".repeat(40);
  const syncTree = "6".repeat(40);
  const notice = entryFromBytes("100644", repositoryControlsDocument());
  const legacy = entryFromBytes("100644", "legacy\n");
  const previous = sourceFrom({ "plugin.json": "{}\n", "pkg/a.txt": "v1\n" });
  const next = sourceFrom({ "plugin.json": "{}\n", "pkg/a.txt": "v2\n", "pkg/legacy-copy.txt": "legacy\n" });
  const treeOf = (files) => [...files].map(([path, entry]) => ({ path, mode: entry.mode, type: "blob", sha: entry.blobSha }));
  const calls = [];
  const fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, method: options.method, body });
    if (options.method === "GET") {
      if (url.endsWith("/git/ref/heads/main")) return jsonResponse(200, { object: { sha: mainSha } });
      if (url.endsWith("/git/ref/heads/sync%2Fcanonical-main")) return jsonResponse(200, { object: { sha: syncSha } });
      if (url.endsWith(`/git/commits/${mainSha}`)) return jsonResponse(200, { tree: { sha: mainTree } });
      if (url.endsWith(`/git/commits/${syncSha}`)) {
        return jsonResponse(200, { tree: { sha: syncTree }, message: syncCommitMessage(SOURCE_SHA), parents: [{ sha: mainSha }] });
      }
      if (url.includes(`/git/trees/${mainTree}`)) {
        return jsonResponse(200, { truncated: false, tree: treeOf(new Map([["legacy.txt", legacy], [SYNC_CONTRACT.preserve[0], notice]])) });
      }
      if (url.includes(`/git/trees/${syncTree}`)) {
        return jsonResponse(200, { truncated: false, tree: treeOf(new Map([...previous, [SYNC_CONTRACT.preserve[0], notice]])) });
      }
      if (url.includes("/pulls?")) {
        return jsonResponse(200, [{ number: 5, body: syncPullBody(SOURCE_SHA),
          head: { ref: SYNC_CONTRACT.syncBranch, repo: { full_name: SYNC_CONTRACT.destRepo } },
          base: { ref: "main", repo: { full_name: SYNC_CONTRACT.destRepo } } }]);
      }
    }
    if (options.method === "POST" && url.endsWith("/git/blobs")) {
      return jsonResponse(201, { sha: gitBlobSha(Buffer.from(body.content, "base64")) });
    }
    if (options.method === "POST" && url.endsWith("/git/trees")) return jsonResponse(201, { sha: "9".repeat(40) });
    if (options.method === "POST" && url.endsWith("/git/commits")) return jsonResponse(201, { sha: "4".repeat(40) });
    if (options.method === "PATCH" && url.endsWith("/git/refs/heads/sync%2Fcanonical-main")) return jsonResponse(200, {});
    if (options.method === "PATCH" && url.endsWith("/pulls/5")) return jsonResponse(200, {});
    return jsonResponse(500, { message: `unexpected ${options.method} ${url}` });
  };
  const destination = createGithubDestination({ repo: SYNC_CONTRACT.destRepo, token: "test-token", fetch, sleep: async () => {} });
  const result = await syncRun({ sourceFiles: next, sourceSha: NEXT_SHA, destination, source: {
    async getBranchSha() { return NEXT_SHA; },
    async isAncestor(a, b) { return a === SOURCE_SHA && b === NEXT_SHA; },
    async readFiles(sha) { return sha === SOURCE_SHA ? previous : next; },
  } });
  assert.equal(result.action, "update");
  const uploads = calls.filter((call) => call.method === "POST" && call.url.endsWith("/git/blobs"));
  assert.deepEqual(uploads.map((call) => Buffer.from(call.body.content, "base64").toString()), ["v2\n"]);
  const tree = calls.find((call) => call.method === "POST" && call.url.endsWith("/git/trees")).body.tree;
  assert.deepEqual(Object.fromEntries(tree.map((entry) => [entry.path, entry.sha])), {
    "plugin.json": next.get("plugin.json").blobSha,
    "pkg/a.txt": next.get("pkg/a.txt").blobSha,
    "pkg/legacy-copy.txt": legacy.blobSha,
    [SYNC_CONTRACT.preserve[0]]: notice.blobSha,
  });
});

const githubResponse = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(headers),
  async text() { return JSON.stringify(body); },
});

const SECONDARY_LIMIT = "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.";

/**
 * GitHub client whose blob, tree and commit POSTs go to a fake API on a fake
 * clock. `refuse(request, requests)` returns a response to send instead of
 * creating the object, or null to accept it.
 */
const fakeGitWrites = (refuse) => {
  const clock = { now: 0 };
  const requests = [];
  const waits = [];
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const request = { url, at: clock.now, body, refused: false };
    requests.push(request);
    const refusal = refuse(request, requests);
    if (refusal) {
      request.refused = true;
      return refusal;
    }
    if (url.endsWith("/git/blobs")) return githubResponse(201, { sha: gitBlobSha(Buffer.from(body.content, "base64")) });
    if (url.endsWith("/git/trees")) return githubResponse(201, { sha: "9".repeat(40) });
    if (url.endsWith("/git/commits")) return githubResponse(201, { sha: "4".repeat(40) });
    return githubResponse(500, { message: `unexpected ${options.method} ${url}` });
  };
  const destination = createGithubDestination({
    repo: SYNC_CONTRACT.destRepo,
    token: "test",
    fetch,
    sleep: async (ms) => { waits.push(ms); clock.now += ms; },
    now: () => clock.now,
  });
  return { destination, requests, waits };
};

const oneFile = () => new Map([["pkg/a.txt", entryFromBytes("100644", "a\n")]]);

test("a first sync with more new blobs than GitHub's per-minute write limit stays under the limit", async () => {
  const onLegacyMain = entryFromBytes("100644", "already on legacy main\n");
  const files = new Map([["pkg/kept.txt", onLegacyMain]]);
  for (let i = 0; i < 140; i++) files.set(`pkg/file-${i}.txt`, entryFromBytes("100644", `file ${i}\n`));
  // Like GitHub, refuse a write when 80 accepted writes fall in the last minute.
  const { destination, requests } = fakeGitWrites((request, all) => {
    const lastMinute = all.filter((other) => other !== request && !other.refused && request.at - other.at < 60_000);
    return lastMinute.length >= 80 ? githubResponse(403, { message: SECONDARY_LIMIT }) : null;
  });
  const commit = await destination.createCommit({
    parent: "1".repeat(40), files, message: "sync", knownBlobs: new Set([onLegacyMain.blobSha]),
  });
  assert.equal(commit, "4".repeat(40));
  assert.deepEqual(requests.filter((request) => request.refused), []);
  const uploads = requests.filter((request) => request.url.endsWith("/git/blobs"));
  assert.equal(uploads.length, 140);
  assert.equal(uploads.some((request) => Buffer.from(request.body.content, "base64").equals(onLegacyMain.bytes)), false);
});

test("a secondary rate limit response is retried after the wait GitHub asks for", async () => {
  const cases = [
    { limit: githubResponse(429, { message: SECONDARY_LIMIT }, { "retry-after": "7" }), wait: 7_000 },
    // The fake clock starts at 0, so a reset at epoch second 30 is 30 seconds away.
    { limit: githubResponse(403, { message: SECONDARY_LIMIT }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "30" }), wait: 30_000 },
    { limit: githubResponse(403, { message: SECONDARY_LIMIT }), wait: 60_000 },
    // retry-after wins over a reset time, and a reset time counts only when no requests remain.
    { limit: githubResponse(403, { message: SECONDARY_LIMIT }, { "retry-after": "5", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "30" }), wait: 5_000 },
    { limit: githubResponse(403, { message: SECONDARY_LIMIT }, { "x-ratelimit-remaining": "12", "x-ratelimit-reset": "30" }), wait: 60_000 },
  ];
  for (const { limit, wait } of cases) {
    const { destination, requests, waits } = fakeGitWrites((_request, all) => all.length === 1 ? limit : null);
    assert.equal(await destination.createCommit({ parent: "1".repeat(40), files: oneFile(), message: "sync" }), "4".repeat(40));
    assert.deepEqual(requests.map((request) => [request.url.split("/").pop(), request.refused]),
      [["blobs", true], ["blobs", false], ["trees", false], ["commits", false]]);
    // The retry wait, then one second before each later write.
    assert.deepEqual(waits, [wait, 1_000, 1_000, 1_000]);
  }
});

test("a permission 403 is not retried and a repeated rate limit gives up after three retries", async () => {
  const denied = fakeGitWrites(() => githubResponse(403, { message: "Resource not accessible by personal access token" }));
  await assert.rejects(denied.destination.createCommit({ parent: "1".repeat(40), files: oneFile(), message: "sync" }),
    /403 .*Resource not accessible/);
  assert.equal(denied.requests.length, 1);
  assert.deepEqual(denied.waits, []);

  const limited = fakeGitWrites(() => githubResponse(403, { message: SECONDARY_LIMIT }));
  await assert.rejects(limited.destination.createCommit({ parent: "1".repeat(40), files: oneFile(), message: "sync" }),
    /403 .*secondary rate limit/);
  assert.equal(limited.requests.length, 4);
  assert.deepEqual(limited.waits, [60_000, 1_000, 120_000, 1_000, 240_000, 1_000]);
});

test("GitHub ancestry uses the compare API and refuses an unknown status", async () => {
  const urls = [];
  let status = "ahead";
  const destination = createGithubDestination({ repo: SYNC_CONTRACT.destRepo, token: "test", fetch: async (url, options) => {
    urls.push(`${options.method} ${url}`);
    return jsonResponse(200, { status });
  } });
  assert.equal(await destination.isAncestor(SOURCE_SHA, NEXT_SHA), true);
  assert.deepEqual(urls, [`GET https://api.github.com/repos/${SYNC_CONTRACT.destRepo}/compare/${SOURCE_SHA}...${NEXT_SHA}?per_page=1`]);
  status = "identical";
  assert.equal(await destination.isAncestor(SOURCE_SHA, SOURCE_SHA), true);
  for (status of ["behind", "diverged"]) assert.equal(await destination.isAncestor(SOURCE_SHA, NEXT_SHA), false);
  status = undefined;
  await assert.rejects(destination.isAncestor(SOURCE_SHA, NEXT_SHA), /cannot establish destination ancestry/);
});

test("GitHub updates refuse a changed ref and only fast-forward the expected head", async () => {
  const calls = [];
  let current = SOURCE_SHA;
  const destination = createGithubDestination({ repo: SYNC_CONTRACT.destRepo, token: "test", fetch: async (url, options) => {
    calls.push({ url, ...options });
    if (options.method === "GET") return jsonResponse(200, { object: { sha: current } });
    return jsonResponse(200, {});
  } });
  await destination.compareAndSwap({ branch: SYNC_CONTRACT.syncBranch, from: SOURCE_SHA, to: NEXT_SHA });
  assert.deepEqual(JSON.parse(calls.find((call) => call.method === "PATCH").body), { sha: NEXT_SHA, force: false });
  current = "c".repeat(40);
  await assert.rejects(destination.compareAndSwap({ branch: SYNC_CONTRACT.syncBranch, from: SOURCE_SHA, to: NEXT_SHA }), /changed before update/);
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
  await assert.rejects(destination.compareAndSwap({ branch: SYNC_CONTRACT.syncBranch, from: current, to: null }), /never deletes/);
});

test("readGitTree round-trips a binary file", () => {
  const repo = initRepo({ "README.md": "seed\n" });
  try {
    writeFileSync(join(repo, "blob.bin"), Buffer.from([0, 255, 10]));
    git(repo, ["add", "blob.bin"]);
    git(repo, ["commit", "-m", "binary"]);
    const files = readGitTree(repo, "HEAD");
    assert.deepEqual([...files.get("blob.bin").bytes], [0, 255, 10]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("human sync-branch commits and human edits after a sync are never overwritten", async () => {
  for (const seedSync of [false, true]) {
    const repo = initRepo({ "pkg/file.txt": "base\n", "docs/migration/repository-controls.md": controls() });
    try {
      const pulls = [];
      if (seedSync) await run(repo, sourceFrom({ "pkg/file.txt": "v1\n" }), { pulls });
      else git(repo, ["branch", SYNC_CONTRACT.syncBranch, "main"]);
      git(repo, ["switch", SYNC_CONTRACT.syncBranch]);
      writeFileSync(join(repo, "manual.txt"), "human review work\n");
      git(repo, ["add", "."]); git(repo, ["commit", "-m", "human work"]);
      const head = git(repo, ["rev-parse", "HEAD"]).trim();
      await assert.rejects(run(repo, sourceFrom({ "pkg/file.txt": "v2\n" }), { pulls, sourceSha: NEXT_SHA }), /unowned sync branch/);
      assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), head);
      assert.equal(git(repo, ["show", `${head}:manual.txt`]), "human review work\n");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }
});

test("a forged sync marker cannot hide a human tree edit", async () => {
  const repo = initRepo({ "pkg/file.txt": "base\n", "docs/migration/repository-controls.md": controls() });
  try {
    const pulls = [];
    await run(repo, sourceFrom({ "pkg/file.txt": "v1\n" }), { pulls });
    git(repo, ["switch", SYNC_CONTRACT.syncBranch]);
    writeFileSync(join(repo, "manual.txt"), "keep\n"); git(repo, ["add", "."]);
    git(repo, ["commit", "-m", syncCommitMessage(SOURCE_SHA)]);
    const head = git(repo, ["rev-parse", "HEAD"]).trim();
    await assert.rejects(run(repo, sourceFrom({ "pkg/file.txt": "v2\n" }), { pulls, sourceSha: NEXT_SHA }), /human or unexpected changes/);
    assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), head);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("wrong-base, unowned, fork-head, and duplicate PR matches are refused before writes", async () => {
  const valid = { number: 1, branch: SYNC_CONTRACT.syncBranch, base: "main", headRepo: SYNC_CONTRACT.destRepo, baseRepo: SYNC_CONTRACT.destRepo, body: syncPullBody(SOURCE_SHA) };
  for (const matches of [[{ ...valid, base: "release" }], [{ ...valid, body: "human PR" }], [{ ...valid, headRepo: "someone/omnimcp" }], [valid, { ...valid, number: 2 }]]) {
    assert.throws(() => selectSyncPull(matches, SYNC_CONTRACT.syncBranch), /ambiguous, unowned or wrong-base/);
  }
  let writes = 0;
  const destination = createGithubDestination({ repo: SYNC_CONTRACT.destRepo, token: "test", fetch: async (_url, options) => {
    if (options.method !== "GET") writes++;
    return jsonResponse(200, [{ number: 99, body: syncPullBody(SOURCE_SHA), head: { ref: SYNC_CONTRACT.syncBranch, repo: { full_name: SYNC_CONTRACT.destRepo } }, base: { ref: "release", repo: { full_name: SYNC_CONTRACT.destRepo } } }]);
  } });
  await assert.rejects(destination.findOpenPull(SYNC_CONTRACT.syncBranch), /wrong-base/);
  assert.equal(writes, 0);
});

test("real ancestor A cannot replace B after a delayed event or a source ref rewind", async () => {
  const sourceRepo = initRepo({ "pkg/file.txt": "A\n" });
  const dest = initRepo({ "pkg/file.txt": "legacy\n", "docs/migration/repository-controls.md": controls() });
  try {
    const a = git(sourceRepo, ["rev-parse", "HEAD"]).trim();
    writeFileSync(join(sourceRepo, "pkg/file.txt"), "B\n"); git(sourceRepo, ["add", "."]); git(sourceRepo, ["commit", "-m", "B"]);
    const b = git(sourceRepo, ["rev-parse", "HEAD"]).trim();
    const source = createGitSource({ repo: sourceRepo });
    const pulls = []; const destination = createGitDestination({ repo: dest, pulls });
    await syncRun({ sourceFiles: readGitTree(sourceRepo, b), sourceSha: b, source, destination });
    const delivered = git(dest, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    const delayed = await syncRun({ sourceFiles: readGitTree(sourceRepo, a), sourceSha: a, source, destination });
    assert.equal(delayed.action, "skip");
    const rewind = await syncRun({ sourceFiles: readGitTree(sourceRepo, a), sourceSha: a, source: { ...source, async getBranchSha() { return a; } }, destination });
    assert.equal(rewind.action, "blocked");
    assert.equal(git(dest, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), delivered);
    assert.equal(git(dest, ["show", `${delivered}:pkg/file.txt`]), "B\n");
    assert.match(pulls[0].body, new RegExp(`Source-SHA: ${b}`));
  } finally { rmSync(sourceRepo, { recursive: true, force: true }); rmSync(dest, { recursive: true, force: true }); }
});

test("a source advance during planning prevents a ref or PR write", async () => {
  const repo = initRepo({ "pkg/file.txt": "base\n" });
  try {
    const destination = createGitDestination({ repo, pulls: [] });
    destination.createCommit = async () => { throw new Error("must not create a commit"); };
    let reads = 0;
    const result = await syncRun({ sourceFiles: sourceFrom({ "pkg/file.txt": "A\n" }), sourceSha: SOURCE_SHA, destination, source: {
      async getBranchSha() { return ++reads === 1 ? SOURCE_SHA : NEXT_SHA; },
      async readFiles() { return sourceFrom({ "pkg/file.txt": "A\n" }); },
    } });
    assert.equal(result.action, "skip");
    assert.equal(await destination.getBranchSha(SYNC_CONTRACT.syncBranch), null);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test("an accepted PR create with a lost response is reconciled without deleting its head", async () => {
  for (const reconciliationFails of [false, true]) {
    const repo = initRepo({ "pkg/file.txt": "base\n" });
    try {
      const pulls = []; const destination = createGitDestination({ repo, pulls });
      const create = destination.createPull; const find = destination.findOpenPull;
      let accepted = false;
      destination.createPull = async (args) => { await create(args); accepted = true; throw new Error("response lost"); };
      destination.findOpenPull = async (...args) => { if (accepted && reconciliationFails) throw new Error("network unavailable"); return find(...args); };
      const result = await runSync({ sourceFiles: sourceFrom({ "pkg/file.txt": "new\n" }), sourceSha: SOURCE_SHA, destination });
      assert.equal(result.action, reconciliationFails ? "blocked" : "recovered");
      const retained = await destination.getBranchSha(SYNC_CONTRACT.syncBranch);
      assert.ok(retained); assert.equal(pulls.length, 1); assert.equal(pulls[0].state, "open");
      assert.equal(git(repo, ["show", `${retained}:pkg/file.txt`]), "new\n");
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }
});


// Integrity-check reader backed by local source and destination repositories.
const localMirrorReader = ({ sourceRepo, dest, source, destination }) => ({
  main: () => source.getBranchSha("main"),
  destinationMain: () => destination.getBranchSha("main"),
  commit: (_repo, sha) => destination.getCommit(sha),
  isAncestor: (_repo, ancestor, descendant) => destination.isAncestor(ancestor, descendant),
  async tree(repo, sha) { return readGitTree(repo === SYNC_CONTRACT.sourceRepo ? sourceRepo : dest, sha); },
});

test("excluded-only source updates advance commit provenance and pass trusted integrity", async () => {
  for (const bodyAlreadyCurrent of [false, true]) {
    const sourceRepo = initRepo({
      "plugin.json": '{"name":"arcade","version":"0.7.0"}\n',
      "dev/scripts/legacy-projection.mjs": "reviewed policy\n",
      "dev/scripts/verify-mirror.mjs": "reviewed checker\n",
      "sync/destination-check.yml": "trusted workflow\n",
      "docs/migration/legacy-sync.md": "source A\n",
    });
    const dest = initRepo({ "pkg/legacy.txt": "legacy\n", "docs/migration/repository-controls.md": controls() });
    try {
      const a = git(sourceRepo, ["rev-parse", "HEAD"]).trim();
      const base = git(dest, ["rev-parse", "HEAD"]).trim();
      const source = createGitSource({ repo: sourceRepo });
      const pulls = []; const destination = createGitDestination({ repo: dest, pulls });
      const reader = localMirrorReader({ sourceRepo, dest, source, destination });
      const event = (sha) => ({ pull_request: { head: { sha }, base: { sha: base, ref: "main", repo: { full_name: SYNC_CONTRACT.destRepo } } } });
      await syncRun({ sourceFiles: readGitTree(sourceRepo, a), sourceSha: a, source, destination });
      const first = await destination.getBranchSha(SYNC_CONTRACT.syncBranch);
      assert.equal((await verifyGithubMirror({ event: event(first), repository: SYNC_CONTRACT.destRepo, reader })).differences, 0);
      writeFileSync(join(sourceRepo, "docs/migration/legacy-sync.md"), "source B, excluded-only edit\n");
      git(sourceRepo, ["add", "."]); git(sourceRepo, ["commit", "-m", "excluded-only B"]);
      const b = git(sourceRepo, ["rev-parse", "HEAD"]).trim();
      // Recover mismatched state left by an older run too: do not use only PR body freshness.
      if (bodyAlreadyCurrent) pulls[0].body = syncPullBody(b);
      const updated = await syncRun({ sourceFiles: readGitTree(sourceRepo, b), sourceSha: b, source, destination });
      const second = await destination.getBranchSha(SYNC_CONTRACT.syncBranch);
      assert.notEqual(second, first);
      assert.equal(git(dest, ["rev-parse", `${second}^`]).trim(), first);
      assert.equal(git(dest, ["rev-parse", `${second}^{tree}`]).trim(), git(dest, ["rev-parse", `${first}^{tree}`]).trim());
      assert.equal(updated.action, "update-provenance"); assert.equal(updated.commit, second);
      assert.equal(sourceProvenance((await destination.getCommit(second)).message), b);
      assert.match(pulls[0].body, new RegExp(`Source-SHA: ${b}`));
      assert.equal((await verifyGithubMirror({ event: event(second), repository: SYNC_CONTRACT.destRepo, reader })).sourceSha, b);
      const repeated = await syncRun({ sourceFiles: readGitTree(sourceRepo, b), sourceSha: b, source, destination });
      assert.equal(repeated.action, "noop"); assert.equal(await destination.getBranchSha(SYNC_CONTRACT.syncBranch), second);
      assert.equal(pulls.length, 1);
    } finally { rmSync(sourceRepo, { recursive: true, force: true }); rmSync(dest, { recursive: true, force: true }); }
  }
});


test("a file that lands on destination main after the sync branch was cut fails the integrity check", async () => {
  const sourceRepo = initRepo({
    "plugin.json": '{"name":"arcade","version":"0.7.0"}\n',
    "dev/scripts/legacy-projection.mjs": "reviewed policy\n",
    "dev/scripts/verify-mirror.mjs": "reviewed checker\n",
    "sync/destination-check.yml": "trusted workflow\n",
  });
  const dest = initRepo({ "pkg/legacy.txt": "legacy\n", "docs/migration/repository-controls.md": controls() });
  try {
    const sha = git(sourceRepo, ["rev-parse", "HEAD"]).trim();
    const source = createGitSource({ repo: sourceRepo });
    const destination = createGitDestination({ repo: dest, pulls: [] });
    const reader = localMirrorReader({ sourceRepo, dest, source, destination });
    // The event names the current main as the PR base, as a fresh payload would.
    const check = async (head) => verifyGithubMirror({
      event: { pull_request: { head: { sha: head }, base: { sha: await destination.getBranchSha("main"), ref: "main", repo: { full_name: SYNC_CONTRACT.destRepo } } } },
      repository: SYNC_CONTRACT.destRepo,
      reader,
    });
    await syncRun({ sourceFiles: readGitTree(sourceRepo, sha), sourceSha: sha, source, destination });
    const head = await destination.getBranchSha(SYNC_CONTRACT.syncBranch);
    assert.equal((await check(head)).differences, 0);

    writeFileSync(join(dest, "stray.txt"), "landed on main after the sync branch was cut\n");
    git(dest, ["add", "stray.txt"]); git(dest, ["commit", "-m", "stray file on main"]);
    // The head never had stray.txt, so merging the sync PR into main keeps it.
    const mergedTree = git(dest, ["merge-tree", "--write-tree", "main", head]).split("\n")[0];
    assert.match(git(dest, ["ls-tree", "--name-only", mergedTree]), /^stray\.txt$/m);
    await assert.rejects(check(head), /is behind main/);
  } finally { rmSync(sourceRepo, { recursive: true, force: true }); rmSync(dest, { recursive: true, force: true }); }
});

test("after a merge-commit merge keeps the sync branch, the next sync builds on main and passes the integrity check", async () => {
  const sourceRepo = initRepo({
    "plugin.json": '{"name":"arcade","version":"0.7.0"}\n',
    "dev/scripts/legacy-projection.mjs": "reviewed policy\n",
    "dev/scripts/verify-mirror.mjs": "reviewed checker\n",
    "sync/destination-check.yml": "trusted workflow\n",
  });
  const dest = initRepo({ "pkg/legacy.txt": "legacy\n", "docs/migration/repository-controls.md": controls() });
  try {
    const source = createGitSource({ repo: sourceRepo });
    const pulls = [];
    const destination = createGitDestination({ repo: dest, pulls });
    const reader = localMirrorReader({ sourceRepo, dest, source, destination });
    const check = async (head) => verifyGithubMirror({
      event: { pull_request: { head: { sha: head }, base: { sha: await destination.getBranchSha("main"), ref: "main", repo: { full_name: SYNC_CONTRACT.destRepo } } } },
      repository: SYNC_CONTRACT.destRepo,
      reader,
    });
    const a = git(sourceRepo, ["rev-parse", "HEAD"]).trim();
    assert.equal((await syncRun({ sourceFiles: readGitTree(sourceRepo, a), sourceSha: a, source, destination })).action, "create");
    const first = await destination.getBranchSha(SYNC_CONTRACT.syncBranch);
    git(dest, ["merge", "--no-ff", SYNC_CONTRACT.syncBranch, "-m", "merge sync"]);
    pulls[0].state = "closed";
    const main = git(dest, ["rev-parse", "main"]).trim();

    writeFileSync(join(sourceRepo, "plugin.json"), '{"name":"arcade","version":"0.8.0"}\n');
    git(sourceRepo, ["commit", "-am", "release 0.8.0"]);
    const b = git(sourceRepo, ["rev-parse", "HEAD"]).trim();
    const next = await syncRun({ sourceFiles: readGitTree(sourceRepo, b), sourceSha: b, source, destination });
    assert.equal(next.action, "create");
    const second = await destination.getBranchSha(SYNC_CONTRACT.syncBranch);
    assert.equal(git(dest, ["show", "-s", "--format=%P", second]).trim(), main);
    assert.equal(await destination.isAncestor(first, second), true);
    assert.equal(git(dest, ["rev-parse", "main"]).trim(), main);
    const checked = await check(second);
    assert.equal(checked.differences, 0);
    assert.equal(checked.sourceSha, b);

    // The next run accepts the new head as an owned sync commit.
    const repeated = await syncRun({ sourceFiles: readGitTree(sourceRepo, b), sourceSha: b, source, destination });
    assert.equal(repeated.action, "noop");
    assert.equal(repeated.pr, 2);
    assert.equal(await destination.getBranchSha(SYNC_CONTRACT.syncBranch), second);
  } finally { rmSync(sourceRepo, { recursive: true, force: true }); rmSync(dest, { recursive: true, force: true }); }
});

test("a stale PR body alone is repaired without another provenance commit", async () => {
  const repo = initRepo({ "pkg/file.txt": "base\n", "docs/migration/repository-controls.md": controls() });
  try {
    const pulls = []; const source = sourceFrom({ "pkg/file.txt": "current\n" });
    await run(repo, source, { pulls });
    const head = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    pulls[0].body = syncPullBody(NEXT_SHA);
    const repaired = await run(repo, source, { pulls });
    assert.equal(repaired.result.action, "update-provenance");
    assert.equal(git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim(), head);
    assert.equal(repaired.result.commit, undefined);
    assert.match(pulls[0].body, new RegExp(`Source-SHA: ${SOURCE_SHA}`));
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
