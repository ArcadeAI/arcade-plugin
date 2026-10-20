# Changelog

All notable changes to Arcade are documented here.
This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0](https://github.com/ArcadeAI/arcade-plugin/compare/v0.4.0...v0.8.0) (2026-10-20)


### Features

* sync stable releases to omnimcp ([#36](https://github.com/ArcadeAI/arcade-plugin/issues/36)) ([4082f9b](https://github.com/ArcadeAI/arcade-plugin/commit/4082f9be484ebc612ca72998611792c5d85322e9))


### Bug Fixes

* port omnimcp 0.7.1 directory policy fixes ([#39](https://github.com/ArcadeAI/arcade-plugin/issues/39)) ([7236389](https://github.com/ArcadeAI/arcade-plugin/commit/7236389207a420e41717e8d1b5b3588d5d5b9934))
* stop installing dev tooling with the plugin ([#31](https://github.com/ArcadeAI/arcade-plugin/issues/31)) ([ae239e8](https://github.com/ArcadeAI/arcade-plugin/commit/ae239e848a6e359968e8bdd50c7166e1a92a9106))
* store listing fixes for Cursor and ChatGPT ([#38](https://github.com/ArcadeAI/arcade-plugin/issues/38)) ([e26e8db](https://github.com/ArcadeAI/arcade-plugin/commit/e26e8db037fe8e126f68d07c11198f42d6646b2f))
* **sync:** keep omnimcp's changelog and leave internals out of it ([#43](https://github.com/ArcadeAI/arcade-plugin/issues/43)) ([182783d](https://github.com/ArcadeAI/arcade-plugin/commit/182783d42f94905c8eaf936337bd6d3c57ab568e))

## [0.4.0](https://github.com/ArcadeAI/arcade-plugin/compare/v0.3.0...v0.4.0) (2026-10-18)


### Features

* attach a ChatGPT plugin upload ZIP to each release ([#34](https://github.com/ArcadeAI/arcade-plugin/issues/34)) ([ce3c6c1](https://github.com/ArcadeAI/arcade-plugin/commit/ce3c6c1c6d528fbf323e699400a3323ccfd52fb2))

## [0.3.0](https://github.com/ArcadeAI/arcade-plugin/compare/v0.2.1...v0.3.0) (2026-10-13)


### Features

* **telemetry:** add default-off telemetry foundation (1/4, GRO-305) ([#26](https://github.com/ArcadeAI/arcade-plugin/issues/26)) ([6f4cdc7](https://github.com/ArcadeAI/arcade-plugin/commit/6f4cdc7695b1953cdb2b7d207e53e5abb9738d1c))
* **telemetry:** add the Claude Code telemetry adapter (2/4, GRO-305) ([#27](https://github.com/ArcadeAI/arcade-plugin/issues/27)) ([f2bb5c9](https://github.com/ArcadeAI/arcade-plugin/commit/f2bb5c945ae47d02117ee22bc99388d9659f3978))
* **telemetry:** add the Copilot CLI telemetry adapter and guard Copilot hooks in VS Code (3/4, GRO-305) ([#28](https://github.com/ArcadeAI/arcade-plugin/issues/28)) ([8f417b6](https://github.com/ArcadeAI/arcade-plugin/commit/8f417b680540012d984fb2868c5ea7267ff83129))

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
