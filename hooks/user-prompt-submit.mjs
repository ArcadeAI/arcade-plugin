#!/usr/bin/env node
// Per-turn reminder for Claude-format clients. Cursor uses an always-apply
// rule instead. Always exit 0.

import { PROMPT_REMINDER } from "./routing-guidance.mjs";

// Short acknowledgements only — not action phrases like "fix it".
const CONTINUATION_WORDS = new Set([
  "yes",
  "y",
  "yeah",
  "yep",
  "yup",
  "no",
  "nope",
  "ok",
  "okay",
  "k",
  "sure",
  "please",
  "pls",
  "plz",
  "thanks",
  "thank",
  "ty",
  "continue",
  "proceed",
  "lgtm",
  "done",
  "perfect",
  "great",
  "good",
  "cool",
  "nice",
  "right",
  "correct",
  "stop",
  "wait",
  "actually",
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

const readStdin = async () => {
  if (process.stdin.isTTY) return "";
  let data = "";
  try {
    for await (const chunk of process.stdin) data += chunk;
  } catch {
    // Stay silent.
  }
  return data;
};

try {
  const raw = await readStdin();
  let prompt = "";
  try {
    prompt = JSON.parse(raw)?.prompt ?? "";
  } catch {
    // Unparseable input: stay silent.
  }
  if (typeof prompt === "string" && prompt.trim() && !isBareContinuation(prompt)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: PROMPT_REMINDER,
        },
      }),
    );
  }
} catch {
  // A hook must never break a prompt.
}

process.exit(0);
