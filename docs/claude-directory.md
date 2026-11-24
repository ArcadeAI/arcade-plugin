# Claude Directory

The existing Directory submission reads `ArcadeAI/arcade-plugin`, branch
`main`, folder `plugin/`. The portal locks the repository and folder after
submission, so keep the generated Directory bundle at that path.

`plugin/` contains the remote MCP connection and Markdown components, with
no hooks, scripts, package configuration, or telemetry. Its MCP URL is fixed
so Claude Chat can load it. Direct installs from the GitHub marketplace use
`clients/direct/` with routing hooks.

Run `npm run generate` and `npm run verify:claude` from `dev/`. Verification
installs both bundles and checks the directory bundle against the restrictions
for an unverified publisher. Validate the release commit in the portal before
requesting review. [Claude submission checklist](https://claude.com/docs/plugins/pre-submission-checklist)
