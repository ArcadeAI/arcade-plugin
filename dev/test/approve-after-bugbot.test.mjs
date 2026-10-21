import assert from "node:assert/strict";
import { test } from "node:test";
import { bugbotPassed, latestBugbotRun, refusal } from "../scripts/approve-after-bugbot.mjs";
import { readRepoFile } from "./helpers.mjs";

const REPO = "ArcadeAI/arcade-plugin";
const SHA = "a".repeat(40);
const passed = { name: "Cursor Bugbot", app: { slug: "cursor" }, status: "completed", conclusion: "success", started_at: "2026-10-21T10:00:00Z" };

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
  bugbotRun: passed,
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

test("refuses unless Bugbot finished on this commit with no findings", () => {
  assert.match(refusal(facts({ bugbotRun: undefined })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRun: { ...passed, status: "in_progress", conclusion: null } })), /Bugbot/);
  for (const conclusion of ["failure", "cancelled", "timed_out", "action_required", "skipped"]) {
    assert.match(refusal(facts({ bugbotRun: { ...passed, conclusion } })), /Bugbot/, conclusion);
  }
  const neutral = (summary) => ({ ...passed, conclusion: "neutral", output: { summary } });
  assert.match(refusal(facts({ bugbotRun: neutral("Bugbot found 2 potential issues") })), /Bugbot/);
  assert.match(refusal(facts({ bugbotRun: neutral("Run cancelled because a new commit was pushed") })), /Bugbot/);
  assert.equal(refusal(facts({ bugbotRun: neutral("No issues found") })), null);
});

test("approves again after a new commit, but not twice at the same commit", () => {
  const approval = (commitId) => ({ user: { login: "github-actions[bot]" }, state: "APPROVED", commit_id: commitId });
  assert.match(refusal(facts({ reviews: [approval(SHA)] })), /already approved/);
  assert.equal(refusal(facts({ reviews: [approval("c".repeat(40))] })), null);
  assert.equal(refusal(facts({ reviews: [{ ...approval(SHA), state: "DISMISSED" }] })), null);
  assert.equal(refusal(facts({ reviews: [{ ...approval(SHA), user: { login: "laughnan" } }] })), null);
});

test("uses Bugbot's newest run and ignores other apps with the same check name", () => {
  const older = { ...passed, conclusion: "failure", started_at: "2026-10-21T09:00:00Z" };
  const impostor = { ...passed, app: { slug: "someone-else" }, started_at: "2026-10-21T11:00:00Z" };
  assert.equal(latestBugbotRun([passed, older, impostor]), passed);
  assert.equal(latestBugbotRun([impostor]), undefined);
  assert.equal(bugbotPassed(latestBugbotRun([older])), false);
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
