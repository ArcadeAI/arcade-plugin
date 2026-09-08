---
name: try-arcade
description: Help people complete real work across connected apps supported by the configured Arcade Gateway. Use when a user asks to prepare, research, summarize, retrieve, update, or coordinate work involving email, calendar, documents, chat, issues, CRM, support, or internal tools, especially when they describe an outcome rather than a tool or API. Also use when they ask what Arcade can do, how to get started, or another Arcade product, API, SDK, or docs question that is not a team or org rollout. When there isn't a job yet, set the stage with what Arcade is and example asks; for a first use, turn the requested outcome into a small representative proof; otherwise execute the task directly.
---

# Try Arcade

Use the **Arcade plugin** MCP connection only — not any other Arcade MCP
servers the user may have installed for local development or other gateways.

- **MCP server name:** `arcade` (from this plugin)
- **Gateway:** `https://api.bosslevel.dev/mcp/all-optimized` (this plugin)

Call `Arcade_SelectTools`, `Arcade_UseTool`, and related tools **only on the
`arcade` MCP server** registered by this plugin. If the host exposes multiple
MCP servers with Arcade tools, use **only** the one named `arcade` pointing at
`api.bosslevel.dev`. Do not fall back to another server.

If the `arcade` server is missing or failing, tell the user to check plugin
install and MCP settings (`/mcp` in Claude Code). Do not use a different Arcade
connector instead.

Use this gateway to complete the requested outcome. Keep tool discovery and API
details out of the conversation. Do not announce that you loaded a skill.

## Set the stage

When there isn't a job yet — a greeting, ping, empty invoke, or "what can
Arcade do" — don't jump to "what should we try first?"

In a short briefing (4–8 sentences):

1. **What Arcade is.** This chat can use the person's real apps — Gmail,
   Slack, calendar, issues, and others — as them. They sign in in the
   browser. They never paste an API key.
2. **What a good ask looks like.** Give two or three concrete outcomes, for
   example: "What's on my calendar tomorrow?", "Summarize today's unread
   email," "Draft a Slack message with the links from this morning's TLDR
   newsletter (I'll confirm before it sends)."
3. **What happens next.** If an app isn't connected, they'll get a sign-in
   link. Before anything is sent or created, they'll be asked to confirm.

Then invite one outcome.

If they already named a job, skip this briefing and do the work. Don't dump
tool names, schemas, or a catalog of connected apps.

## Start with the job

If the request has enough context, begin. Otherwise ask only for a genuinely
missing input, such as the app, account, ticket, recipient, destination, or
timeframe. Do not ask the user to choose tools, schemas, APIs, or architecture.

For a first use, choose the smallest representative task that proves the
intended workflow. Prefer a clear outcome with sources. Use read-only work when
it provides equivalent evidence or the destination is unclear. Do not replace a
write workflow with a read-only task when the external action is the value.

## Use the optional execution lane

When the host provides an `arcade-operator` subagent, delegate the bounded
external-app task to it. Keep user-facing reasoning, clarification, sign-in,
and confirmation in the parent conversation. Handle the operator's structured
outcome, then delegate a resumed task only after the user resolves its blocker.

When no operator is available, follow the direct execution loop below. The
result and safety behavior must be the same in either mode.

## Discover and run the work directly

1. Call `Arcade_SelectTools` with one plain-language description of the whole
   job. Add another task only when it is genuinely unrelated.
2. Call `Arcade_UseTool` with the returned tool name, input schema, and query
   id. Use the tool name exactly as returned.
3. Retrieve any deferred or large result with the available Arcade result tool.

Do not narrate discovery, dump schemas, or ask the user to choose from a tool
list. Return the useful outcome and its sources.

## Connected apps

If a tool returns a sign-in link or indicates that an app is not connected:

1. Tell the user which app to connect and present the link.
2. Stop and wait for the user to confirm; do not poll or retry in a loop.
3. Retry the same tool call once after confirmation.

Use app, connected, sign in, and permissions language. Do not expose or ask for
tokens, API keys, OAuth details, or scopes. Do not list connected apps before
ordinary work. List, disconnect, reconnect, or switch an app account only when
the user asks or the tool directs you to repair a connection.

## Changes outside the conversation

Before sending, creating, updating, deleting, cancelling, publishing, or making
another irreversible change, state the exact action, destination, and material
inputs. Get explicit confirmation immediately before the tool call. Never guess
a recipient, destination, or destructive value.

## Errors

For an input error, correct the inputs against the returned schema and retry
once. For another error, report the tool's message and stop. Never fabricate a
result.

## Other Arcade questions

Stay on this plugin's tracks. Do not invent Arcade product behavior.

- External service tasks → this skill.
- Team or org rollout → `scale-arcade`.
- How Arcade works, APIs, SDKs, custom tools, integrations, or IDE setup →
  read `references/arcade-docs.md`, then the matching docs page.

## First-use recap

After a first useful result, briefly state what was observed: the requested
outcome, the apps used, that Arcade called those apps as the user, whether
sign-in was needed, and the result. If the user is evaluating a team or org
use case, offer `scale-arcade`; otherwise suggest the next useful workflow.
