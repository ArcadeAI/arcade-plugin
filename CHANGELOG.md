# Changelog

All notable changes to Arcade are documented here.
This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1](https://github.com/ArcadeAI/arcade-plugin/compare/v0.2.0...v0.2.1) (2026-10-06)


### Bug Fixes

* allow fallback to another authorized Arcade gateway ([#24](https://github.com/ArcadeAI/arcade-plugin/issues/24)) ([bc8f3dc](https://github.com/ArcadeAI/arcade-plugin/commit/bc8f3dc45559c39fe671cd11c12a2adb65ddc62e))

## [0.2.0](https://github.com/ArcadeAI/arcade-plugin/compare/v0.1.0...v0.2.0) (2026-09-24)


### ⚠ BREAKING CHANGES

* generate every client's files from one set of sources (GRO-353) ([#9](https://github.com/ArcadeAI/arcade-plugin/issues/9))

### Features

* generate every client's files from one set of sources (GRO-353) ([#9](https://github.com/ArcadeAI/arcade-plugin/issues/9)) ([7e44be9](https://github.com/ArcadeAI/arcade-plugin/commit/7e44be9eeacc1bc235059dc73478a754ed64813e))

## [0.1.0] - 2026-09-10

Initial public release of the Arcade Agent Plugin.

- `try-arcade` for external service tasks, with a first-use proof and recap.
  When there isn't a job yet, set the stage: what Arcade is, example asks,
  and what sign-in and confirmation look like. First-contact replies must
  include copyable example asks; a prompt-only greeting is not enough.
- `scale-arcade` for org-rollout guidance. Orient from the proven workflow,
  contrast this chat with a shared team gateway, and give a worked example
  before recommending a path.
- Optional `arcade-operator` host adapter.
- One Streamable HTTP Arcade Gateway in `mcp.json`
  (`https://api.arcade.dev/mcp/arcade`).
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
