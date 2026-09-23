---
name: try-arcade
description: Help people complete real work in email, calendar, Slack, issues, docs, and other apps through Arcade. Use when a user asks to prepare, research, summarize, retrieve, update, or coordinate work involving those apps, especially when they describe an outcome rather than a tool or API. Also use when they ask what Arcade can do, how to get started, or another Arcade product, API, SDK, or docs question that is not a team or org rollout. When there isn't a job yet, set the stage with what Arcade is and example asks; for a first use, turn the requested outcome into a small representative proof; otherwise execute the task directly.
---

# Try Arcade

Use the Arcade gateway described below for the requested outcome. Check it
before discovery or delegation.

## Gateway rules

<!-- BEGIN generated from hooks/routing-guidance.mjs by `npm run generate`; edit that file, not this block -->
Arcade is connected as the "arcade" MCP server (gateway at api.arcade.dev). If more than one MCP server exposes Arcade tools, use only arcade. In Cursor it can appear as plugin-arcade-arcade; that is the same gateway. If the gateway explicitly shows needsAuth, or its plugin namespace is present but has zero tools, the Arcade connection needs authentication in this host's MCP settings. A missing, unavailable, or failing gateway is a setup or connection failure, not an authentication problem. For authentication, stop and ask the user to authenticate it; do not poll or retry auth in a loop. For a setup or connection failure, report the actual error and ask the user to check the plugin and MCP settings. Never fall back to another connector: do not finish the task through another MCP server, a CLI such as gh or curl, a built-in search, or a direct API. Troubleshooting or retrying on Arcade itself is fine. Use another path only if the user explicitly chooses it after hearing Arcade is blocked.
<!-- END generated -->

If the host requires you to say what you're using, say it in one short clause:
"I'm using Arcade" or "I'll use Arcade for this." Then continue. Do not
paraphrase this skill's title, description, or internal labels — never
"connected-app," "try-arcade," "MCP," or "workflow for the Slack side." Those
are instructions for you, not talking points.

## Set the stage

When there isn't a job yet — a greeting, ping, empty invoke, or "what can
Arcade do" — the user-facing reply must include all three of: what Arcade is,
at least two copyable example asks, and what sign-in / confirmation look like.
Never answer with only a prompt such as "what do you want to do?", "Arcade's
ready," or "what should we try first?"

Approximate this shape (plain language is fine; the example asks must appear):

> Arcade can use your real apps from this chat — Gmail, Slack, calendar,
> issues, and others — as you. You sign in in the browser. You never paste an
> API key.
>
> A good first ask is a concrete outcome, for example:
> - What's on my calendar tomorrow?
> - Summarize today's unread email
> - Draft a Slack message with the links from this morning's TLDR newsletter
>   (I'll confirm before it sends)
>
> If an app isn't connected yet, I'll send a sign-in link. I won't send or
> create anything until you confirm.
>
> What should we do first?

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

If the operator returns `needs_auth` or `failed`, handle it as the gateway
rules above say.

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
