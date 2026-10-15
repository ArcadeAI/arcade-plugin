#!/usr/bin/env node
// One-way mirror of the canonical tree onto arcadeai-labs/omnimcp.
// The file under sync/ is not an active workflow. This script refuses live
// writes unless a push to canonical main opts in with SYNC_LEGACY_APPLY=1.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Paths and branches the mirror is allowed to touch. */
export const SYNC_CONTRACT = {
  sourceRepo: "ArcadeAI/arcade-plugin",
  destRepo: "arcadeai-labs/omnimcp",
  sourceBranch: "main",
  destBaseBranch: "main",
  syncBranch: "sync/canonical-main",
  // Present in the canonical tree, omitted from the legacy tree.
  exclude: [
    ".github/workflows/release-please.yml",
    "scripts/sync-legacy.mjs",
    "test/sync-legacy.test.mjs",
    "sync/",
    "docs/migration/",
  ],
  // Destination-only file. The mirror must not delete or replace it.
  preserve: ["docs/migration/repository-controls.md"],
};

const PROTECTED_BRANCHES = new Set(["main", "master"]);
const SYNC_MARKER = "Legacy-Sync-Commit: true";

/** Git blob id for `bytes`, matching `git hash-object`. */
export const gitBlobSha = (bytes) => {
  const hash = createHash("sha1");
  hash.update(`blob ${bytes.length}\0`);
  hash.update(bytes);
  return hash.digest("hex");
};

/** @param {string} mode @param {Buffer | string} bytes */
export const entryFromBytes = (mode, bytes) => {
  if (mode === "120000" || mode === "160000") {
    throw new Error(`refusing to mirror mode ${mode}`);
  }
  const normalized = mode === "100755" ? "100755" : "100644";
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return { mode: normalized, bytes: buffer, blobSha: gitBlobSha(buffer) };
};

/** True when `path` is a canonical path that must not be copied. */
export const isExcluded = (path, exclude = SYNC_CONTRACT.exclude) =>
  exclude.some((rule) => {
    if (rule.endsWith("/")) return path === rule.slice(0, -1) || path.startsWith(rule);
    return path === rule;
  });

/** True when `path` is a destination-only path the mirror keeps. */
export const isPreserved = (path, preserve = SYNC_CONTRACT.preserve) => preserve.includes(path);

/** Stable notice kept only in the legacy tree. */
export const repositoryControlsDocument = (contract = SYNC_CONTRACT) =>
  [
    "# Repository controls",
    "",
    `This tree mirrors \`${contract.sourceRepo}\`. Package files match that`,
    "repository at the Source-SHA recorded on the sync commit and pull request.",
    "Canonical commits are not imported.",
    "",
    "These canonical paths are intentionally absent:",
    "",
    ...contract.exclude.map((path) => `- \`${path}\``),
    "",
    "This file is destination-only. Sync keeps it and does not replace it.",
    "",
    "The pre-migration tree used the Apache-2.0 license. Those obsolete paths",
    "are removed when the canonical tree is copied. Their notices remain in git",
    "history. Files copied from the canonical package keep that package's MIT notice.",
    "",
    "This tree does not change the existing legacy listing.",
    "",
  ].join("\n");

/**
 * The tree that should be committed on the legacy sync branch.
 * `sourceFiles` and `destFiles` are maps of repo-relative path to entries.
 */
export const desiredTree = ({ sourceFiles, destFiles, contract = SYNC_CONTRACT }) => {
  const desired = new Map();
  for (const [path, entry] of sourceFiles) {
    if (isExcluded(path, contract.exclude) || isPreserved(path, contract.preserve)) continue;
    desired.set(path, entry);
  }
  const template = entryFromBytes("100644", repositoryControlsDocument(contract));
  for (const path of contract.preserve) {
    desired.set(path, destFiles.get(path) ?? template);
  }
  return desired;
};

/** Additions, content changes, and deletions between two entry maps. */
export const diffTrees = (current, desired) => {
  const additions = [];
  const changes = [];
  const deletions = [];
  for (const [path, entry] of desired) {
    const before = current.get(path);
    if (!before) additions.push(path);
    else if (before.blobSha !== entry.blobSha || before.mode !== entry.mode) changes.push(path);
  }
  for (const path of current.keys()) {
    if (!desired.has(path)) deletions.push(path);
  }
  for (const list of [additions, changes, deletions]) list.sort();
  return {
    additions,
    changes,
    deletions,
    noop: additions.length + changes.length + deletions.length === 0,
  };
};

export const syncCommitMessage = (sourceSha, contract = SYNC_CONTRACT) =>
  [
    `sync: mirror ${contract.sourceRepo} ${sourceSha}`,
    "",
    `Source-SHA: ${sourceSha}`,
    `Source-Repo: ${contract.sourceRepo}`,
    SYNC_MARKER,
    "",
    "Mirrored files only. Canonical commits are not imported.",
    "",
  ].join("\n");

export const syncPullBody = (sourceSha, contract = SYNC_CONTRACT) =>
  [
    `Source-SHA: ${sourceSha}`,
    `Source-Repo: ${contract.sourceRepo}`,
    `Source-Branch: ${contract.sourceBranch}`,
    "",
    "This pull request mirrors the canonical tree onto the legacy repository.",
    "It does not import canonical commits.",
    "",
    "Repository-control paths omitted from the mirror:",
    "",
    ...contract.exclude.map((path) => `- \`${path}\``),
    "",
    "Destination-only paths kept in place:",
    "",
    ...contract.preserve.map((path) => `- \`${path}\``),
    "",
  ].join("\n");

const syncPullTitle = (sourceSha, contract = SYNC_CONTRACT) =>
  `sync: mirror ${contract.sourceRepo} ${sourceSha.slice(0, 12)}`;

/**
 * Live apply is allowed only for a push to canonical main that opts in.
 * Any other event, including pull_request and branch pushes, is a skip.
 */
export const liveSyncGate = (env) => {
  if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REF !== "refs/heads/main") {
    return {
      ok: false,
      reason: `inert unless push to refs/heads/main (got ${env.GITHUB_EVENT_NAME ?? "unset"} ${env.GITHUB_REF ?? "unset"})`,
    };
  }
  if (env.SYNC_LEGACY_APPLY !== "1") {
    return { ok: false, reason: "SYNC_LEGACY_APPLY is not 1" };
  }
  return { ok: true };
};

const assertContract = (contract) => {
  if (contract.sourceRepo === contract.destRepo) {
    throw new Error("refusing to sync a repository onto itself");
  }
  if (PROTECTED_BRANCHES.has(contract.syncBranch) || contract.syncBranch === contract.destBaseBranch) {
    throw new Error(`refusing to use protected branch ${contract.syncBranch} as the sync branch`);
  }
};

const assertSourceSha = (sourceSha) => {
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error("sourceSha must be a 40-character hex commit");
  }
};

/**
 * Open or update one draft pull request on the legacy sync branch.
 * Never updates the destination base branch. On a write failure after moving
 * the sync branch, moves that branch back and does not open a second pull.
 */
export const runSync = async ({
  sourceFiles,
  sourceSha,
  sourceMessage = "",
  destination,
  contract = SYNC_CONTRACT,
}) => {
  assertContract(contract);
  assertSourceSha(sourceSha);
  const baseBefore = await destination.getBranchSha(contract.destBaseBranch);
  if (!baseBefore) throw new Error(`destination ${contract.destBaseBranch} does not exist`);
  let failure = null;
  let result = null;
  try {
    if (sourceMessage.includes(SYNC_MARKER)) {
      result = { action: "skip", reason: "source commit is a legacy sync commit" };
    } else {
      result = await syncBody({ sourceFiles, sourceSha, destination, contract });
    }
  } catch (error) {
    failure = error;
  }
  const baseAfter = await destination.getBranchSha(contract.destBaseBranch);
  if (baseAfter !== baseBefore) {
    throw new Error(`destination ${contract.destBaseBranch} changed during sync`, { cause: failure ?? undefined });
  }
  if (failure) throw failure;
  return result;
};

const syncBody = async ({ sourceFiles, sourceSha, destination, contract }) => {
  const baseSha = await destination.getBranchSha(contract.destBaseBranch);
  const syncSha = await destination.getBranchSha(contract.syncBranch);
  const parentSha = syncSha ?? baseSha;
  const parentFiles = await destination.readFiles(parentSha);
  const desired = desiredTree({ sourceFiles, destFiles: parentFiles, contract });
  const plan = diffTrees(parentFiles, desired);
  const open = await destination.findOpenPull(contract.syncBranch);
  const body = syncPullBody(sourceSha, contract);
  const title = syncPullTitle(sourceSha, contract);
  if (plan.noop) {
    if (open && !open.body.includes(`Source-SHA: ${sourceSha}`)) {
      await destination.updatePull({ number: open.number, title, body });
      return { action: "update-provenance", pr: open.number, plan };
    }
    return { action: "noop", pr: open?.number ?? null, plan };
  }
  const newSha = await destination.createCommit({
    parent: parentSha,
    files: desired,
    message: syncCommitMessage(sourceSha, contract),
  });
  await destination.compareAndSwap({ branch: contract.syncBranch, from: syncSha, to: newSha });
  try {
    if (open) {
      await destination.updatePull({ number: open.number, title, body });
      return { action: "update", pr: open.number, commit: newSha, plan };
    }
    const pr = await destination.createPull({
      branch: contract.syncBranch,
      base: contract.destBaseBranch,
      title,
      body,
      draft: true,
    });
    return { action: "create", pr: pr.number, commit: newSha, plan };
  } catch (error) {
    // A new branch has no pull request yet, so delete it. An existing pull
    // request already tracks the branch; leave the fast-forward in place
    // rather than force-moving the branch backward.
    if (syncSha === null) {
      try {
        await destination.compareAndSwap({ branch: contract.syncBranch, from: newSha, to: null });
      } catch (rollbackError) {
        throw new Error(`sync write failed and rollback failed: ${rollbackError.message}`, { cause: error });
      }
    }
    throw error;
  }
};

const gitCommand = (repo, args, { input, encoding } = {}) => {
  const result = spawnSync("git", args, {
    cwd: repo,
    input,
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr ? Buffer.from(result.stderr).toString("utf8") : "";
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
  return result.stdout;
};

/** Read a committed git tree as path entries. Does not include `.git`. */
export const readGitTree = (repo, rev = "HEAD") => {
  const listed = gitCommand(repo, ["ls-tree", "-r", "-z", rev]);
  const records = Buffer.from(listed).toString("utf8").split("\0").filter(Boolean);
  const files = new Map();
  for (const record of records) {
    const tab = record.indexOf("\t");
    const [mode, type, sha] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (type !== "blob") throw new Error(`${path} is a ${type}; refusing to mirror it`);
    const bytes = Buffer.from(gitCommand(repo, ["cat-file", "blob", sha]));
    files.set(path, entryFromBytes(mode, bytes));
  }
  return files;
};

const removeEmptyDirectories = (root) => {
  const walk = (directory) => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      if (!name.isDirectory() || name.name === ".git") continue;
      const child = join(directory, name.name);
      walk(child);
      if (readdirSync(child).length === 0) rmSync(child, { recursive: true });
    }
  };
  walk(root);
};

/**
 * Replace the destination worktree contents with the mirrored tree.
 * Does not create a commit or update a ref.
 */
export const materializeMirror = ({
  sourceRepo,
  destRepo,
  contract = SYNC_CONTRACT,
  sourceRev = "HEAD",
  destRev = "HEAD",
}) => {
  const sourceFiles = readGitTree(sourceRepo, sourceRev);
  const destFiles = readGitTree(destRepo, destRev);
  const desired = desiredTree({ sourceFiles, destFiles, contract });
  const plan = diffTrees(destFiles, desired);
  for (const path of [...destFiles.keys()].sort((left, right) => right.length - left.length)) {
    if (!desired.has(path)) rmSync(join(destRepo, path), { force: true });
  }
  for (const [path, entry] of desired) {
    if (!entry.bytes) throw new Error(`${path} has no bytes to write`);
    const absolute = join(destRepo, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, entry.bytes);
    chmodSync(absolute, entry.mode === "100755" ? 0o755 : 0o644);
  }
  removeEmptyDirectories(destRepo);
  return { plan, desired };
};

/**
 * Destination port backed by local git refs. Pull requests stay in `pulls`.
 * `compareAndSwap` refuses `main` and `master`.
 */
export const createGitDestination = ({ repo, pulls, failCreate = false, failSwap = false }) => ({
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
      return gitCommand(repo, ["commit-tree", tree, "-p", parent, "-m", message], { encoding: "utf8" }).trim();
    } finally {
      rmSync(index, { force: true });
    }
  },
  async compareAndSwap({ branch, from, to }) {
    if (PROTECTED_BRANCHES.has(branch)) {
      throw new Error(`refusing to update protected branch ${branch}`);
    }
    if (failSwap) throw new Error("mock ref update failed");
    if (to === null) {
      gitCommand(repo, ["update-ref", "-d", `refs/heads/${branch}`, from]);
      return;
    }
    if (from === null) {
      gitCommand(repo, ["update-ref", `refs/heads/${branch}`, to, "0".repeat(40)]);
      return;
    }
    gitCommand(repo, ["update-ref", `refs/heads/${branch}`, to, from]);
  },
  async findOpenPull(branch) {
    return pulls.find((pull) => pull.branch === branch && pull.state === "open") ?? null;
  },
  async createPull({ branch, base, title, body, draft }) {
    if (failCreate) throw new Error("mock pull create failed");
    const pull = { number: pulls.length + 1, branch, base, title, body, draft, state: "open" };
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

/** Destination port that talks to the GitHub REST API. Tests pass `fetch`. */
export const createGithubDestination = ({ repo, token, fetch }) => {
  const api = async (method, path, body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "arcade-plugin-legacy-sync",
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (response.status === 404 && method === "GET" && path.includes("/git/ref/")) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${path} failed: ${response.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };

  return {
    async getBranchSha(branch) {
      const data = await api("GET", `/repos/${repo}/git/ref/heads/${branch}`);
      return data?.object?.sha ?? null;
    },
    async readFiles(sha) {
      const commit = await api("GET", `/repos/${repo}/git/commits/${sha}`);
      const tree = await api("GET", `/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
      if (tree.truncated) throw new Error("destination tree is truncated");
      const files = new Map();
      for (const item of tree.tree) {
        if (item.type === "tree") continue;
        if (item.type !== "blob") throw new Error(`${item.path} is a ${item.type}`);
        files.set(item.path, { mode: item.mode, blobSha: item.sha });
      }
      return files;
    },
    async createCommit({ parent, files, message }) {
      const tree = [];
      for (const [path, entry] of files) {
        let sha = entry.bytes ? null : entry.blobSha;
        if (entry.bytes) {
          const blob = await api("POST", `/repos/${repo}/git/blobs`, {
            content: entry.bytes.toString("base64"),
            encoding: "base64",
          });
          sha = blob.sha;
        }
        if (!sha) throw new Error(`${path} has no blob to commit`);
        tree.push({ path, mode: entry.mode, type: "blob", sha });
      }
      const created = await api("POST", `/repos/${repo}/git/trees`, { tree });
      const commit = await api("POST", `/repos/${repo}/git/commits`, {
        message,
        tree: created.sha,
        parents: [parent],
      });
      return commit.sha;
    },
    async compareAndSwap({ branch, from, to }) {
      if (PROTECTED_BRANCHES.has(branch)) {
        throw new Error(`refusing to update protected branch ${branch}`);
      }
      if (to === null) {
        const current = await api("GET", `/repos/${repo}/git/ref/heads/${branch}`);
        if (current?.object?.sha !== from) {
          throw new Error(`refusing to delete ${branch}; it is no longer ${from}`);
        }
        await api("DELETE", `/repos/${repo}/git/refs/heads/${branch}`);
        return;
      }
      if (from === null) {
        await api("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: to });
        return;
      }
      await api("PATCH", `/repos/${repo}/git/refs/heads/${branch}`, { sha: to, force: false });
    },
    async findOpenPull(branch) {
      const owner = repo.split("/")[0];
      const pulls = await api(
        "GET",
        `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
      );
      const pull = pulls[0];
      return pull ? { number: pull.number, title: pull.title, body: pull.body ?? "", branch } : null;
    },
    async createPull({ branch, base, title, body, draft }) {
      const pull = await api("POST", `/repos/${repo}/pulls`, { title, head: branch, base, body, draft });
      return { number: pull.number };
    },
    async updatePull({ number, title, body }) {
      await api("PATCH", `/repos/${repo}/pulls/${number}`, { title, body });
    },
  };
};

const printPlan = (sourceRepo, destRepo) => {
  const sourceFiles = readGitTree(sourceRepo, "HEAD");
  const destFiles = readGitTree(destRepo, "HEAD");
  const desired = desiredTree({ sourceFiles, destFiles });
  const plan = diffTrees(destFiles, desired);
  process.stdout.write(`${JSON.stringify({ action: "plan", ...plan }, null, 2)}\n`);
};

const applyLive = async () => {
  const gate = liveSyncGate(process.env);
  if (!gate.ok) {
    process.stdout.write(`${gate.reason}\n`);
    return;
  }
  const token = process.env.LEGACY_SYNC_TOKEN;
  if (!token) {
    throw new Error("LEGACY_SYNC_TOKEN is not set; refusing to call GitHub");
  }
  const head = gitCommand(ROOT, ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const sourceSha = process.env.SOURCE_SHA ?? head;
  if (sourceSha !== head) throw new Error(`SOURCE_SHA ${sourceSha} does not match HEAD ${head}`);
  const sourceMessage = gitCommand(ROOT, ["log", "-1", "--format=%B"], { encoding: "utf8" });
  const destination = createGithubDestination({
    repo: SYNC_CONTRACT.destRepo,
    token,
    fetch: globalThis.fetch,
  });
  const result = await runSync({
    sourceFiles: readGitTree(ROOT, "HEAD"),
    sourceSha,
    sourceMessage,
    destination,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes("--plan")) {
    const sourceFlag = args.indexOf("--source");
    const destFlag = args.indexOf("--dest");
    if (sourceFlag === -1 || destFlag === -1) throw new Error("--plan requires --source and --dest");
    printPlan(resolve(args[sourceFlag + 1]), resolve(args[destFlag + 1]));
    return;
  }
  if (args.includes("--apply")) {
    await applyLive();
    return;
  }
  process.stdout.write("legacy sync is inert. Pass --plan to diff two local repositories, or activate separately.\n");
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
