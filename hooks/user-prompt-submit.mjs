#!/usr/bin/env node
// Per-turn reminder for Claude-format clients. Cursor uses an always-apply
// rule instead. Always exit 0.

import { shouldRemind } from "./prompt-filters.mjs";
import { PROMPT_REMINDER } from "./routing-guidance.mjs";

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
  if (shouldRemind(prompt)) {
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
