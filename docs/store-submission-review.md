# Plugin store submission acceptance

Use this checklist in the existing Bring Arcade Where You Work store work. A
local validator or green public GitHub check does not establish store approval.
Record evidence against the exact version submitted, then resolve the directory's
actual findings before publishing.

This checklist is an acceptance record, not an executable release gate. Neither
the telemetry hook nor CI checks these approvals. Repository installs can consume
the branch independently of GitHub release tags; do not assume that withholding
a tagged release prevents collection from a merged default-on build.

## Required evidence

- Record repository, submitted plugin path, branch or tag, full commit SHA,
  plugin version, and any ZIP filename and SHA-256. If the tracked branch changes
  after validation, validate the new commit.
- Run `npm run verify` and save its output. Record any skipped host checks.
- Verify unrelated coding prompts send no event; app prompts and
  explicit confirmations stay in scope; unrelated task switches close scope;
  alternative tool events require scope; opt-out sends nothing; direct Arcade
  calls remain observable. Use synthetic inputs and inspect captured payloads.
- Check each store's required listing fields and length limits on the submitted
  manifest, including OpenAI support, privacy, terms, and long-description fields.
- Match the manifest, README, telemetry documentation, listing, privacy policy,
  and portal data-handling answers to the submitted code. Disclose local prompt
  classification across sessions and PostHog transmission, with the opt-out.
- Confirm actual analytics retention and processor handling with the policy
  owner. The plugin source does not establish PostHog retention or legal terms.
- Save the portal validation result, security findings, requested changes, and
  reviewer decision for that commit. Resolve any hook-scope finding with the
  actual reviewer; do not treat anonymous metadata or a precedent as approval.
- Provide install steps, connected-app setup, synthetic sample prompts, a demo,
  and usable reviewer access. Keep credentials out of the repository.

The acceptance result is separate from publication. Record whether the version
is validated, waiting for review, approved, or live, and link the evidence. For
Claude, submit the owned remote MCP server separately when required by the
[submission instructions](https://claude.com/docs/plugins/submit).

## Scope review context

**Measured:** The [public GitHub reviewer
prompt](https://github.com/anthropics/claude-plugins-official/blob/main/.github/policy/prompt.md)
separates broad hook access from telemetry disclosure. Its scope rule considers
unrelated sessions even without transmission. Disclosure and opt-out address a
separate telemetry check.

**Measured:** An Anthropic maintainer accepted Foundry's need to classify prompts
across sessions for new-project work and requested README disclosure. See the
[maintainer's explanation](https://github.com/anthropics/claude-plugins-official/pull/1842#issuecomment-4443148302).

**Measured:** A [public scan run](https://github.com/anthropics/claude-plugins-official/actions/runs/35753082961)
completed successfully despite authentication failures and absent verdicts. The
[shared scanner](https://github.com/anthropics/claude-plugins-community/blob/426e469f322952061102b286b378c0c9733a0934/.github/actions/scan-plugins/scripts/scan.sh)
uses static source review and skips unparseable verdicts. A green check alone is
insufficient evidence of an actual policy verdict.

**Measured:** The per-prompt routing reminder runs on every prompt without a
relevance check, because Cowork gets no session-start text and relies on it for
routing. GRO-398 records whether it ships that way in the build Claude reviews.

**Inferred:** These findings explain a review risk; they do not establish the
newer directory portal's implementation or its decision on Arcade. The
[portal instructions](https://claude.com/docs/plugins/submit) describe validation,
security scanning, and human review without publishing the scanner prompt.

## Existing project work

Shared project notes identify GRO-398, GRO-401, GRO-399, and GRO-439 as store
work. Confirm their live scope before adding an issue; Linear access was not
available during preparation. Add this checklist to the matching issue and keep
[routing evaluation](routing-evaluation.md) as separate acceptance work.
