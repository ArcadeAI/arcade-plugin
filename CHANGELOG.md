# Changelog

All notable changes to Arcade are documented here.
This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Initial portable Agent Plugin (targeting 0.1.0).

- `try-arcade` for external service tasks, with a first-use proof and recap.
  When there isn't a job yet, set the stage: what Arcade is, example asks,
  and what sign-in and confirmation look like. First-contact replies must
  include copyable example asks; a prompt-only greeting is not enough.
- `scale-arcade` for org-rollout guidance. Orient from the proven workflow,
  contrast this chat with a shared team gateway, and give a worked example
  before recommending a path.
- Optional `arcade-operator` host adapter.
- One Streamable HTTP Arcade Gateway in `mcp.json`.
- Cursor and Claude adapters in `.cursor-plugin/`, `.claude-plugin/`, and
  `clients/`.
- Commands (`arcade-apps`, `arcade-connect`, `arcade-status`), session hooks,
  and a Cursor rule.
- Docs entry points for other Arcade product questions.
- Frame README and install docs for personal trial use.
- Centralize routing guidance, endpoint constants, and drift checks in CI.
- Improve Claude per-turn hook continuation heuristics and expand test coverage.
- Ship a Claude plugin marketplace catalog so Desktop installs from
  `ArcadeAI/arcade-plugin` instead of a `.mcpb` Desktop Extension.
