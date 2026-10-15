import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  SYNC_CONTRACT,
  createGitDestination,
  createGithubDestination,
  desiredTree,
  diffTrees,
  entryFromBytes,
  gitBlobSha,
  isExcluded,
  liveSyncGate,
  materializeMirror,
  readGitTree,
  repositoryControlsDocument,
  runSync,
} from "../scripts/sync-legacy.mjs";

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

const sourceFrom = (files) => new Map(Object.entries(files).map(([path, contents]) => [path, entryFromBytes("100644", contents)]));

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
    "scripts/sync-legacy.mjs": "export {}\n",
    "test/sync-legacy.test.mjs": "test\n",
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
  assert.equal(isExcluded(".github/workflows/check.yml"), false);
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

test("a failed pull create rolls the sync branch back and does not write main", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls(), "pkg/file.txt": "base\n" });
  const main = git(repo, ["rev-parse", "main"]).trim();
  try {
    await assert.rejects(
      run(repo, sourceFrom({ "pkg/file.txt": "changed\n" }), { failCreate: true }),
      /mock pull create failed/,
    );
    assert.equal(git(repo, ["rev-parse", "main"]).trim(), main);
    const branch = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${SYNC_CONTRACT.syncBranch}`], { cwd: repo });
    assert.notEqual(branch.status, 0);
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
    await assert.rejects(
      runSync({
        sourceFiles: sourceFrom({ "pkg/file.txt": "v2\n" }),
        sourceSha: NEXT_SHA,
        destination,
      }),
      /mock pull update failed/,
    );
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

test("release-please is absent from the synced tree", async () => {
  const repo = initRepo({ "docs/migration/repository-controls.md": controls() });
  try {
    const source = sourceFrom({
      "plugin.json": "{\"version\":\"0.7.0\"}\n",
      ".github/workflows/release-please.yml": "name: Release Please\n",
      ".github/workflows/check.yml": "name: check\n",
    });
    await run(repo, source);
    const synced = git(repo, ["rev-parse", SYNC_CONTRACT.syncBranch]).trim();
    assert.equal(git(repo, ["show", `${synced}:.github/workflows/check.yml`]), "name: check\n");
    const release = spawnSync("git", ["cat-file", "-e", `${synced}:.github/workflows/release-please.yml`], { cwd: repo });
    assert.notEqual(release.status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("materializeMirror edits the worktree and does not move HEAD", () => {
  const source = initRepo({
    "plugin.json": "{\"version\":\"0.7.0\"}\n",
    ".github/workflows/release-please.yml": "name: Release Please\n",
    "sync/legacy-sync.workflow.yml": "name: sync-legacy\n",
    "docs/migration/legacy-sync.md": "inert\n",
  });
  const dest = initRepo({
    "obsolete.txt": "old\n",
    "docs/migration/repository-controls.md": "keep me\n",
  });
  const head = git(dest, ["rev-parse", "HEAD"]).trim();
  try {
    const { plan } = materializeMirror({ sourceRepo: source, destRepo: dest });
    assert.equal(plan.additions.includes("plugin.json"), true);
    assert.equal(plan.deletions.includes("obsolete.txt"), true);
    assert.equal(readFileSync(join(dest, "plugin.json"), "utf8"), "{\"version\":\"0.7.0\"}\n");
    assert.equal(readFileSync(join(dest, "docs/migration/repository-controls.md"), "utf8"), "keep me\n");
    assert.equal(spawnSync("test", ["-e", join(dest, "obsolete.txt")]).status, 1);
    assert.equal(spawnSync("test", ["-e", join(dest, ".github/workflows/release-please.yml")]).status, 1);
    assert.equal(git(dest, ["rev-parse", "HEAD"]).trim(), head);
    assert.equal(git(dest, ["show", "HEAD:obsolete.txt"]), "old\n");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
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
  const root = join(import.meta.dirname, "..");
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
    if (url.endsWith("/git/ref/heads/sync/canonical-main") && options.method === "GET") return jsonResponse(404);
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
  const destination = createGithubDestination({ repo: "arcadeai-labs/omnimcp", token: "test-token", fetch });
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
  assert.equal(writes.filter((call) => call.method === "POST" && call.url.endsWith("/pulls")).length, 1);
});

test("a failed GitHub pull create deletes only the new sync ref", async () => {
  const calls = [];
  const mainSha = "1".repeat(40);
  const createdSha = "4".repeat(40);
  let syncSha = null;
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/git/ref/heads/main") && options.method === "GET") {
      return jsonResponse(200, { object: { sha: mainSha } });
    }
    if (url.endsWith("/git/ref/heads/sync/canonical-main") && options.method === "GET") {
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
    if (options.method === "DELETE" && url.endsWith("/git/refs/heads/sync/canonical-main")) {
      syncSha = null;
      return jsonResponse(204);
    }
    return jsonResponse(500, { message: `unexpected ${options.method} ${url}` });
  };
  const destination = createGithubDestination({ repo: "arcadeai-labs/omnimcp", token: "test-token", fetch });
  await assert.rejects(
    runSync({
      sourceFiles: sourceFrom({ "plugin.json": "{}\n" }),
      sourceSha: SOURCE_SHA,
      destination,
    }),
    /GitHub POST .*\/pulls failed: 500/,
  );
  assert.equal(calls.some((call) => call.url.includes("heads/main") && call.method !== "GET"), false);
  assert.equal(calls.filter((call) => call.method === "POST" && call.url.endsWith("/pulls")).length, 1);
  assert.equal(calls.some((call) => call.method === "DELETE" && call.url.endsWith("/git/refs/heads/sync/canonical-main")), true);
});

test("an existing GitHub pull is patched and not created again", async () => {
  const calls = [];
  const mainSha = "1".repeat(40);
  const syncSha = "8".repeat(40);
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/git/ref/heads/main") && options.method === "GET") return jsonResponse(200, { object: { sha: mainSha } });
    if (url.endsWith("/git/ref/heads/sync/canonical-main") && options.method === "GET") {
      return jsonResponse(200, { object: { sha: syncSha } });
    }
    if (url.includes(`/git/commits/${syncSha}`)) return jsonResponse(200, { tree: { sha: "3".repeat(40) } });
    if (url.includes("/git/trees/") && options.method === "GET") return jsonResponse(200, { truncated: false, tree: [] });
    if (url.endsWith("/git/blobs")) return jsonResponse(201, { sha: "5".repeat(40) });
    if (url.endsWith("/git/trees") && options.method === "POST") return jsonResponse(201, { sha: "6".repeat(40) });
    if (url.endsWith("/git/commits") && options.method === "POST") return jsonResponse(201, { sha: "9".repeat(40) });
    if (url.includes("/pulls?") && options.method === "GET") {
      return jsonResponse(200, [{ number: 4, title: "old", body: "Source-SHA: cccccccccccccccccccccccccccccccccccccccc\n" }]);
    }
    if (options.method === "PATCH" && url.endsWith("/git/refs/heads/sync/canonical-main")) return jsonResponse(200, {});
    if (options.method === "PATCH" && url.endsWith("/pulls/4")) return jsonResponse(200, {});
    return jsonResponse(500, { message: `unexpected ${options.method} ${url}` });
  };
  const destination = createGithubDestination({ repo: "arcadeai-labs/omnimcp", token: "test-token", fetch });
  const result = await runSync({
    sourceFiles: sourceFrom({ "plugin.json": "{}\n" }),
    sourceSha: NEXT_SHA,
    destination,
  });
  assert.equal(result.action, "update");
  assert.equal(result.pr, 4);
  const ref = calls.find((call) => call.method === "PATCH" && call.url.includes("/git/refs/"));
  assert.equal(ref.body.force, false);
  assert.equal(calls.some((call) => call.method === "POST" && call.url.endsWith("/pulls")), false);
  assert.equal(calls.some((call) => call.url.includes("heads/main") && call.method !== "GET"), false);
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
