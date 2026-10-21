import assert from "node:assert/strict";
import { test } from "node:test";
import { approveAfterBugbot, bugbotClean, protectedChanges, refusal, triggerRefusal } from "../scripts/approve-after-bugbot.mjs";
import { readRepoFile } from "./helpers.mjs";

const REPO = "ArcadeAI/arcade-plugin";
const SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);
const NUMBER = 7;
const APPROVER = "arcade-pr-approver[bot]";
const run = (/** @type {object} */ changes = {}) => ({
  name: "Cursor Bugbot",
  app: { slug: "cursor" },
  status: "completed",
  conclusion: "success",
  started_at: "2026-10-01T12:00:00Z",
  pull_requests: [{ number: NUMBER, base: { ref: "main" } }],
  output: { summary: "**Final Result:** Bugbot completed review - no issues found! ✅" },
  ...changes,
});
// Summaries copied from real Bugbot runs in this repository.
const neutral = (/** @type {string} */ summary) => run({ conclusion: "neutral", output: { summary } });
const UNRESOLVED = "**Final Result:** Bugbot completed review - no issues found. 1 previously reported issue remain unresolved.";
const FOUND = "**Final Result:** Bugbot completed review and found 1 potential issue.";
const CANCELLED_PUSH = "**Result:** Bugbot run cancelled because a new commit was pushed to the PR";
const CANCELLED_REQUEST = "**Result:** Bugbot run cancelled because the review request was cancelled";

const checkedPr = (/** @type {object} */ changes = {}) => ({
  number: NUMBER,
  head: { ref: "feature", sha: SHA },
  base: { ref: "main", sha: BASE_SHA },
  ...changes,
});
const workflowRun = (/** @type {object} */ changes = {}) => ({
  event: "pull_request",
  conclusion: "success",
  path: ".github/workflows/check.yml",
  head_sha: SHA,
  repository: { full_name: REPO },
  head_repository: { full_name: REPO },
  pull_requests: [checkedPr()],
  ...changes,
});
const pull = (/** @type {object} */ changes = {}) => ({
  number: NUMBER,
  state: "open",
  draft: false,
  base: { ref: "main", sha: BASE_SHA },
  head: { sha: SHA, repo: { full_name: REPO } },
  user: { login: "teallarson", type: "User" },
  changed_files: 1,
  ...changes,
});

const facts = (overrides = {}) => ({
  run: workflowRun(),
  repo: REPO,
  defaultBranch: "main",
  pr: pull(),
  permission: "write",
  files: [{ filename: "docs/telemetry.md" }],
  bugbotRuns: [run()],
  reviews: [],
  approver: APPROVER,
  retargeted: false,
  ...overrides,
});
const withPr = (/** @type {object} */ changes) => facts({ pr: pull(changes) });
const withRun = (/** @type {object} */ changes) => facts({ run: workflowRun(changes) });

test("approves an internal author's pull request once Bugbot passed on its latest commit", () => {
  assert.equal(refusal(facts()), null);
  assert.equal(refusal(facts({ permission: "admin" })), null);
});

test("refuses pull requests that aren't ready: closed, draft, or not targeting main", () => {
  assert.match(refusal(withPr({ state: "closed" })), /isn't open/);
  assert.match(refusal(withPr({ draft: true })), /draft/);
  assert.match(refusal(withPr({ base: { ref: "release/0.7", sha: BASE_SHA } })), /targets release\/0\.7/);
});

test("refuses forks and pull requests whose latest commit isn't the one checked", () => {
  assert.match(refusal(withPr({ head: { sha: SHA, repo: { full_name: "someone/arcade-plugin" } } })), /fork/);
  assert.match(refusal(withPr({ head: { sha: null, repo: null } })), /fork/);
  assert.match(refusal(withPr({ head: { sha: "c".repeat(40), repo: { full_name: REPO } } })), /latest commit is c+/);
  assert.match(refusal(withRun({ head_repository: { full_name: "someone/arcade-plugin" } })), /fork/);
});

test("refuses bots and people without write access", () => {
  assert.match(refusal(withPr({ user: { login: "claude[bot]", type: "Bot" } })), /not a person/);
  assert.match(refusal(withPr({ user: { login: "github-actions[bot]", type: "Bot" } })), /not a person/);
  for (const permission of ["read", "triage", "none"]) {
    assert.match(refusal(facts({ permission })), new RegExp(`has ${permission} access`), permission);
  }
});

test("binds the approval to the one pull request the check run was for", () => {
  assert.match(refusal(withRun({ pull_requests: [] })), /0 pull requests/);
  assert.match(refusal(withRun({ pull_requests: [checkedPr(), checkedPr({ number: 8 })] })), /2 pull requests/);
  assert.match(refusal(withRun({ pull_requests: [checkedPr({ number: 0 })] })), /pull request 0/);
  assert.match(refusal(withRun({ pull_requests: [checkedPr({ number: "7" })] })), /pull request 7/);
  assert.match(refusal(withPr({ number: 8 })), /#8, not #7/);
  assert.match(refusal(withRun({ pull_requests: [checkedPr({ head: { sha: "c".repeat(40) } })] })), /check ran on a+, not/);
});

test("refuses a run that isn't a successful pull request run of main's check.yml", () => {
  assert.match(refusal(withRun({ event: "push" })), /wasn't for a pull request/);
  assert.match(refusal(withRun({ conclusion: "failure" })), /failure, not success/);
  assert.match(refusal(withRun({ path: ".github/workflows/impostor.yml" })), /impostor\.yml/);
  assert.match(triggerRefusal({ run: undefined, repo: REPO, defaultBranch: "main" }), /wasn't for a pull request/);
});

test("refuses when check ran against a base other than main", () => {
  assert.match(refusal(withRun({ pull_requests: [checkedPr({ base: { ref: "release/0.7", sha: BASE_SHA } })] })), /check ran against release\/0\.7/);
});

test("requires every Bugbot review to list this pull request, so a shared commit can't borrow one", () => {
  assert.match(refusal(facts({ bugbotRuns: [run({ pull_requests: [{ number: 8 }] })] })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRuns: [run({ pull_requests: [] })] })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRuns: [run(), run({ pull_requests: undefined })] })), /Bugbot/);
  assert.equal(refusal(facts({ bugbotRuns: [run({ pull_requests: [{ number: 8 }, { number: NUMBER }] })] })), null);
});

test("refuses a pull request whose base was ever changed", () => {
  assert.match(refusal(facts({ retargeted: true })), /base branch was changed/);
  assert.equal(refusal(facts({ retargeted: false })), null);
});

test("counts only a plain success, so unresolved or new findings refuse", () => {
  assert.match(refusal(facts({ bugbotRuns: [neutral(UNRESOLVED)] })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRuns: [neutral(FOUND)] })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRuns: [run({ status: "in_progress", conclusion: null })] })), /Bugbot/);
  for (const conclusion of ["failure", "cancelled", "timed_out", "action_required", "skipped"]) {
    assert.match(refusal(facts({ bugbotRuns: [run({ conclusion, output: {} })] })), /Bugbot/, conclusion);
  }
});

test("requires every Bugbot review of the commit to pass, so asking again can't hide a finding", () => {
  assert.match(refusal(facts({ bugbotRuns: [neutral(FOUND), run()] })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRuns: [run(), neutral(FOUND)] })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRuns: [run(), run({ status: "in_progress", conclusion: null })] })), /Bugbot/);
  assert.equal(refusal(facts({ bugbotRuns: [run(), run()] })), null);
});

test("skips runs Bugbot cancelled before reviewing, but needs at least one review", () => {
  assert.equal(refusal(facts({ bugbotRuns: [neutral(CANCELLED_PUSH), run()] })), null);
  assert.equal(refusal(facts({ bugbotRuns: [neutral(CANCELLED_REQUEST), run()] })), null);
  assert.match(refusal(facts({ bugbotRuns: [neutral(CANCELLED_PUSH)] })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRuns: [] })), /Bugbot/);
});

test("ignores check runs from other apps that use Bugbot's name", () => {
  const impostor = run({ app: { slug: "someone-else" } });
  assert.equal(bugbotClean([impostor], NUMBER), false);
  assert.equal(bugbotClean([run(), { ...impostor, conclusion: "failure" }], NUMBER), true);
});

test("fails closed when comparing the commits didn't list every changed file", () => {
  const many = (/** @type {number} */ count) => Array.from({ length: count }, (_, i) => ({ filename: `docs/${i}.md` }));
  assert.match(refusal(facts({ pr: pull({ changed_files: 301 }), files: many(300) })), /301 files, more than the 300/);
  assert.match(refusal(facts({ pr: pull({ changed_files: 4 }), files: many(3) })), /listed 3 of its 4/);
  assert.match(refusal(facts({ pr: pull({ changed_files: undefined }) })), /listed 1 of its undefined/);
  assert.equal(refusal(facts({ pr: pull({ changed_files: 300 }), files: many(300) })), null);
});

test("refuses pull requests that change CI or this approver", () => {
  for (const file of [
    ".github/workflows/check.yml",
    ".github/workflows/approve-after-bugbot.yml",
    ".github/workflows/new.yml",
    "dev/package.json",
    "dev/package-lock.json",
    "dev/scripts/approve-after-bugbot.mjs",
    "dev/test/approve-after-bugbot.test.mjs",
  ]) {
    const files = [{ filename: "README.md" }, { filename: file }];
    assert.match(refusal(facts({ pr: pull({ changed_files: 2 }), files })), new RegExp(`changes ${file.replaceAll(".", "\\.")}`), file);
  }
  const renamed = [{ filename: "docs/workflow.yml", previous_filename: ".github/workflows/check.yml" }];
  assert.match(refusal(facts({ files: renamed })), /changes \.github\/workflows\/check\.yml/);
  assert.deepEqual(protectedChanges(["docs/.github-notes.md", "dev/scripts/package-chatgpt.mjs", "hooks/telemetry.mjs"]), []);
});

test("reviews a commit once, even after someone dismissed the approval", () => {
  const review = (/** @type {string} */ login, /** @type {string} */ state, commitId = SHA) => ({ user: { login }, state, commit_id: commitId });
  assert.match(refusal(facts({ reviews: [review(APPROVER, "APPROVED")] })), /already reviewed this commit \(APPROVED\)/);
  assert.match(refusal(facts({ reviews: [review(APPROVER, "DISMISSED")] })), /already reviewed this commit \(DISMISSED\)/);
  assert.equal(refusal(facts({ reviews: [review(APPROVER, "DISMISSED", "c".repeat(40))] })), null);
  assert.equal(refusal(facts({ reviews: [review("laughnan", "DISMISSED")] })), null);
});

/**
 * A fake GitHub API holding one pull request, with the answers the script
 * reads. headAfterPost is the head the pull request has once the approval is
 * posted. files is what comparing the pull request's base with headSha
 * returns; filesBySha lets a test give a different answer for some other
 * commit, to show the script never asks for that commit's files at all.
 */
const fakeApi = (/** @type {Record<string, any>} */ overrides = {}) => {
  const state = {
    pr: pull(),
    files: [{ filename: "docs/telemetry.md" }],
    filesBySha: /** @type {Record<string, any[]>} */ ({}),
    reviews: [],
    events: [],
    bugbotRuns: [run()],
    permission: "write",
    headAfterPost: SHA,
    ...overrides,
  };
  /** @type {{ method: string, path: string, body?: any }[]} */
  const calls = [];
  let posted = false;
  const pulls = `repos/${REPO}/pulls/${NUMBER}`;
  return {
    calls,
    api: {
      get: (/** @type {string} */ path) => {
        calls.push({ method: "GET", path });
        if (path === pulls) {
          const sha = posted ? state.headAfterPost : SHA;
          return { ...state.pr, head: { ...state.pr.head, sha } };
        }
        if (path === `repos/${REPO}/collaborators/teallarson/permission`) return { permission: state.permission };
        const compared = path.match(/^repos\/[^/]+\/[^/]+\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/);
        if (compared) return { files: state.filesBySha[compared[2]] ?? state.files };
        throw new Error(`unexpected GET ${path}`);
      },
      list: (/** @type {string} */ path, /** @type {string | undefined} */ key) => {
        calls.push({ method: "LIST", path });
        // Kept so a regression back to this unpinned, SHA-less endpoint shows
        // up as a wrong decision (it answers from state.files, which the race
        // test sets to what a live read could show mid-force-push), not as a
        // crash from a missing stub.
        if (path.startsWith(`${pulls}/files`)) return state.files;
        if (path.startsWith(`${pulls}/reviews`)) return state.reviews;
        if (path.startsWith(`repos/${REPO}/issues/${NUMBER}/events`)) return state.events;
        if (path.startsWith(`repos/${REPO}/commits/${SHA}/check-runs`) && key === "check_runs") return state.bugbotRuns;
        throw new Error(`unexpected LIST ${path}`);
      },
      post: (/** @type {string} */ path, /** @type {any} */ body) => {
        calls.push({ method: "POST", path, body });
        posted = true;
        return { id: 99 };
      },
      put: (/** @type {string} */ path, /** @type {any} */ body) => {
        calls.push({ method: "PUT", path, body });
        return {};
      },
    },
  };
};
const ENV = { REPO, DEFAULT_BRANCH: "main", APPROVER_LOGIN: APPROVER };
const decide = (/** @type {Record<string, any>} */ overrides = {}, event = { workflow_run: workflowRun() }) => {
  const fake = fakeApi(overrides);
  /** @type {string[]} */
  const lines = [];
  approveAfterBugbot({ env: ENV, event, api: fake.api, log: (line) => lines.push(line) });
  return { ...fake, lines, writes: fake.calls.filter((call) => call.method === "POST" || call.method === "PUT") };
};

test("approves the triggering pull request at the checked commit", () => {
  const { writes, lines } = decide();
  assert.deepEqual(writes.map(({ method, path }) => `${method} ${path}`), [`POST repos/${REPO}/pulls/${NUMBER}/reviews`]);
  assert.equal(writes[0].body.event, "APPROVE");
  assert.equal(writes[0].body.commit_id, SHA);
  assert.deepEqual(lines, [`Approved #${NUMBER} at ${SHA}.`]);
});

test("reads only the pull request the run names, not every pull request sharing its commit", () => {
  const { calls } = decide();
  assert.ok(calls.every((call) => !call.path.includes(`/commits/${SHA}/pulls`)));
  const { writes, lines } = decide({}, { workflow_run: workflowRun({ pull_requests: [checkedPr(), checkedPr({ number: 8 })] }) });
  assert.deepEqual(writes, []);
  assert.match(lines[0], /2 pull requests/);
});

test("doesn't approve a pull request whose files a compare could have truncated", () => {
  const { writes, lines } = decide({ pr: pull({ changed_files: 350 }) });
  assert.deepEqual(writes, []);
  assert.match(lines[0], /350 files/);
});

test("compares the exact commit pair for files, so a force-push during the job can't substitute another commit's", () => {
  // H (SHA, the checked commit) changes a protected path and is what gets
  // approved. While the job runs, the pull request is force-pushed to a
  // clean H2 with the same file count, then back to H, so every head check
  // still sees H. A file list scoped to the pull request's live state, not to
  // H by SHA, could still answer with H2's files from that window.
  const liveDuringRace = [{ filename: "README.md" }]; // what an unpinned file list could show mid-race
  const { writes, lines, calls } = decide({
    files: liveDuringRace,
    filesBySha: { [SHA]: [{ filename: ".github/workflows/check.yml" }] }, // compare(base...H), pinned by SHA
  });
  assert.deepEqual(writes, []);
  assert.match(lines[0], /changes \.github\/workflows\/check\.yml/);
  assert.ok(calls.some((call) => call.path === `repos/${REPO}/compare/${BASE_SHA}...${SHA}`));
});

test("doesn't approve again after its approval was dismissed", () => {
  const { writes } = decide({ reviews: [{ user: { login: APPROVER }, state: "DISMISSED", commit_id: SHA }] });
  assert.deepEqual(writes, []);
});

test("doesn't approve a pull request whose base was ever changed", () => {
  const events = [{ event: "base_ref_changed", created_at: "2026-10-01T12:02:00Z" }, { event: "labeled", created_at: "2026-10-01T12:20:00Z" }];
  const { writes, lines } = decide({ events });
  assert.deepEqual(writes, []);
  assert.match(lines[0], /base branch was changed/);
});

test("dismisses its own approval when the head moved while it was posted", () => {
  const { writes, lines } = decide({ headAfterPost: "c".repeat(40) });
  assert.deepEqual(writes.map(({ method, path }) => `${method} ${path}`), [
    `POST repos/${REPO}/pulls/${NUMBER}/reviews`,
    `PUT repos/${REPO}/pulls/${NUMBER}/reviews/99/dismissals`,
  ]);
  assert.equal(writes[1].body.event, "DISMISS");
  assert.match(lines[0], /Dismissed the approval of #7/);
});

test("treats a failed permission lookup as no access", () => {
  const fake = fakeApi();
  const get = fake.api.get;
  fake.api.get = (path) => {
    if (path.includes("/collaborators/")) throw new Error("HTTP 403");
    return get(path);
  };
  /** @type {string[]} */
  const lines = [];
  approveAfterBugbot({ env: ENV, event: { workflow_run: workflowRun() }, api: fake.api, log: (line) => lines.push(line) });
  assert.match(lines[0], /has none access/);
  assert.ok(fake.calls.every((call) => call.method !== "POST"));
});

test("requires the approver's login to recognize its own reviews", () => {
  assert.throws(() => approveAfterBugbot({ env: { REPO, DEFAULT_BRANCH: "main" }, event: {}, api: fakeApi().api }), /APPROVER_LOGIN/);
});

test("the workflow checks out the default branch with read permissions and no pull_request_target", () => {
  const workflow = readRepoFile(".github/workflows/approve-after-bugbot.yml");
  const permissions = workflow.match(/^permissions:\n((?: {2}.+\n)+)/m)?.[1].trim().split("\n").map((line) => line.trim());
  assert.deepEqual(permissions, ["checks: read", "contents: read", "pull-requests: read"]);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
});
