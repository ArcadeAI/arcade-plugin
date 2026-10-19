#!/usr/bin/env node
// Git transports release snapshots; gh only reads release metadata and
// creates/reconciles draft PRs.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SYNC_CONTRACT, desiredTree, diffTrees, entryFromBytes, releaseBranch, snapshotProvenance } from "./legacy-projection.mjs";
import { assertReleaseVersion } from "./sync-version.mjs";
export * from "./legacy-projection.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = (program, args, { cwd, input, env } = {}) => {
  const result = spawnSync(program, args, { cwd, input, env: { ...process.env, ...env }, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args[0]} failed: ${result.stderr.toString("utf8")}`);
  return result.stdout;
};
const git = (repo, args, options = {}) => command("git", args, { cwd: repo, ...options });
const text = (bytes) => bytes.toString("utf8").trim();
const sha = (value) => { if (!/^[0-9a-f]{40}$/.test(value ?? "")) throw new Error("expected an immutable commit SHA"); return value; };
const version = (files) => JSON.parse(files.get("plugin.json").bytes.toString("utf8")).version;

export const readGitTree = (repo, rev = "HEAD") => new Map(text(git(repo, ["ls-tree", "-r", "-z", rev])).split("\0").filter(Boolean).map((record) => {
  const tab = record.indexOf("\t");
  const [mode, type, blob] = record.slice(0, tab).split(" ");
  if (type !== "blob" || !["100644", "100755"].includes(mode)) throw new Error(`unsupported mirror entry ${record.slice(tab + 1)}`);
  return [record.slice(tab + 1), entryFromBytes(mode, git(repo, ["cat-file", "blob", blob]))];
}));

export const syncCommitMessage = (sourceSha, tag, contract = SYNC_CONTRACT) =>
  `sync: mirror ${tag}\n\nSource-SHA: ${sha(sourceSha)}\nSource-Tag: ${tag}\nSource-Repo: ${contract.sourceRepo}\nLegacy-Sync-Commit: true\n`;
export const syncPullBody = (sourceSha, tag, contract = SYNC_CONTRACT) =>
  `${syncCommitMessage(sourceSha, tag, contract)}\nRelease snapshot only. Canonical history is not imported; destination main is never updated by this automation.\n`;

export const liveSyncGate = (env, event) => {
  if (env.SYNC_LEGACY_APPLY !== "1" || env.GITHUB_REPOSITORY !== SYNC_CONTRACT.sourceRepo) return false;
  const release = event?.release;
  if (env.GITHUB_EVENT_NAME === "release") return event.action === "published" && Boolean(release?.published_at) &&
    !release.draft && !release.prerelease && env.GITHUB_REF === `refs/tags/${release.tag_name}`;
  // Reusable workflows inherit the caller's event, not "workflow_call".
  // Release Please's GITHUB_TOKEN releases do not emit a downstream release
  // event; its release_created job explicitly calls the staged template.
  if (env.SYNC_LEGACY_RELEASE_CALL !== "1" || env.GITHUB_REF !== "refs/heads/main" || !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)) return false;
  try { releaseBranch(env.SOURCE_TAG); return true; } catch { return false; }
};

export const createGitSource = ({ repo, remote = "origin", releases }) => ({
  async release(tag) {
    releaseBranch(tag);
    const release = await releases.release(tag);
    if (release.tag_name !== tag || release.draft || release.prerelease || !release.published_at) throw new Error("source must be a published stable release");
    // target_commitish can be a mutable branch: always peel the actual tag.
    git(repo, ["fetch", "--no-tags", remote, `refs/tags/${tag}`]);
    const sourceSha = sha(text(git(repo, ["rev-parse", "FETCH_HEAD^{commit}"])));
    git(repo, ["fetch", "--no-tags", remote, `refs/heads/${SYNC_CONTRACT.sourceBranch}`]);
    const main = sha(text(git(repo, ["rev-parse", "FETCH_HEAD"])));
    const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", sourceSha, main], { cwd: repo });
    if (ancestry.status !== 0) throw new Error("release commit is not on canonical main");
    return { sha: sourceSha, tag };
  },
  async readFiles(sourceSha) { return readGitTree(repo, sourceSha); },
});

/** A temporary clone and native Git index preserve bytes/modes without importing source history. */
export const createGitDestination = ({ repo, remote = "origin", env = {} }) => {
  const runGit = (args, options = {}) => git(repo, args, { env, ...options });
  return {
    async branch(branch) {
      const refs = text(runGit(["ls-remote", "--heads", remote, `refs/heads/${branch}`]));
      if (!refs) return null;
      const head = sha(refs.split(/\s/)[0]);
      runGit(["fetch", "--no-tags", remote, `refs/heads/${branch}`]);
      if (text(runGit(["rev-parse", "FETCH_HEAD"])) !== head) throw new Error("destination branch changed during read; rerun");
      return head;
    },
    async files(rev) { return readGitTree(repo, rev); },
    async commit(rev) {
      return { message: runGit(["show", "-s", "--format=%B", rev]).toString("utf8"), parents: text(runGit(["show", "-s", "--format=%P", rev])).split(" ") };
    },
    async snapshot({ files, parent, message }) {
      runGit(["read-tree", "--empty"]);
      const index = [...files].map(([path, entry]) => {
        const blob = text(runGit(["hash-object", "-w", "--stdin"], { input: entry.bytes }));
        return `${entry.mode} ${blob}\t${path}\0`;
      }).join("");
      runGit(["update-index", "-z", "--index-info"], { input: index });
      const tree = text(runGit(["write-tree"]));
      return text(runGit(["commit-tree", tree, "-p", parent], { input: message, env: {
        GIT_AUTHOR_NAME: "Arcade release sync", GIT_AUTHOR_EMAIL: "support@arcade.dev",
        GIT_COMMITTER_NAME: "Arcade release sync", GIT_COMMITTER_EMAIL: "support@arcade.dev",
      } }));
    },
    async push(branch, commit) {
      if (releaseBranch(branch.replace(/^sync\/release-/, "")) !== branch) throw new Error("refusing non-release destination branch");
      if (await this.branch(branch)) throw new Error("release branch already exists; refusing to overwrite it");
      // No force, deletion, main update, or canonical history transfer.
      runGit(["push", "--porcelain", remote, `${sha(commit)}:refs/heads/${branch}`]);
    },
  };
};

export const createGithub = ({ token, run = command }) => {
  const api = (args, input) => JSON.parse(run("gh", ["api", ...args], { input, env: { GH_TOKEN: token } }).toString("utf8"));
  return {
    async release(tag) { return api([`repos/${SYNC_CONTRACT.sourceRepo}/releases/tags/${encodeURIComponent(tag)}`]); },
    async pulls(branch) {
      const pulls = api(["--method", "GET", `repos/${SYNC_CONTRACT.destRepo}/pulls`, "-f", "state=all", "-f", `head=${SYNC_CONTRACT.destRepo.split("/")[0]}:${branch}`, "-f", "per_page=100"]);
      if (pulls.length === 100) throw new Error("ambiguous release PR history; inspect manually");
      return pulls;
    },
    async createPull({ branch, sourceSha, tag }) {
      return api([`repos/${SYNC_CONTRACT.destRepo}/pulls`, "--input", "-"], JSON.stringify({
        title: `sync: mirror ${tag}`, head: branch, base: SYNC_CONTRACT.destBaseBranch,
        body: syncPullBody(sourceSha, tag), draft: true,
      }));
    },
  };
};

const ownedPull = (pulls, branch, sourceSha, tag) => {
  if (pulls.length !== 1) throw new Error("ambiguous release PR; inspect manually");
  const pull = pulls[0];
  const pin = snapshotProvenance(pull.body ?? "");
  if (pull.head?.ref !== branch || pull.head?.repo?.full_name !== SYNC_CONTRACT.destRepo ||
      pull.base?.ref !== SYNC_CONTRACT.destBaseBranch || pull.base?.repo?.full_name !== SYNC_CONTRACT.destRepo ||
      pin.sha !== sourceSha || pin.tag !== tag) throw new Error("refusing unowned or wrong-base release PR");
  return pull;
};

/** One branch per release. Existing branches are only read, never updated. */
export const runSync = async ({ tag, source, destination, github }) => {
  const branch = releaseBranch(tag);
  const pin = await source.release(tag);
  sha(pin.sha);
  if (pin.tag !== tag) throw new Error("source release tag differs from requested tag");
  const sourceFiles = await source.readFiles(pin.sha);
  for (const path of Object.values(SYNC_CONTRACT.replacements)) {
    if (!sourceFiles.has(path)) throw new Error(`release lacks required mirror control ${path}`);
  }
  const base = await destination.branch(SYNC_CONTRACT.destBaseBranch);
  if (!base) throw new Error("destination main does not exist");
  const baseFiles = await destination.files(base);
  const desired = desiredTree({ sourceFiles, destFiles: baseFiles });
  const plan = diffTrees(baseFiles, desired);
  assertReleaseVersion({ sourceVersion: version(sourceFiles), destinationVersion: version(baseFiles), tag, sameTree: plan.noop });
  const existing = await destination.branch(branch);
  const pulls = await github.pulls(branch);
  if (existing) {
    const commit = await destination.commit(existing);
    const owned = snapshotProvenance(commit.message);
    if (owned.sha !== pin.sha || owned.tag !== tag || commit.parents.length !== 1 || !diffTrees(await destination.files(existing), desired).noop) throw new Error("release branch differs or contains human work; inspect manually");
    if (!pulls.length) throw new Error("release branch retained without a PR; inspect and open manually");
    const pull = ownedPull(pulls, branch, pin.sha, tag);
    if (pull.state === "open" && commit.parents[0] !== base) throw new Error("destination main changed since this snapshot; review a fresh snapshot manually");
    return { action: pull.state === "open" ? "noop" : "closed", pr: pull.number, sourceSha: pin.sha, tag, branch };
  }
  if (pulls.length) throw new Error("release PR already exists; never reopen an intentionally closed PR");
  if (plan.noop) return { action: "noop", sourceSha: pin.sha, tag };
  const commit = await destination.snapshot({ files: desired, parent: base, message: syncCommitMessage(pin.sha, tag) });
  if ((await source.release(tag)).sha !== pin.sha) throw new Error("release tag changed before push");
  if (await destination.branch(SYNC_CONTRACT.destBaseBranch) !== base) throw new Error("destination main changed before push; rerun");
  await destination.push(branch, commit);
  try {
    const pull = await github.createPull({ branch, sourceSha: pin.sha, tag });
    return { action: "create", pr: pull.number, commit, sourceSha: pin.sha, tag, branch };
  } catch (error) {
    // A failed response may have been accepted. Read once; never retry POST or delete.
    const recovered = await github.pulls(branch);
    if (await destination.branch(branch) === commit && recovered.length) {
      const pull = ownedPull(recovered, branch, pin.sha, tag);
      if (pull.state === "open" && pull.head.sha === commit) return { action: "recovered", pr: pull.number, commit, sourceSha: pin.sha, tag, branch };
    }
    throw new Error(`PR creation outcome needs manual inspection; branch retained: ${error.message}`);
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  if (args.includes("--plan")) {
    if (!args.includes("--source") || !args.includes("--dest")) throw new Error("--plan requires --source and --dest");
    const sourceFiles = readGitTree(resolve(value("--source"))), destFiles = readGitTree(resolve(value("--dest")));
    console.log(JSON.stringify({ action: "plan", ...diffTrees(destFiles, desiredTree({ sourceFiles, destFiles })) }, null, 2));
    return;
  }
  if (!args.includes("--apply")) { console.log("--plan compares local repositories; release automation supplies --apply"); return; }
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  if (!liveSyncGate(process.env, event)) throw new Error("live sync requires an opted-in canonical release event or Release Please call");
  const token = process.env.OMNIMCP_SYNC_TOKEN;
  if (!token) throw new Error("OMNIMCP_SYNC_TOKEN is required");
  const github = createGithub({ token });
  const temp = mkdtempSync(join(tmpdir(), "arcade-release-sync-"));
  try {
    // Use gh's credential helper, keeping the token out of command arguments/URLs.
    const authEnv = { GH_TOKEN: token, GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "", GIT_CONFIG_KEY_1: "credential.helper", GIT_CONFIG_VALUE_1: "!gh auth git-credential" };
    git(temp, ["clone", "--no-checkout", `https://github.com/${SYNC_CONTRACT.destRepo}.git`, "destination"], { env: authEnv });
    console.log(JSON.stringify(await runSync({ tag: event.release?.tag_name ?? process.env.SOURCE_TAG, source: createGitSource({ repo: ROOT, releases: github }), destination: createGitDestination({ repo: join(temp, "destination"), env: authEnv }), github }), null, 2));
  } finally { rmSync(temp, { recursive: true, force: true }); }
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
