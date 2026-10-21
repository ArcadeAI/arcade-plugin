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

/**
 * Whether Bugbot's run finished with no findings. Uses the same rule as the
 * Bugbot step of check.yml.
 * @param {any} run
 */
export const bugbotPassed = (run) => {
  if (!run || run.status !== "completed") return false;
  if (run.conclusion === "success") return true;
  return run.conclusion === "neutral" && /no issues found/i.test(run.output?.summary ?? "");
};

/**
 * Bugbot's newest run among a commit's check runs, or undefined.
 * @param {any[]} checkRuns
 */
export const latestBugbotRun = (checkRuns) =>
  checkRuns
    .filter((run) => run.name === BUGBOT_CHECK && run.app?.slug === BUGBOT_APP)
    .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
    .at(-1);

/**
 * Returns why the pull request must not be approved, or null when it may be.
 * @param {{ pr: any, repo: string, headSha: string, defaultBranch: string,
 *   permission: string, bugbotRun: any, reviews: any[] }} facts
 */
export const refusal = ({ pr, repo, headSha, defaultBranch, permission, bugbotRun, reviews }) => {
  if (pr.state !== "open") return "it isn't open";
  if (pr.draft) return "it's a draft";
  if (pr.base?.ref !== defaultBranch) return `it targets ${pr.base?.ref}, not ${defaultBranch}`;
  if (pr.head?.repo?.full_name !== repo) return "it comes from a fork";
  if (pr.head?.sha !== headSha) return `its latest commit is ${pr.head?.sha}, not the checked ${headSha}`;
  if (pr.user?.type !== "User") return `its author ${pr.user?.login} is not a person`;
  if (!WRITE_PERMISSIONS.includes(permission)) return `its author ${pr.user.login} has ${permission} access, not write`;
  if (!bugbotPassed(bugbotRun)) return "Cursor Bugbot hasn't reviewed its latest commit with no findings";
  if (reviews.some((review) => review.user?.login === APPROVER && review.state === "APPROVED" && review.commit_id === headSha)) {
    return "it's already approved at this commit";
  }
  return null;
};

/** @param {string[]} args */
const gh = (args) => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8" }));

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
  const checkRuns = gh([`repos/${repo}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(BUGBOT_CHECK)}&per_page=100`]).check_runs;
  const bugbotRun = latestBugbotRun(checkRuns);

  for (const { number } of candidates) {
    const pr = gh([`repos/${repo}/pulls/${number}`]);
    const permission = pr.user?.type === "User" ? permissionOf(repo, pr.user.login) : "none";
    const reviews = gh([`repos/${repo}/pulls/${number}/reviews?per_page=100`]);
    const reason = refusal({ pr, repo, headSha, defaultBranch, permission, bugbotRun, reviews });
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
