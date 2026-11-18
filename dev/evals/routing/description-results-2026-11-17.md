# Skill-description experiment, 2026-11-17

Measured: one hook-free candidate changes only the `try-arcade` description
and its generated Claude copy. It asks Claude to load the skill before
choosing a competing tool, with an exception for an explicit user choice.
The execution instructions, mocks, prompts, and evaluator are unchanged.
The [JSON record](description-results-2026-11-17.json) includes the exact
before/after descriptions, source hash, and every main run.
The [sanitized transcript evidence](description-evidence-2026-11-17.json)
retains tool calls and final fixture responses for cloud review.

| Measured condition | Saved no-hooks baseline | Revised no-hooks description |
| --- | --- | --- |
| Natural app requests that used Arcade with MCP and CLI competitors | 0/8 | 2/8 |
| Requests that used the competing MCP server | 8/8 | 6/8 |
| GitHub requests that used Arcade with CLI competition only | 0/3 | 3/3 |
| GitHub requests that used gh with CLI competition only | 3/3 | 0/3 |
| Natural-task answers matching the fixture | 8/8 | 8/8 |

Measured: all 19 main candidate sessions completed without provider errors,
partial suites, or hook responses. Model and CLI versions were Sonnet 5.5
and Claude Code 2.1.304. Both explicit-Arcade and explicit-gh requests worked
in 2/2 runs each. The TCP/UDP control used no app tools in 2/2 runs. The
sign-in control stopped without a competing tool call in 2/2 runs.

Measured: the preliminary calendar pilot used Arcade in 1/2 no-hooks runs.
One hooks-control run lacked the expected session context and was excluded;
the pilot is not included in the main counts. The main candidate tests ran
only the no-hooks version and used the existing saved baseline for comparison.

Inferred: the description improves routing when a CLI is the alternative,
but it does not restore the intended behavior with direct MCP tools. Six
of eight natural requests still bypassed Arcade. Larger samples, other
models, live app completion, and long conversations remain untested. This
historical comparison cannot isolate changes in provider behavior over time.

Measured checks: `npm run generate` and `npm run verify` passed on Node
22.23.2 (215 tests passed, two PowerShell tests skipped). The Claude directory
policy check and real Claude installation passed. No hooks or telemetry were
added. PR #62 remains ready for review as the owner set it; the rejected draft
conversion did not change its status. No store submission or external comment
was posted.
