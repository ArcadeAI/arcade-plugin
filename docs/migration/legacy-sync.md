# Legacy sync and destination integrity (inert sync)

`ArcadeAI/arcade-plugin` main is canonical. `arcadeai-labs/omnimcp` receives
files, not source commit history. Both repositories and the legacy listing
stay in place. No migration code merges, tags, releases, retires a server,
or performs cutover.

## Copy contract

Package files match the exact source SHA, with these repository controls:

- `.github/workflows/` is omitted, including release and activated sync jobs.
- `dev/scripts/sync-legacy.mjs` and `dev/test/sync-legacy.test.mjs` stay canonical.
- `dev/scripts/legacy-projection.mjs`, `dev/scripts/verify-mirror.mjs`, and
  `dev/test/mirror-integrity.test.mjs` are excluded from their canonical paths.
- `sync/` and canonical `docs/migration/` are omitted.
- `sync/destination-check.yml` becomes `.github/workflows/check.yml`.
- `dev/scripts/legacy-projection.mjs` becomes `.github/legacy-projection.mjs`.
- `dev/scripts/verify-mirror.mjs` becomes `.github/verify-mirror.mjs`.
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
provenance, and a tree matching that prior source's projection. The tree
comparison leaves out `docs/migration/repository-controls.md`, because main's
copy can change after the branch was cut. Human commits or edits to any other
path cause a refusal before mutation. An open PR must be the unique
same-repository head into destination main, with canonical source provenance.
Wrong-base, fork-head, unmarked and duplicate matches are refused.

A known, owned open PR updates in place. An excluded-only source change
appends a same-tree provenance commit, so head Source-SHA and PR body both
advance and integrity can verify that exact source. A stale PR body alone is
repaired without another commit when the head already records current source.

An open PR whose head does not contain destination main fails the mirror
check, and a new commit on that head would fail it too. The run is blocked and
writes nothing. The recovery text says to close the PR and delete the branch
by hand; the next run cuts a new branch from main. It also says not to use
"Update branch" with a merge commit.

A retained sync branch with no open PR is used only when destination main
contains its head, as after a merge commit. The new commit's parent is then
current main, not the old head. Because main contains the old head, moving the
branch is still a fast-forward, and the new PR contains main, so the mirror
check can pass it. Otherwise the run is blocked and writes nothing:

- If the branch holds the current snapshot and main does not, the recovery
  text ends with the exact PR title and body. A hand-opened draft PR needs
  them, because later runs refuse a sync PR without its `Source-SHA`,
  `Source-Repo` and `Source-Branch` lines.
- In every other case, including a squash or rebase merge, the recovery text
  says to delete the branch by hand. The next run cuts a new branch from main.

Automation does not reopen a deliberate close. A destination base that
already has the snapshot remains a no-op.

A sync commit references blobs that already exist in destination main or the
sync branch head and uploads only the rest. GitHub's secondary rate limit allows 80
content-creating requests per minute, and the first sync onto legacy main
uploads every file whose content legacy main lacks, about 140 blobs. The run
sends blob, tree and commit requests one second apart, at most 60 per minute.
A 429, or a 403 that names a rate limit, is retried up to three times. The
wait is `retry-after` seconds; otherwise the time to `x-ratelimit-reset` when
no requests remain; otherwise one minute, doubled on each retry. A single wait
is at most five minutes, because the staged workflow stops the job after 20
minutes. When GitHub asks for a longer wait, the run fails with an error that
gives the requested wait. A 403 for missing permissions fails at once. A run
that gives up or times out while creating the commit has not moved the sync
branch.

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

The check reads destination main from the API, not the event payload, and
fails when the PR head does not contain that commit. A head that lacks a main
commit merges into a tree the check never compared: a file added to main after
the sync branch was cut would survive the merge. When the head contains main,
the merge result has the head's tree. The check also fails if destination main
moves while it runs. The local checker applies the same rule to its base pin.

Human/nonmirror PRs fail this mirror check and need explicit review: route
package changes upstream, and review any intentional destination control change
separately. Labels, actor names and branch names never grant a bypass.
Local NUL-delimited Git tree parsing preserves the full path after the first
metadata tab, including literal tabs and newlines in filenames. The
unchanged name/version/manifests are covered by exact package parity, so the
destination does not repeat full host validation or wait for Bugbot.

A change to `SYNC_CONTRACT` that changes the projected tree makes the next
mirror PR's check fail, because the check runs the policy already on omnimcp
main. Merging that PR over the red check installs the new policy. That is the
intended path for policy changes. If mirror-integrity is a required check,
that merge needs an administrator bypass.

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

## Recommended destination settings

These settings are recommendations for the separate settings decision.

Turn on "Automatically delete head branches" in omnimcp. omnimcp allows squash
and rebase merges, and after either one a kept `sync/canonical-main` holds
commits that main does not contain. Every run is then blocked until someone
deletes the branch by hand. With automatic deletion, the next sync run cuts a
new branch from current main. A merge commit does not need this setting: main
then contains the kept branch's head, and the next run builds on main.

Turn on "Require branches to be up to date before merging" for main. The
destination check fails a PR whose head is behind main, but it runs only on
pull request events. A commit to main after the check passed leaves the
passing result in place. Without this rule, that PR can merge and keep a file
from the new main commit until the next sync PR deletes it. GitHub applies
this rule only when mirror-integrity is a required status check.

When a sync PR is behind main, the mirror check fails it and sync runs are
blocked. Close the PR and delete the branch; the next sync run cuts a new
branch from current main. Do not use "Update branch" with a merge commit: that
commit has no `Source-SHA`, so the mirror check fails and the next sync run
refuses the branch.

## Activation remains separate

Do not move `sync/legacy-sync.workflow.yml` into `.github/workflows/sync-legacy.yml`,
create `LEGACY_SYNC_TOKEN`, or dispatch sync without a separate approval.
When approved, `LEGACY_SYNC_TOKEN` is a fine-grained personal access token
limited to `arcadeai-labs/omnimcp` with read and write access to contents,
pull requests and workflows. Workflows access is required because the sync
writes `.github/workflows/check.yml`.
The complete workflow-directory exclusion prevents that activated source job
from being copied to the destination. Source token permissions remain read-only;
checkout does not persist credentials. Missing opt-in or token refuses live use.
Merging this staging does not authorize a tag, release, listing change, or
automatic cutover.
