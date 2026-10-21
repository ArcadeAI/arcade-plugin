#!/usr/bin/env node
// Approves a pull request from an internal author once Cursor Bugbot has
// reviewed its latest commit with no findings. The approve-after-bugbot
// workflow runs this from main after the check workflow, so a pull request
// can't change these rules for itself, and nothing here runs its code.
//
// Internal means a person with write, maintain, or admin access to this
// repository. Pull requests from bots, forks, or anyone else still need a
// person's approval.
//
// Usage (in CI): REPO=owner/name HEAD_SHA=<sha> DEFAULT_BRANCH=main \
//   node dev/scripts/approve-after-bugbot.mjs
// Calls the GitHub API through `gh`, which authenticates with GH_TOKEN.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The collaborator permission endpoint reports maintain access as "write".
const WRITE_PERMISSIONS = ["admin", "write"];
const BUGBOT_CHECK = "Cursor Bugbot";
const BUGBOT_APP = "cursor";
const APPROVER = "github-actions[bot]";
// These decide what CI runs and what this script approves, so a pull request
// that changes them needs a person's approval.
const PROTECTED_PATHS = [
  ".github/",
  "dev/package.json",
  "dev/package-lock.json",
  "dev/scripts/approve-after-bugbot.mjs",
  "dev/test/approve-after-bugbot.test.mjs",
];

/**
 * Whether Bugbot passed on a commit: at least one of its runs there reviewed
 * the code, and every one that did finished as a plain success. Asking Bugbot
 * again on the same commit can't replace an earlier finding. A neutral result
 * doesn't count: it can mean findings, including "no issues found. 1
 * previously reported issue remain unresolved". Runs Bugbot cancelled before
 * reviewing are skipped.
 * @param {any[]} checkRuns every check run on the commit, not only the latest
 */
export const bugbotClean = (checkRuns) => {
  const reviews = checkRuns
    .filter((run) => run.name === BUGBOT_CHECK && run.app?.slug === BUGBOT_APP)
    .filter((run) => !/Bugbot run cancelled because/i.test(`${run.output?.title ?? ""} ${run.output?.summary ?? ""}`));
  return reviews.length > 0 && reviews.every((run) => run.status === "completed" && run.conclusion === "success");
};

/**
 * The protected paths a pull request's changed files touch. Renamed files
 * count by both their old and new names.
 * @param {string[]} changedFiles
 */
export const protectedChanges = (changedFiles) =>
  changedFiles.filter((file) => PROTECTED_PATHS.some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path)));

/**
 * Returns why the pull request must not be approved, or null when it may be.
 * @param {{ pr: any, repo: string, headSha: string, defaultBranch: string,
 *   permission: string, changedFiles: string[], bugbotRuns: any[], reviews: any[] }} facts
 */
export const refusal = ({ pr, repo, headSha, defaultBranch, permission, changedFiles, bugbotRuns, reviews }) => {
  if (pr.state !== "open") return "it isn't open";
  if (pr.draft) return "it's a draft";
  if (pr.base?.ref !== defaultBranch) return `it targets ${pr.base?.ref}, not ${defaultBranch}`;
  if (pr.head?.repo?.full_name !== repo) return "it comes from a fork";
  if (pr.head?.sha !== headSha) return `its latest commit is ${pr.head?.sha}, not the checked ${headSha}`;
  if (pr.user?.type !== "User") return `its author ${pr.user?.login} is not a person`;
  if (!WRITE_PERMISSIONS.includes(permission)) return `its author ${pr.user.login} has ${permission} access, not write`;
  const touched = protectedChanges(changedFiles);
  if (touched.length > 0) return `it changes ${touched.join(", ")}, which decide what CI runs or approves`;
  if (!bugbotClean(bugbotRuns)) return "not every Cursor Bugbot review of its latest commit finished with no findings";
  if (reviews.some((review) => review.user?.login === APPROVER && review.state === "APPROVED" && review.commit_id === headSha)) {
    return "it's already approved at this commit";
  }
  return null;
};

/** @param {string[]} args */
const gh = (args) => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8" }));

/**
 * Every page of a list endpoint, one item per line through --jq.
 * @param {string} path @param {string} jq
 */
const ghLines = (path, jq) =>
  execFileSync("gh", ["api", "--paginate", path, "--jq", jq], { encoding: "utf8" }).split("\n").filter(Boolean);

/** @param {string} repo @param {string} login */
const permissionOf = (repo, login) => {
  try {
    return gh([`repos/${repo}/collaborators/${login}/permission`]).permission ?? "none";
  } catch {
    return "none";
  }
};

const main = () => {
  const { REPO: repo, HEAD_SHA: headSha, DEFAULT_BRANCH: defaultBranch } = process.env;
  if (!repo || !headSha || !defaultBranch) throw new Error("REPO, HEAD_SHA, and DEFAULT_BRANCH are required");

  const candidates = gh([`repos/${repo}/commits/${headSha}/pulls`]).filter((/** @type {any} */ pr) => pr.state === "open");
  if (candidates.length === 0) {
    console.log(`No open pull request has ${headSha} as its latest commit.`);
    return;
  }
  // filter=all: the default returns only the latest run, which would let a
  // re-requested review hide an earlier finding.
  const bugbotRuns = ghLines(
    `repos/${repo}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(BUGBOT_CHECK)}&filter=all&per_page=100`,
    ".check_runs[] | tojson",
  ).map((line) => JSON.parse(line));

  for (const { number } of candidates) {
    const pr = gh([`repos/${repo}/pulls/${number}`]);
    const permission = pr.user?.type === "User" ? permissionOf(repo, pr.user.login) : "none";
    const reviews = gh([`repos/${repo}/pulls/${number}/reviews?per_page=100`]);
    const changedFiles = ghLines(`repos/${repo}/pulls/${number}/files?per_page=100`, ".[] | .filename, (.previous_filename // empty)");
    const reason = refusal({ pr, repo, headSha, defaultBranch, permission, changedFiles, bugbotRuns, reviews });
    if (reason) {
      console.log(`Not approving #${number}: ${reason}.`);
      continue;
    }
    gh([
      "-X", "POST", `repos/${repo}/pulls/${number}/reviews`,
      "-f", "event=APPROVE",
      "-f", `commit_id=${headSha}`,
      "-f", `body=Cursor Bugbot reviewed ${headSha} with no findings, and check passed. Approved automatically because ${pr.user.login} has write access.`,
    ]);
    console.log(`Approved #${number} at ${headSha}.`);
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
