#!/usr/bin/env bash
set -euo pipefail

source_tree="$1"
destination="$2"
replacement="$source_tree/dev/templates/omnimcp-check.yml"
workflow="$destination/.github/workflows/check.yml"
replacement_sha="$(git hash-object "$replacement")"

# Replace only the deployed legacy validator or this exact replacement.
# Refuse unfamiliar CI before changing any destination files.
if [ -e "$workflow" ] || [ -L "$workflow" ]; then
  if [ ! -f "$workflow" ] || [ -L "$workflow" ]; then
    echo "::error::Refusing to replace non-regular $workflow" >&2
    exit 1
  fi
  current_sha="$(git hash-object "$workflow")"
  if [ "$current_sha" != f1f8be4741cddc11f4e5e42c8e0470c21b8db82a ] && [ "$current_sha" != "$replacement_sha" ]; then
    echo "::error::Refusing to replace unfamiliar $workflow ($current_sha)" >&2
    exit 1
  fi
fi

rsync -a --checksum --delete \
  --exclude=/.git \
  --exclude=/.github/workflows/ \
  --exclude=/docs/migration/ \
  "$source_tree/" "$destination/"
mkdir -p "$destination/.github/workflows"
install -m 644 "$replacement" "$workflow"
