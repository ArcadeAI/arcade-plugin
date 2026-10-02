import { readFileSync } from "node:fs";

// Read GitHub's event file so a contributor's title never becomes shell code.
const header = /^(feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert)(\([^()\r\n]+\))?!?: \S[^\r\n]*$/;

try {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const title = event.pull_request?.title;
  if (typeof title !== "string" || !header.test(title)) {
    console.error("PR title must use a Conventional Commit header, e.g. fix: allow an authorized gateway fallback. See README.md#release.");
    process.exitCode = 1;
  } else {
    console.log("PR title is a Conventional Commit header.");
  }
} catch {
  console.error("Could not read the pull request title from GITHUB_EVENT_PATH.");
  process.exitCode = 1;
}
