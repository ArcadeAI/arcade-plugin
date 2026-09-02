# Changelog

All notable changes to Arcade Agents are documented here.
This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-01

Initial portable Agent Plugin.

- `try-arcade` for connected-app work, with a first-use proof and recap.
- `scale-arcade` for production-rollout guidance.
- Optional `arcade-operator` host adapter.
- One Streamable HTTP Arcade Gateway in `mcp.json`.
- Cursor and Claude adapters in `.cursor-plugin/`, `.claude-plugin/`, and
  `clients/`.
- Commands (`arcade-apps`, `arcade-connect`, `arcade-status`), session hooks,
  and a Cursor rule.
- Docs entry points for other Arcade product questions.

### Staging hardening (unreleased)

- Label README and install docs as an internal staging preview.
- Fix Claude Desktop MCPB documentation URL for the monorepo layout.
- Clarify staging gateway vs production dashboard guidance in `scale-arcade`.
- Centralize routing guidance, endpoint constants, and drift checks in CI.
- Improve Claude per-turn hook continuation heuristics and expand test coverage.
