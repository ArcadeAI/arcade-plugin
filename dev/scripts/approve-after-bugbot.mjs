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
// Usage (in CI, on a workflow_run event): REPO=owner/name DEFAULT_BRANCH=main \
//   APPROVER_LOGIN=<app-slug>[bot] GH_TOKEN=<read token> \
//   APPROVER_TOKEN=<GitHub App token> node dev/scripts/approve-after-bugbot.mjs
// Reads the triggering run from GITHUB_EVENT_PATH and calls the GitHub API
// through `gh`: reads with GH_TOKEN, and only the approval and its dismissal
// with APPROVER_TOKEN.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The collaborator permission endpoint reports maintain access as "write".
const WRITE_PERMISSIONS = ["admin", "write"];
const BUGBOT_CHECK = "Cursor Bugbot";
const BUGBOT_APP = "cursor";
const CHECK_WORKFLOW = ".github/workflows/check.yml";
// .github/CODEOWNERS gives @ArcadeAI/engineering the CI and approver files,
// and main requires a code owner review, so changes there also need an
// approval from @ArcadeAI/engineering.

/**
 * Bugbot's runs on a commit that reviewed the code. Runs Bugbot cancelled
 * before reviewing are skipped.
 * @param {any[]} checkRuns
 */
const bugbotReviews = (checkRuns) =>
  checkRuns
    .filter((run) => run.name === BUGBOT_CHECK && run.app?.slug === BUGBOT_APP)
    .filter((run) => !/Bugbot run cancelled because/i.test(`${run.output?.title ?? ""} ${run.output?.summary ?? ""}`));

/**
 * Whether Bugbot passed on a commit for a pull request: at least one of its
 * runs there reviewed the code, and every one that did finished as a plain
 * success and lists the pull request. Asking Bugbot again on the same commit
 * can't replace an earlier finding. A neutral result doesn't count: it can
 * mean findings, including "no issues found. 1 previously reported issue
 * remain unresolved".
 * @param {any[]} checkRuns every check run on the commit, not only the latest
 * @param {number} prNumber
 */
export const bugbotClean = (checkRuns, prNumber) => {
  const reviews = bugbotReviews(checkRuns);
  return (
    reviews.length > 0 &&
    reviews.every(
      (run) =>
        run.status === "completed" &&
        run.conclusion === "success" &&
        (run.pull_requests ?? []).some((/** @type {any} */ pr) => pr.number === prNumber),
    )
  );
};

/**
 * Returns why the triggering workflow run can't lead to an approval, or null
 * when it may. It must be a successful check run from main's check.yml for
 * exactly one pull request from this repository that targets main.
 * @param {{ run: any, repo: string, defaultBranch: string }} facts
 */
export const triggerRefusal = ({ run, repo, defaultBranch }) => {
  if (run?.event !== "pull_request") return "the run that triggered this wasn't for a pull request";
  if (run.conclusion !== "success") return `check finished as ${run.conclusion}, not success`;
  if (run.path !== CHECK_WORKFLOW) return `the run that triggered this came from ${run.path}, not ${CHECK_WORKFLOW}`;
  if (run.repository?.full_name !== repo || run.head_repository?.full_name !== repo) return "check ran on a fork";
  const prs = run.pull_requests ?? [];
  if (prs.length !== 1) return `check ran for ${prs.length} pull requests, not exactly one`;
  const [pr] = prs;
  if (!Number.isInteger(pr.number) || pr.number <= 0) return `check ran for pull request ${pr.number}`;
  if (pr.base?.ref !== defaultBranch) return `check ran against ${pr.base?.ref}, not ${defaultBranch}`;
  if (pr.head?.sha !== run.head_sha) return `check ran on ${run.head_sha}, not the pull request's ${pr.head?.sha}`;
  return null;
};

/**
 * Returns why the pull request must not be approved, or null when it may be.
 * @param {{ run: any, repo: string, defaultBranch: string,
 *   pr: any, permission: string, bugbotRuns: any[],
 *   reviews: any[], approver: string, retargeted: boolean }} facts
 *   retargeted is whether the pull request's base was ever changed.
 */
export const refusal = (facts) => {
  const { run, repo, defaultBranch, pr, permission, bugbotRuns, reviews, approver, retargeted } = facts;
  const triggered = triggerRefusal(facts);
  if (triggered) return triggered;
  const [checked] = run.pull_requests;
  const headSha = run.head_sha;
  if (pr.number !== checked.number) return `it's #${pr.number}, not #${checked.number}, which check ran for`;
  if (pr.state !== "open") return "it isn't open";
  if (pr.draft) return "it's a draft";
  if (pr.base?.ref !== defaultBranch) return `it targets ${pr.base?.ref}, not ${defaultBranch}`;
  if (pr.head?.repo?.full_name !== repo) return "it comes from a fork";
  if (pr.head?.sha !== headSha) return `its latest commit is ${pr.head?.sha}, not the checked ${headSha}`;
  if (pr.user?.type !== "User") return `its author ${pr.user?.login} is not a person`;
  if (!WRITE_PERMISSIONS.includes(permission)) return `its author ${pr.user.login} has ${permission} access, not write`;
  if (!bugbotClean(bugbotRuns, pr.number)) return "not every Cursor Bugbot review of its latest commit finished with no findings for this pull request";
  if (retargeted) return "its base branch was changed";
  const handled = reviews.find((review) => review.user?.login === approver && review.commit_id === headSha);
  if (handled) return `${handled.user.login} already reviewed this commit (${handled.state})`;
  return null;
};

/**
 * @typedef {{ get: (path: string) => any, list: (path: string, key?: string) => any[],
 *   post: (path: string, body: object) => any, put: (path: string, body: object) => any }} Api
 *   get and list read; post and put write as the approver.
 */

/**
 * Decides on and, when allowed, approves the pull request that the triggering
 * check run belongs to.
 * @param {{ env: Record<string, string | undefined>, event: any, api: Api, log?: (line: string) => void }} options
 */
export const approveAfterBugbot = ({ env, event, api, log = console.log }) => {
  const { REPO: repo, DEFAULT_BRANCH: defaultBranch, APPROVER_LOGIN: approverLogin } = env;
  if (!repo || !defaultBranch || !approverLogin) throw new Error("REPO, DEFAULT_BRANCH, and APPROVER_LOGIN are required");
  const run = event?.workflow_run;
  const triggered = triggerRefusal({ run, repo, defaultBranch });
  if (triggered) {
    log(`Not approving: ${triggered}.`);
    return;
  }
  const headSha = run.head_sha;
  const number = run.pull_requests[0].number;
  const pull = `repos/${repo}/pulls/${number}`;

  const pr = api.get(pull);
  /** @type {string} */
  let permission = "none";
  if (pr.user?.type === "User") {
    try {
      permission = api.get(`repos/${repo}/collaborators/${pr.user.login}/permission`).permission ?? "none";
    } catch {
      permission = "none";
    }
  }
  const reviews = api.list(`${pull}/reviews?per_page=100`);
  // filter=all: the default returns only the latest run, which would let a
  // re-requested review hide an earlier finding.
  const bugbotRuns = api.list(
    `repos/${repo}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(BUGBOT_CHECK)}&filter=all&per_page=100`,
    "check_runs",
  );
  const retargeted = api
    .list(`repos/${repo}/issues/${number}/events?per_page=100`)
    .some((/** @type {any} */ item) => item.event === "base_ref_changed");

  const reason = refusal({
    run, repo, defaultBranch, pr, permission, bugbotRuns, reviews, approver: approverLogin, retargeted,
  });
  if (reason) {
    log(`Not approving #${number}: ${reason}.`);
    return;
  }
  const review = api.post(`${pull}/reviews`, {
    event: "APPROVE",
    commit_id: headSha,
    body: `Cursor Bugbot reviewed ${headSha} with no findings, and check passed. Approved automatically because ${pr.user.login} has write access.`,
  });
  const now = api.get(pull).head?.sha;
  if (now !== headSha) {
    api.put(`${pull}/reviews/${review.id}/dismissals`, {
      event: "DISMISS",
      message: `The latest commit moved from ${headSha} to ${now} while this approval was posted.`,
    });
    log(`Dismissed the approval of #${number}: its latest commit moved to ${now}.`);
    return;
  }
  log(`Approved #${number} at ${headSha}.`);
};

/**
 * @param {string[]} args @param {string} token @param {object} [body]
 */
const gh = (args, token, body) =>
  execFileSync("gh", ["api", ...args, ...(body ? ["--input", "-"] : [])], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: token },
    input: body ? JSON.stringify(body) : undefined,
  });

/** @param {Record<string, string | undefined>} env @returns {Api} */
const ghApi = (env) => {
  const { GH_TOKEN: readToken, APPROVER_TOKEN: approverToken } = env;
  if (!readToken || !approverToken) throw new Error("GH_TOKEN and APPROVER_TOKEN are required");
  return {
    get: (path) => JSON.parse(gh([path], readToken)),
    list: (path, key) =>
      gh(["--paginate", path, "--jq", key ? `.${key}[] | tojson` : ".[] | tojson"], readToken)
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    post: (path, body) => JSON.parse(gh(["-X", "POST", path], approverToken, body)),
    put: (path, body) => JSON.parse(gh(["-X", "PUT", path], approverToken, body)),
  };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { GITHUB_EVENT_PATH: eventPath } = process.env;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required");
  approveAfterBugbot({ env: process.env, event: JSON.parse(readFileSync(eventPath, "utf8")), api: ghApi(process.env) });
}
