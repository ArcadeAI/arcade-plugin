# Claude submission and routing handoff

## Goal and repository

Prepare the Arcade plugin for Claude directory resubmission without hooks,
scripts, package configuration, or telemetry in the submitted folder. Restore
Arcade routing without overriding an explicit user choice of another tool.

- Repository: `https://github.com/ArcadeAI/arcade-plugin`
- Branch: `fix/claude-directory-compliance`
- PR: https://github.com/ArcadeAI/arcade-plugin/pull/62
- Submission folder: `clients/claude/`
- Current candidate and this handoff: latest commit on the branch. Fetch the
  exact revision supplied with the handoff summary before editing.

## Completed changes

Measured source commits:

- `24127c6`: generates the standalone Claude folder and validates its files
  and installation. Codex has its own marketplace; Copilot and VS Code use
  `plugin/` to retain their operator and hooks.
- `35f6f29`: adds the native Sonnet routing eval harness and saved baseline.
- Current candidate: changes only the `try-arcade` description in
  `plugin/skills/try-arcade/SKILL.md` and its generated Claude copy. It asks
  Claude to load the skill before choosing a competing tool, except when
  the user explicitly requests that alternative. No hooks were added.

The candidate description, source hash, and per-run results are in
`description-results-2026-11-17.json`. The skill body and eval fixtures were
unchanged. Do not repeat this candidate as a new experiment.

## Measured results

Claude Code 2.1.304 and Sonnet 5.5 were used with synthetic MCP and gh
responses. The main candidate ran 19 fresh sessions without provider errors,
partial suites, or hook responses. This is a historical comparison to the
saved baseline, not a concurrent A/B test.

| Condition | Saved no-hooks baseline | Revised description |
| --- | --- | --- |
| Arcade use with competing MCP tools | 0/8 | 2/8 |
| Competing MCP use | 8/8 | 6/8 |
| Arcade use with only gh competition | 0/3 | 3/3 |
| gh use with only gh competition | 3/3 | 0/3 |
| Natural-task fixture matches | 8/8 | 8/8 |

Measured controls: explicit Arcade and gh requests each worked 2/2; the
TCP/UDP control used no app tools 2/2; the sign-in control stopped without
calling a competing tool 2/2. A separate calendar pilot used Arcade 1/2
without hooks. One pilot hooks-control run lacked its expected context and
was excluded. Pilot results are not included in the main counts.

Inferred: the candidate helps against CLI competition but does not restore
reliable routing when direct MCP tools are available. Six of eight requests
still bypass Arcade. Real-app success and long conversations are untested.

## Exact validation and reproduction

Measured: these commands passed locally with Node 22.23.2:

```sh
cd dev
npm run generate
npm exec --yes --package=node@22.23.2 -- npm run verify
node scripts/claude-directory-policy.mjs ../clients/claude
```

`verify` reported 215 passed tests, zero failures, and two PowerShell skips
because pwsh is absent. It included Claude syntax validation and a real
marketplace install, Cursor validation, and Codex/Copilot installation checks.
No new test mirrors the one-line description change.

The candidate used the existing harness to prepare temporary plugins:

```sh
node scripts/eval-routing.mjs --prepare-only --out .cache/routing-evals/description-main
node scripts/eval-routing.mjs --prepare-only --case github --competition cli --out .cache/routing-evals/description-cli
```

Only the `no-hooks` plugin was evaluated for the main candidate, with the
native runner's `--ablation none --model sonnet --runs 2 --mocks record
--trust-plugin --scaffold --keep-temp --allow-tools 'Bash(gh *)' --no-publish`
options; the CLI-only condition used `--runs 3`. PATH began with
`./.eval-bin:` so gh resolved to the scaffold's safe fake command.
`summarizeRoutingEval` was then called with `setup.json` listing only
`["no-hooks"]` as its arms. These were temporary run settings, not harness
source changes. For the standard two-version comparison, use:

```sh
npm run eval:routing -- --model sonnet --runs 2
npm run eval:routing -- --case github --competition cli --model sonnet --runs 3
```

Use a fresh output directory for every run. Grader failures can make the
eval exit 1 despite a successful harness run; distinguish routing misses
from errors and partial suites. Preserve the original baseline files.

## Cloud access and local-only artifacts

GitHub contains the implementation, harness, baseline, candidate observations,
and `description-evidence-2026-11-17.json`. That last file retains sanitized
tool calls, hook outcomes, final fixture-response text, and original trace
hashes for all 19 main and four pilot sessions. It excludes hidden reasoning,
authentication, user configuration, request IDs, and host paths.

These local files are ignored by Git and cannot be fetched from GitHub:

- `dev/.cache/routing-evals/discovery-description-full/`: main native report,
  aggregate result, summary, and copied raw traces.
- `dev/.cache/routing-evals/discovery-description-cli/`: CLI-only equivalents.
- `dev/.cache/routing-evals/discovery-description-pilot/`: pilot equivalents,
  including the invalid hooks-control run.
- The native runner's retained `/private/tmp/e-*` directories and raw logs.
- The local Claude Team login/keychain and private agent-context notes.
- Unrelated `clients/claude-desktop/*.mcpb` files. They are user work, were
  not changed, and are not needed by the cloud session.

The committed evidence is sufficient to review this experiment. Reproducing
model evals in cloud requires a supported Claude credential/provider; the
local login does not transfer. Check `claude auth status` first. Do not copy
credentials into Git or assume the cloud session has access. Return a concrete
access question if authentication is absent. Native Bash evals also require
a supported OS sandbox; Anthropic's runner documentation lists bubblewrap
and socat for Linux. Follow the cloud environment's setup and network policy.

## Remaining work and approval boundaries

Review the description-only candidate and its limits. It is a partial routing
improvement, not a completed performance fix. A next experiment must remain
bounded and hook-free, retain explicit user-choice and sign-in controls, and
use the saved evals for comparison. Do not expand into a gateway rewrite,
real-account integration suite, or new orchestration infrastructure.

The PR is currently ready for review (`isDraft: false`). Teal rejected the
proposed draft conversion; no conversion occurred. Preserve its current
status instead of retrying that change.

Do not submit to the store, merge, launch a replacement session, request PR
reviews, or post comments/reviews or other external messages. Do not enable
telemetry, add hooks, modify real MCP configs, or transfer local credentials.
The directory portal has not validated the new package or run its security
scan. Public checks and synthetic evals do not establish store acceptance.
