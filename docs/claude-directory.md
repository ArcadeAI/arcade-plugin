# Submit to the Claude directory

Use repository `ArcadeAI/arcade-plugin` and plugin path **`clients/claude`**
in the directory portal. Submit that folder, which contains its own
`.claude-plugin/plugin.json`. The repository root holds marketplaces and development tools. `plugin/`
serves the other clients; it is not the Claude submission.

The Claude package contains the remote Arcade MCP connection, both skills,
the operator, Markdown commands, a README, and a license. It contains no
hooks of any type, executable scripts, package-manager configuration, or
telemetry. Routing instructions live in the skills and operator.

## Check and resubmit

1. From `dev/`, run `npm run generate` and `npm run verify`.
2. Commit and push the changes to the branch the directory follows.
3. In the existing submission, set the plugin path to `clients/claude` and
   select **Re-validate**. The previous report describes the previous commit.
4. Check that the report names the new commit and has no blocking findings,
   then submit for review.

`verify:claude` checks the unverified-organization file restrictions, runs
`claude plugin validate` on the folder, its manifest, and the marketplace,
then installs through the marketplace into a temporary Claude config. It
checks the installed files for the same restrictions and verifies the MCP
configuration, skills, operator, and command files.

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
