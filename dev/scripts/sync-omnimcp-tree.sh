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
rsync -a --checksum --delete \
  --exclude=/.git \
  --exclude=/.github/workflows/ \
  --exclude=/docs/migration/ \
  --exclude=/README.md \
  "$source_tree/" "$destination/"
mkdir -p "$destination/.github/workflows"
install -m 644 "$replacement" "$workflow"
