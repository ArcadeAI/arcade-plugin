# Submit to the Claude directory

`clients/claude/` is the generated Claude Directory bundle. For the existing
listing, copy the bundle's contents to the root of `arcadeai-labs/omnimcp`.
For a new listing from `ArcadeAI/arcade-plugin`, select `clients/claude` as
the plugin path. The directory locks the repository and folder after submission.
The GitHub marketplace installs `plugin/` with routing hooks.

The Claude package contains the remote Arcade MCP connection, both skills,
the operator, Markdown commands, a README, and a license. It contains no
hooks of any type, executable scripts, package-manager configuration, or
telemetry. Routing instructions live in the skills and operator.

## Check and resubmit

1. From `dev/`, run `npm run generate` and `npm run verify`.
2. Put the generated bundle at the listing's source on the release branch or tag.
3. In the directory portal, check for the new commit. Confirm that the report
   names the release commit and has no blocking findings before requesting review.

`verify:claude` checks the unverified-organization file restrictions, runs
`claude plugin validate` on the folder, its manifest, and the marketplace,
then installs both bundles in temporary Claude configs. It verifies that the
direct install has routing hooks, the directory install meets the file restrictions,
and both include the MCP configuration, skills, operator, and commands.

Tests reject forbidden file types, shebangs, invalid UTF-8, NUL bytes,
package-source settings, nested plugins, local Claude skills, undeclared
configuration files, and hooks. The directory policy tests also check file
sizes, names, README, license, and remote MCP configuration.

The [directory's own checks](https://claude.com/docs/plugins/pre-submission-checklist)
and security scan run in the portal. Passing local checks does not establish
that the portal has accepted the new version.

## Edit the sources

`clients/claude/` is generated. Edit `plugin/plugin.json`, `plugin/mcp.json`, `plugin/VERSION`,
`plugin/skills/`, `plugin/commands/`, `plugin/agents/arcade-operator.agent.md`, or
`docs/claude-plugin-readme.md`, then run `npm run generate` in `dev/`.
Edit routing sentences in `plugin/hooks/routing-guidance.mjs`. Generation removes
obsolete generated files, and verification fails for stale or edited copies.
