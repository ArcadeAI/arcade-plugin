# Claude routing eval in GitHub Actions

The Claude routing eval runs on demand. It uses Claude Code and Sonnet 5.5
with synthetic Arcade, direct MCP, and GitHub CLI responses.

## Configure the environment

1. In GitHub, create the `routing-evals-claude` environment. Restrict its
   deployment branches to `main` and require a trusted maintainer to approve
   each job. Enable **Prevent self-review** and disable administrator bypass.
2. Add a dedicated Anthropic API key as the environment secret
   `ANTHROPIC_API_KEY`. Keep the key scoped to this environment and set a spend
   limit for its Anthropic workspace.

## Run a reviewed pull request

1. After the workflow lands on `main`, open **Actions → Claude routing eval**
   and choose **Run workflow** from `main`.
2. Enter an open pull request number and its full head SHA. The pull request
   branch must be in this repository.
3. Select `mcp-and-cli` for the full comparison or `github-cli` for the
   GitHub case with CLI competition only. The approver reviews the exact SHA,
   including its scripts and dependencies, before releasing the key. The
   job executes code from that commit.
4. Download the summary and runner metadata artifact. A complete run with
   grader misses emits a warning. Missing results, partial runs, and invalid
   runs fail this optional workflow. The artifact excludes transcripts and
   provider error text.

[GitHub environment settings](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
