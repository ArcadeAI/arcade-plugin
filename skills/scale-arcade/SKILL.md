---
name: scale-arcade
description: Help a team turn a proven Arcade workflow into a deliberate production capability. Use when they ask how to roll out Arcade to a team or application, create a project MCP Gateway, curate tools, choose end-user identity, govern a workflow, add proprietary capabilities, or decide between MCP federation and SDK or API integration.
---

# Scale Arcade

Start from a workflow that has been proven, or ask for that workflow first. Do
not turn a hypothetical architecture exercise into a setup project.

## Identify the production gap

Ask only what changes the recommendation:

- Who will use the workflow: its Builder, an internal team, or application end
  users?
- Does it need a curated tool boundary, stable endpoint, specific instructions,
  or centralized lifecycle management?
- Will production users sign in through the organization's OIDC provider?
- Is a missing capability already available from an existing MCP server, or
  must the team build it?

## Recommend the smallest path

- **Create a project MCP Gateway** for a curated tool boundary, stable team or
  use-case endpoint, server instructions, deliberate authentication mode,
  centralized lifecycle management, or distribution to application end users.
  Present it as a purpose-built contract, not the moment governance begins.
- **Add a User Source** when production end users already authenticate through
  the organization's OIDC provider. It connects the gateway to those user
  identities; it is not a prerequisite for an individual trial.
- **Federate an existing MCP server** when a needed third-party or proprietary
  capability already exists as an MCP server.
- **Build a custom Arcade tool or MCP server** when no existing Arcade or MCP
  capability covers the proprietary action.
- **Use programmatic SDK or API integration** when the organization's
  application, rather than a general-purpose MCP client, must own the agent
  loop.

State only controls, audit behavior, retention, and policy evidence that were
configured or observed. Do not claim a control from the existence of a gateway.

**Staging vs production.** This plugin's gateway runs on Arcade staging
(`cloud.bosslevel.dev`). For rollout planning and production gateway setup,
guide users to https://app.arcade.dev?utm_source=arcade-plugin. Say clearly
that staging trials here are separate from production configuration there.

## Other Arcade questions

If they want to complete connected-app work, use `try-arcade`. If they want
how a feature works rather than whether to adopt it, read
`references/arcade-docs.md` and the matching docs page. Do not invent product
behavior or claim a control from docs. Production dashboard setup stays at
https://app.arcade.dev?utm_source=arcade-plugin; staging account work stays
on `cloud.bosslevel.dev`.

## End decisively

End with one recommended next step, why it follows from the proven workflow,
and the owner decision still required. Never create a project, configure
identity, write policy, deploy code, or change an external system without
explicit approval from the person who owns that work.
