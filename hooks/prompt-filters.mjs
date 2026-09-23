/** Prompt checks shared by the per-turn reminder and telemetry. */

// Short acknowledgements only — not action phrases like "fix it".
const CONTINUATION_WORDS = new Set([
  "yes", "y", "yeah", "yep", "yup", "no", "nope", "ok", "okay", "k", "sure",
  "please", "pls", "plz", "thanks", "thank", "ty", "continue", "proceed",
  "lgtm", "done", "perfect", "great", "good", "cool", "nice", "right",
  "correct", "stop", "wait", "actually",
]);

const MAX_CONTINUATION_WORDS = 2;

const isBareContinuation = (prompt) => {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > MAX_CONTINUATION_WORDS) return false;
  return words.every((word) => CONTINUATION_WORDS.has(word));
};

// Claude Code sends background task results through UserPromptSubmit. The
// user didn't write these.
export const isTaskNotification = (prompt) =>
  typeof prompt === "string" && prompt.trimStart().startsWith("<task-notification>");

/** True when user-prompt-submit.mjs sends the routing reminder. */
export const shouldRemind = (prompt) =>
  typeof prompt === "string" &&
  prompt.trim() !== "" &&
  !isTaskNotification(prompt) &&
  !isBareContinuation(prompt);
