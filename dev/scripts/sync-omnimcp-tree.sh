#!/usr/bin/env bash
set -euo pipefail

source_tree="$1"
destination="$2"
replacement="$source_tree/dev/templates/omnimcp-check.yml"
workflow="$destination/.github/workflows/check.yml"
previous_template="$destination/dev/templates/omnimcp-check.yml"
managed_marker='# Managed by ArcadeAI/arcade-plugin: omnimcp-check'
if [ "$(head -n 1 "$replacement")" != "$managed_marker" ]; then
  echo "::error::Replacement validator is missing its managed-template marker" >&2
  exit 1
fi
replacement_sha="$(git hash-object "$replacement")"

# The previous sync also copied its template under dev/. Compare it before
# rsync replaces that file: only an unchanged managed workflow may upgrade.
# Refuse unfamiliar CI before changing any destination files.
if [ -e "$workflow" ] || [ -L "$workflow" ]; then
  if [ ! -f "$workflow" ] || [ -L "$workflow" ]; then
    echo "::error::Refusing to replace non-regular $workflow" >&2
    exit 1
  fi
  current_sha="$(git hash-object "$workflow")"
  managed_upgrade=false
  if [ -f "$previous_template" ] && [ ! -L "$previous_template" ] &&
     [ "$(head -n 1 "$previous_template")" = "$managed_marker" ] &&
     cmp -s "$workflow" "$previous_template"; then
    managed_upgrade=true
  fi
  if [ "$current_sha" != f1f8be4741cddc11f4e5e42c8e0470c21b8db82a ] &&
     [ "$current_sha" != "$replacement_sha" ] && [ "$managed_upgrade" != true ]; then
    echo "::error::Refusing to replace unfamiliar $workflow ($current_sha)" >&2
    exit 1
  fi
fi

# omnimcp keeps its own README: the Claude plugin directory shows it as the
# listing page, and it tells people to install arcadeai-labs/omnimcp. Copy
# changes it needs, such as a telemetry disclosure, by hand.
# omnimcp also keeps its own CHANGELOG, which records its own releases
# (0.7.0 and 0.7.1 shipped only there).
# Release Please, the pull request auto-approver, this sync, and this
# repository's CODEOWNERS run only here, so their files stay out of omnimcp.
# Hide (H) them rather than exclude them so --delete removes any copy already
# there.
# The directory copy ships only the session-start hook. The prompt and
# subagent scripts stay in arcade-plugin. The legacy check fixture forwards
# github.token and is not part of the omnimcp tree.
rsync -a --checksum --delete \
  --exclude=/.git \
  --exclude=/.github/workflows/ \
  --exclude=/README.md \
  --exclude=/CHANGELOG.md \
  --filter='H /release-please-config.json' \
  --filter='H /.release-please-manifest.json' \
  --filter='H /dev/scripts/sync-omnimcp-tree.sh' \
  --filter='H /dev/scripts/sync-omnimcp-project.mjs' \
  --filter='H /dev/test/sync-omnimcp.test.mjs' \
  --filter='H /dev/scripts/approve-after-bugbot.mjs' \
  --filter='H /dev/test/approve-after-bugbot.test.mjs' \
  --filter='H /.github/CODEOWNERS' \
  --filter='H /hooks/user-prompt-submit.mjs' \
  --filter='H /hooks/subagent-start.mjs' \
  --filter='H /dev/test/fixtures/omnimcp/' \
  "$source_tree/" "$destination/"
mkdir -p "$destination/.github/workflows"
install -m 644 "$replacement" "$workflow"
# Manifests are generated with every routing hook. Strip the prompt and
# subagent commands in the copy, and record that this copy sends no reminder.
node "$(cd "$(dirname "$0")" && pwd)/sync-omnimcp-project.mjs" "$destination"
