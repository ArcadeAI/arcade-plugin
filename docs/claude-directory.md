# Claude Directory

The generated `clients/claude/` bundle is for Claude Directory. It contains
the remote MCP connection and Markdown components. Direct installs from the
GitHub marketplace use `plugin/` with routing hooks.

- Existing live listing: copy the bundle contents to the root of
  `arcadeai-labs/omnimcp`.
- New listing from this repository: choose `clients/claude` as the plugin path.

The portal locks the repository and folder after submission.

Run `npm run generate` and `npm run verify:claude` from `dev/`. Verification
installs both bundles and checks the directory bundle against the restrictions
for an unverified publisher. Validate the release commit in the portal before
requesting review. [Claude submission checklist](https://claude.com/docs/plugins/pre-submission-checklist)
