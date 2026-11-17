# Compare Arcade routing with and without hooks

From `dev/`, run:

```sh
npm run eval:routing -- --model sonnet --runs 2
```

This uses the installed `claude plugin eval` runner and your existing Claude
login. Model calls count against your plan or API usage. No real app accounts
or additional MCP configuration are needed.

The runner copies `clients/claude/` into two temporary plugins. One gets the
three routing hooks from `plugin/hooks/`; the other keeps the submitted
package's hook configuration. Skills, agent instructions, prompts, model,
mocked tools, and permissions match. The plugins live under `dev/.cache/`
and are never copied into the store package.

Both versions see an Arcade discovery/execution server and a competing
server with calendar, email, Slack, and GitHub tools. Responses are synthetic
fixtures. A sandboxed fake `gh` command returns the GitHub fixture without
contacting GitHub. The competitors' schemas are simplified examples, not a
capture of a user's real server configuration.

Four natural app requests measure Arcade routing. Separate controls check
explicit Arcade and CLI requests, a question that needs no app, and a
sign-in response. Each run starts a fresh isolated session. This suite does
not measure long conversations, real authentication, or successful app work.

Results include the native reports, raw traces, and `summary.json` under the
printed output directory. The summary checks the actual model, successful
session-hook execution, and agreement between mock-call and transcript
counts. Invalid runs are reported separately. Inspect per-case results; the
native runner's overall score averages several different checks and is not
the Arcade routing rate.

To run one case, add `--case github --runs 1`. Use `--prepare-only` to inspect
the generated plugins without spending model usage. `--out <directory>`
requires a fresh directory. To summarize a completed run again, use
`--summarize-only --out <directory>`. Raw traces remain local and ignored by
Git; they are copied out of the native runner's retained temporary folders.
To test CLI competition without the direct MCP server, use
`--case github --competition cli --runs 3`.

A routing miss can make the native runner exit 1 even when the harness
worked. Timeouts, provider failures, and partial suites are separate from
routing misses. Small repeated samples can expose a regression; they do not
establish its production frequency.

The [2026-11-17 measured results](results-2026-11-17.md) include both comparisons.

Runner behavior follows Anthropic's
[plugin eval documentation](https://code.claude.com/docs/en/plugin-evals).
