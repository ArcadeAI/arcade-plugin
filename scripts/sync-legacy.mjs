#!/usr/bin/env node
// One-way mirror of the canonical tree onto arcadeai-labs/omnimcp.
// The file under sync/ is not an active workflow. This script refuses live
// writes unless a push to canonical main opts in with SYNC_LEGACY_APPLY=1.

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

import {
  SYNC_CONTRACT, desiredTree, diffTrees, entryFromBytes,
} from "./legacy-projection.mjs";
export * from "./legacy-projection.mjs";

const PROTECTED_BRANCHES = new Set(["main", "master"]);
const SYNC_MARKER = "Legacy-Sync-Commit: true";

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
    "Legacy-Sync-PR: true",
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
 * Never updates the destination base branch.
 * Every uncertain PR write retains the review branch and reconciles before
 * reporting recovery or an explicit action-required result.
 * When that retained branch matches the canonical tree, the destination
 * base does not, and no pull request is open, the result is `blocked`
 * and nothing is written.
 */
export const runSync = async ({
  sourceFiles,
  sourceSha,
  sourceMessage = "",
  destination,
  source,
  contract = SYNC_CONTRACT,
}) => {
  assertContract(contract);
  assertSourceSha(sourceSha);
  if (!source) throw new Error("a trusted canonical source port is required");
  const baseBefore = await destination.getBranchSha(contract.destBaseBranch);
  if (!baseBefore) throw new Error(`destination ${contract.destBaseBranch} does not exist`);
  let failure = null;
  let result = null;
  try {
    if (sourceMessage.includes(SYNC_MARKER)) {
      result = { action: "skip", reason: "source commit is a legacy sync commit" };
    } else {
      result = await syncBody({ sourceFiles, sourceSha, destination, source, contract });
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

/**
 * The sync branch already matches the canonical tree, but that tree is not on
 * the destination base and no pull request is open. Refuse to reopen a closed
 * pull request or to report the retained branch as delivered.
 */
const blockedUnmergedSync = ({ contract, sourceSha, syncSha, baseSha, plan, basePlan }) => ({
  action: "blocked",
  outcome: "action-required",
  pr: null,
  plan,
  basePlan,
  sourceSha,
  syncBranch: contract.syncBranch,
  syncSha,
  baseBranch: contract.destBaseBranch,
  baseSha,
  reason: `Action required: ${contract.syncBranch} at ${syncSha} matches canonical ${sourceSha}, but ${contract.destBaseBranch} at ${baseSha} does not, and no open pull request exists.`,
  recovery: [
    `This run did not create a commit, move ${contract.syncBranch}, open a pull request, or update ${contract.destBaseBranch}.`,
    `Inspect the retained branch and any closed pull request from ${contract.syncBranch} into ${contract.destBaseBranch}.`,
    "If that pull request was closed or rejected on purpose, leave it closed.",
    `If pull creation failed and the branch should still be reviewed, open one draft pull request from ${contract.syncBranch} into ${contract.destBaseBranch} by hand.`,
    "Do not reopen a deliberately closed pull request from this automation.",
  ].join(" "),
});

const provenance = (message, contract) => {
  const one = (key) => {
    const values = message.split("\n").filter((line) => line.startsWith(`${key}: `));
    return values.length === 1 ? values[0].slice(key.length + 2) : null;
  };
  const sha = one("Source-SHA");
  return one("Source-Repo") === contract.sourceRepo && /^[0-9a-f]{40}$/.test(sha ?? "") ? sha : null;
};

const blocked = (reason, details = {}) => ({
  action: "blocked", outcome: "action-required", reason,
  recovery: "Inspect the source, retained branch and pull request by hand. No branch is deleted or rewound; do not reopen a deliberately closed pull request automatically.",
  ...details,
});

// A name is not ownership. Check the marker, exact source provenance and tree.
const verifyOwnedHead = async ({ syncSha, parentFiles, baseFiles, source, destination, contract }) => {
  const commit = await destination.getCommit(syncSha);
  const recorded = provenance(commit.message, contract);
  if (!recorded || !commit.message.split("\n").includes(SYNC_MARKER) || commit.parents.length !== 1) {
    throw new Error(`refusing unowned sync branch ${contract.syncBranch} at ${syncSha}`);
  }
  const previousFiles = await source.readFiles(recorded);
  const expected = desiredTree({ sourceFiles: previousFiles, destFiles: baseFiles, contract });
  if (!diffTrees(parentFiles, expected).noop) {
    throw new Error(`refusing human or unexpected changes on ${contract.syncBranch} at ${syncSha}`);
  }
  return recorded;
};

export const selectSyncPull = (pulls, branch, contract = SYNC_CONTRACT) => {
  if (pulls.length === 0) return null;
  const valid = (pull) => pull.branch === branch && pull.base === contract.destBaseBranch &&
    pull.headRepo?.toLowerCase() === contract.destRepo.toLowerCase() &&
    pull.baseRepo?.toLowerCase() === contract.destRepo.toLowerCase() &&
    provenance(pull.body ?? "", contract) &&
    (pull.body ?? "").split("\n").includes(`Source-Branch: ${contract.sourceBranch}`);
  if (pulls.length !== 1 || !valid(pulls[0])) {
    throw new Error("refusing ambiguous, unowned or wrong-base sync pull request");
  }
  return pulls[0];
};

const syncBody = async ({ sourceFiles, sourceSha, destination, source, contract }) => {
  const currentSource = await source.getBranchSha(contract.sourceBranch);
  if (sourceSha !== currentSource) {
    if (await source.isAncestor(sourceSha, currentSource)) return { action: "skip", reason: "stale canonical source event", sourceSha, currentSource };
    return blocked("Source event is not current canonical main", { sourceSha, currentSource });
  }
  if (!diffTrees(await source.readFiles(sourceSha), sourceFiles).noop) throw new Error("source files differ from the immutable canonical source SHA");
  const baseSha = await destination.getBranchSha(contract.destBaseBranch);
  const syncSha = await destination.getBranchSha(contract.syncBranch);
  const parentSha = syncSha ?? baseSha;
  const baseFiles = await destination.readFiles(baseSha);
  const parentFiles = syncSha ? await destination.readFiles(syncSha) : baseFiles;
  const open = await destination.findOpenPull(contract.syncBranch, contract);
  if (open && !syncSha) return blocked("Open sync PR has no branch; inspect by hand");
  if (syncSha) {
    const recorded = await verifyOwnedHead({ syncSha, parentFiles, baseFiles, source, destination, contract });
    if (recorded !== sourceSha && !await source.isAncestor(recorded, sourceSha)) {
      return blocked("Refusing to replace a newer or unrelated delivered source snapshot", { sourceSha, deliveredSource: recorded });
    }
  }
  const desired = desiredTree({ sourceFiles, destFiles: baseFiles, contract });
  const plan = diffTrees(parentFiles, desired);
  const body = syncPullBody(sourceSha, contract);
  const title = syncPullTitle(sourceSha, contract);
  if (plan.noop) {
    if (open && provenance(open.body, contract) !== sourceSha) {
      if (await source.getBranchSha(contract.sourceBranch) !== sourceSha) return { action: "skip", reason: "source advanced before PR update" };
      await destination.updatePull({ number: open.number, title, body });
      return { action: "update-provenance", pr: open.number, plan };
    }
    if (!open && syncSha && syncSha !== baseSha) {
      const basePlan = diffTrees(baseFiles, desired);
      if (!basePlan.noop) return blockedUnmergedSync({ contract, sourceSha, syncSha, baseSha, plan, basePlan });
    }
    return { action: "noop", pr: open?.number ?? null, plan };
  }
  if (await source.getBranchSha(contract.sourceBranch) !== sourceSha) return { action: "skip", reason: "source advanced before commit creation" };
  const newSha = await destination.createCommit({ parent: parentSha, files: desired, message: syncCommitMessage(sourceSha, contract) });
  if (await source.getBranchSha(contract.sourceBranch) !== sourceSha) return { action: "skip", reason: "source advanced before branch update" };
  await destination.compareAndSwap({ branch: contract.syncBranch, from: syncSha, to: newSha });
  try {
    if (open) {
      await destination.updatePull({ number: open.number, title, body });
      return { action: "update", pr: open.number, commit: newSha, plan };
    }
    const pr = await destination.createPull({ branch: contract.syncBranch, base: contract.destBaseBranch, title, body, draft: true });
    return { action: "create", pr: pr.number, commit: newSha, plan };
  } catch (error) {
    // A transport failure does not prove the POST was rejected. Reconcile,
    // never delete a possibly accepted PR's head (nor an unrelated new head).
    try {
      const retained = await destination.getBranchSha(contract.syncBranch);
      const reconciled = await destination.findOpenPull(contract.syncBranch, contract);
      if (!open && retained === newSha && reconciled && provenance(reconciled.body, contract) === sourceSha) {
        return { action: "recovered", pr: reconciled.number, commit: newSha, plan, reason: "PR creation accepted; response was lost" };
      }
    } catch { /* A failed reconciliation also leaves the branch untouched. */ }
    return blocked(`Sync PR write outcome needs inspection: ${error.message}`, { syncSha: newSha, sourceSha, pr: open?.number ?? null, plan });
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
  async getCommit(sha) {
    return { message: gitCommand(repo, ["show", "-s", "--format=%B", sha], { encoding: "utf8" }),
      parents: gitCommand(repo, ["show", "-s", "--format=%P", sha], { encoding: "utf8" }).trim().split(" ").filter(Boolean) };
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
    if (to === null) throw new Error("automation never deletes a review branch");
    if (from === null) {
      gitCommand(repo, ["update-ref", `refs/heads/${branch}`, to, "0".repeat(40)]);
      return;
    }
    gitCommand(repo, ["update-ref", `refs/heads/${branch}`, to, from]);
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

/** GitHub git-ref path. Nested branch names must encode `/` as `%2F`. */
export const githubRefPath = (branch) =>
  `heads/${branch.split("/").map((part) => encodeURIComponent(part)).join("%2F")}`;

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
      const data = await api("GET", `/repos/${repo}/git/ref/${githubRefPath(branch)}`);
      return data?.object?.sha ?? null;
    },
    async getCommit(sha) {
      const commit = await api("GET", `/repos/${repo}/git/commits/${sha}`);
      return { message: commit.message, parents: commit.parents.map((parent) => parent.sha) };
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
      if (to === null) throw new Error("automation never deletes a review branch");
      const current = await api("GET", `/repos/${repo}/git/ref/${githubRefPath(branch)}`);
      if ((current?.object?.sha ?? null) !== from) throw new Error(`sync branch changed before update: ${branch}`);
      if (from === null) {
        await api("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: to });
        return;
      }
      await api("PATCH", `/repos/${repo}/git/refs/${githubRefPath(branch)}`, { sha: to, force: false });
    },
    async findOpenPull(branch, contract = SYNC_CONTRACT) {
      const owner = repo.split("/")[0];
      const head = `${encodeURIComponent(owner)}:${encodeURIComponent(branch)}`;
      const pulls = [];
      for (let page = 1; ; page++) {
        const batch = await api("GET", `/repos/${repo}/pulls?state=open&head=${head}&per_page=100&page=${page}`);
        pulls.push(...batch.map((pull) => ({ number: pull.number, title: pull.title, body: pull.body ?? "",
          branch: pull.head?.ref, base: pull.base?.ref, headRepo: pull.head?.repo?.full_name, baseRepo: pull.base?.repo?.full_name })));
        if (batch.length < 100) break;
      }
      return selectSyncPull(pulls, branch, contract);
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

/** Print a sync result. Blocked delivery exits non-zero so a workflow cannot treat it as success. */
export const reportSyncResult = (result, { stdout = process.stdout, stderr = process.stderr } = {}) => {
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.action === "blocked") {
    stderr.write(`${result.reason}\n${result.recovery}\n`);
    return 1;
  }
  return 0;
};

export const createGitSource = ({ repo, remote = null }) => ({
  async getBranchSha(branch) {
    if (remote) {
      gitCommand(repo, ["fetch", "--no-tags", remote, `refs/heads/${branch}`]);
      return gitCommand(repo, ["rev-parse", "FETCH_HEAD"], { encoding: "utf8" }).trim();
    }
    return gitCommand(repo, ["rev-parse", `refs/heads/${branch}`], { encoding: "utf8" }).trim();
  },
  async readFiles(sha) { return readGitTree(repo, sha); },
  async isAncestor(ancestor, descendant) {
    const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: repo });
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new Error("cannot establish canonical source ancestry");
  },
});

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
    source: createGitSource({ repo: ROOT, remote: "origin" }),
  });
  process.exitCode = reportSyncResult(result);
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
