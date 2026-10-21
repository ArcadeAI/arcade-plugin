import assert from "node:assert/strict";
import { test } from "node:test";
import { bugbotClean, protectedChanges, refusal } from "../scripts/approve-after-bugbot.mjs";
import { readRepoFile } from "./helpers.mjs";

const REPO = "ArcadeAI/arcade-plugin";
const SHA = "a".repeat(40);
const run = (/** @type {object} */ changes = {}) => ({
  name: "Cursor Bugbot",
  app: { slug: "cursor" },
  status: "completed",
  conclusion: "success",
  output: { summary: "**Final Result:** Bugbot completed review - no issues found! ✅" },
  ...changes,
});
// Summaries copied from real Bugbot runs in this repository.
const neutral = (/** @type {string} */ summary) => run({ conclusion: "neutral", output: { summary } });
const UNRESOLVED = "**Final Result:** Bugbot completed review - no issues found. 1 previously reported issue remain unresolved.";
const FOUND = "**Final Result:** Bugbot completed review and found 1 potential issue.";
const CANCELLED_PUSH = "**Result:** Bugbot run cancelled because a new commit was pushed to the PR";
const CANCELLED_REQUEST = "**Result:** Bugbot run cancelled because the review request was cancelled";

const facts = (overrides = {}) => ({
  pr: {
    state: "open",
    draft: false,
    base: { ref: "main" },
    head: { sha: SHA, repo: { full_name: REPO } },
    user: { login: "teallarson", type: "User" },
  },
  repo: REPO,
  headSha: SHA,
  defaultBranch: "main",
  permission: "write",
  changedFiles: ["docs/telemetry.md"],
  bugbotRuns: [run()],
  reviews: [],
  ...overrides,
});
const withPr = (/** @type {object} */ changes) => facts({ pr: { ...facts().pr, ...changes } });

test("approves an internal author's pull request once Bugbot passed on its latest commit", () => {
  assert.equal(refusal(facts()), null);
  assert.equal(refusal(facts({ permission: "admin" })), null);
});

test("refuses pull requests that aren't ready: closed, draft, or not targeting main", () => {
  assert.match(refusal(withPr({ state: "closed" })), /isn't open/);
  assert.match(refusal(withPr({ draft: true })), /draft/);
  assert.match(refusal(withPr({ base: { ref: "release/0.7" } })), /targets release\/0\.7/);
});

test("refuses forks and pull requests whose latest commit isn't the one checked", () => {
  assert.match(refusal(withPr({ head: { sha: SHA, repo: { full_name: "someone/arcade-plugin" } } })), /fork/);
  assert.match(refusal(withPr({ head: { sha: null, repo: null } })), /fork/);
  assert.match(refusal(withPr({ head: { sha: "b".repeat(40), repo: { full_name: REPO } } })), /latest commit is b+/);
});

test("refuses bots and people without write access", () => {
  assert.match(refusal(withPr({ user: { login: "claude[bot]", type: "Bot" } })), /not a person/);
  assert.match(refusal(withPr({ user: { login: "github-actions[bot]", type: "Bot" } })), /not a person/);
  for (const permission of ["read", "triage", "none"]) {
    assert.match(refusal(facts({ permission })), new RegExp(`has ${permission} access`), permission);
  }
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
  assert.equal(bugbotClean([impostor]), false);
  assert.equal(bugbotClean([run(), { ...impostor, conclusion: "failure" }]), true);
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
    assert.match(refusal(facts({ changedFiles: ["README.md", file] })), new RegExp(`changes ${file.replaceAll(".", "\\.")}`), file);
  }
  assert.deepEqual(protectedChanges(["docs/.github-notes.md", "dev/scripts/package-chatgpt.mjs", "hooks/telemetry.mjs"]), []);
});

test("approves again after a new commit, but not twice at the same commit", () => {
  const approval = (/** @type {string} */ commitId) => ({ user: { login: "github-actions[bot]" }, state: "APPROVED", commit_id: commitId });
  assert.match(refusal(facts({ reviews: [approval(SHA)] })), /already approved/);
  assert.equal(refusal(facts({ reviews: [approval("c".repeat(40))] })), null);
  assert.equal(refusal(facts({ reviews: [{ ...approval(SHA), user: { login: "laughnan" } }] })), null);
});

test("the workflow runs from main after check and can only approve pull requests", () => {
  const workflow = readRepoFile(".github/workflows/approve-after-bugbot.yml");
  assert.match(workflow, /workflow_run:\n\s+workflows: \[check\]\n\s+types: \[completed\]/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  const permissions = workflow.match(/^permissions:\n((?: {2}.+\n)+)/m)?.[1].trim().split("\n").map((line) => line.trim());
  assert.deepEqual(permissions, ["contents: read", "checks: read", "pull-requests: write"]);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.workflow_run/);
});
