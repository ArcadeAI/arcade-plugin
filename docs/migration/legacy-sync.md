# Legacy sync and destination integrity (inert sync)

`ArcadeAI/arcade-plugin` main is canonical. `arcadeai-labs/omnimcp` receives
files, not source commit history. Both repositories and the legacy listing
stay in place. No migration code merges, tags, releases, retires a server,
or performs cutover.

## Copy contract

Package files match the exact source SHA, with these repository controls:

- `.github/workflows/` is omitted, including release and activated sync jobs.
- `scripts/sync-legacy.mjs` and `test/sync-legacy.test.mjs` stay canonical.
- `scripts/legacy-projection.mjs`, `scripts/verify-mirror.mjs`, and
  `test/mirror-integrity.test.mjs` are excluded from their canonical paths.
- `sync/` and canonical `docs/migration/` are omitted.
- `sync/destination-check.yml` becomes `.github/workflows/check.yml`.
- `scripts/legacy-projection.mjs` becomes `.github/legacy-projection.mjs`.
- `scripts/verify-mirror.mjs` becomes `.github/verify-mirror.mjs`.
- Destination-only `docs/migration/repository-controls.md` is kept from
  trusted destination main, or generated for the initial migration.

`plugin.json` keeps the `arcade` name and canonical repository URL. Host
manifests are byte-for-byte copies; there is no destination identity rewrite.
Copied files retain the canonical MIT notice. Obsolete legacy Apache-2.0
files are removed; their history and notices remain in Git.

## Safe sync behavior

The staged workflow `sync/legacy-sync.workflow.yml` is not installed under
`.github/workflows/`. It accepts only a canonical main push with explicit
opt-in. Source validation and review remain in the full canonical workflow.

Before writes, a run checks current canonical main and the recorded source
ancestry. Delayed ancestor events skip; a newer or unrelated delivered
snapshot is never replaced. A source advance while planning also skips.
Concurrency limits overlap but is not relied on for commit ordering.

An existing sync head needs one parent, the sync marker and exact canonical
provenance, and a tree matching that prior source's projection. Human commits
or edits cause a refusal before mutation. An open PR must be the unique
same-repository head into destination main, with canonical source provenance.
Wrong-base, fork-head, unmarked and duplicate matches are refused.

A known, owned open PR updates in place. A retained unmerged matching branch
with no open PR stays blocked; automation does not reopen a deliberate close.
A destination base that already has the snapshot remains a no-op.

PR-create errors can mean GitHub accepted the request but lost the response.
The run reads back the PR and ref, reports recovery when acceptance is clear,
and otherwise returns action-required. It never deletes or rewinds a review
branch. Non-atomic REST ref reads are backed by non-force fast-forward updates;
concurrent head changes are refused rather than overwritten. No live failure
or production write is exercised by fixture tests.

## Small destination check and bootstrap

The projected destination workflow uses `pull_request_target` and checks out
only the trusted base SHA. It runs the base's checker and policy, never PR
scripts or dependency installation. Candidate Git objects are read as data.
The source repository and branch are fixed; expected Source-SHA comes from
canonical main's API ref, not candidate metadata. Exact paths, modes and blob
hashes must match the trusted projection. A forged manifest, source trailer,
workflow, or additional file cannot select its own expected tree.

Human/nonmirror PRs fail this mirror check and need explicit review: route
package changes upstream, and review any intentional destination control change
separately. Labels, actor names and branch names never grant a bypass. The
unchanged name/version/manifests are covered by exact package parity, so the
destination does not repeat full host validation or wait for Bugbot.

This first installation cannot prove its own workflow is trusted: the old
legacy base does not contain the checker. Run the local checker from the
reviewed canonical candidate with explicit source/head/base pins before
merging it. That local result is not a canonical-main approval. Live checking
requires this source change to be reviewed/merged and the destination checker
to be installed on trusted main. No such merges or activation are done here.

A workflow file alone is not a required merge gate. A repository rule requiring
a trusted workflow/check, its provenance and changes to control files needs a
separate settings decision. A check name alone can be imitated by another PR
workflow. Automatic Bugbot app reviews are an app setting, separate from the
removed workflow wait. No app, ruleset, protection, or permission setting is
changed by these PRs. The current legacy main has no required status checks.
If public-repository policy blocks `pull_request_target`, report the block;
do not silently enable it or execute candidate code in a privileged event.

## Activation remains separate

Do not move `sync/legacy-sync.workflow.yml` into `.github/workflows/sync-legacy.yml`,
create `LEGACY_SYNC_TOKEN`, or dispatch sync without a separate approval.
The complete workflow-directory exclusion prevents that activated source job
from being copied to the destination. Source token permissions remain read-only;
checkout does not persist credentials. Missing opt-in or token refuses live use.
Merging the version bump does not authorize a tag, release, listing change,
or automatic cutover. Both PRs require fresh independent review before readiness.
