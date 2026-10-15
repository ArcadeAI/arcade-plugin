# Legacy sync (inert)

Canonical `ArcadeAI/arcade-plugin` main is the source. `arcadeai-labs/omnimcp`
is the legacy destination. A future activated run mirrors the **files at the
source main SHA** onto one draft pull request in the legacy repository. It
does not import source commits, tag, release, or change a listing.

This change does not activate that run. `sync/legacy-sync.workflow.yml` sits
outside `.github/workflows/`, so opening a pull request or pushing a branch
does not execute it.

## Copy contract

Mirrored paths are byte-for-byte copies of the canonical tree, except:

| Canonical path | Legacy treatment |
| --- | --- |
| `.github/workflows/release-please.yml` | Omitted, so the legacy repo does not gain a second release pipeline |
| `scripts/sync-legacy.mjs` | Omitted. The sync script stays in the canonical repo |
| `test/sync-legacy.test.mjs` | Omitted with the script it tests |
| `sync/` | Omitted. This is the inert workflow stage |
| `docs/migration/` | Omitted, except the destination-only notice below |
| `docs/migration/repository-controls.md` | Kept only in the legacy tree. Sync does not delete or replace it |

`plugin.json` keeps `repository` set to `https://github.com/ArcadeAI/arcade-plugin`.
That is package identity, not a legacy-only control.

The pre-migration legacy tree was Apache-2.0. Obsolete paths are deleted in
the migration commit. Their notices stay in git history. Copied files keep
the canonical MIT notice.

## Run behavior

The script compares the canonical tree with the legacy sync branch (or legacy
main, when that branch does not exist yet) and then:

- additions, changes, and deletions become one new commit on `sync/canonical-main`
- a matching tree is a no-op: no commit and no second pull request
- a repeated run with the same tree updates nothing
- an open sync pull request is updated in place, including its `Source-SHA` line
- a failed pull-request create deletes the sync branch it just created
- a failed update of an existing pull request leaves that fast-forward commit in place and does not open a second pull request
- `main` and `master` are rejected as update targets

The commit and pull request body record `Source-SHA` and `Source-Repo`.
The commit also contains `Legacy-Sync-Commit: true`. If a commit with that
marker is the canonical HEAD, the script skips so a mirror cannot sync itself.

## Activation blockers

Do not do these as part of the migration review:

1. Move `sync/legacy-sync.workflow.yml` to `.github/workflows/sync-legacy.yml`.
2. Create `LEGACY_SYNC_TOKEN` with permission to push `sync/canonical-main` and open pull requests on `arcadeai-labs/omnimcp`. This change does not create that secret.
3. The workflow's `on` must stay `push` to `main` only. The script exits without writes unless `GITHUB_EVENT_NAME=push`, `GITHUB_REF=refs/heads/main`, and `SYNC_LEGACY_APPLY=1`.
4. Merging the version bump does not create tag `v0.7.0`. The existing Release Please workflow may open a follow-up because the latest canonical tag is still `v0.3.0`. Do not tag or release from the migration itself.

Local checks use fixture repositories and a mocked GitHub client. They do not call the live API.
