#!/usr/bin/env bash
set -euo pipefail

ISSUE="${1:-}"
SLUG="${2:-}"
ALLOW_DIRTY="${ALLOW_DIRTY:-false}"

if [[ -z "$ISSUE" || -z "$SLUG" ]]; then
  echo "Usage: $0 <issue-number> <slug>" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  if [[ "$ALLOW_DIRTY" != "true" ]]; then
    echo "Working tree is dirty. Commit/stash first or set ALLOW_DIRTY=true." >&2
    exit 1
  fi
fi

BRANCH="codex/${ISSUE}-${SLUG}"

git fetch origin
git checkout staging

if ! git diff --quiet || ! git diff --cached --quiet; then
  if [[ "$ALLOW_DIRTY" == "true" ]]; then
    echo "Dirty tree detected, skipping pull/rebase due to ALLOW_DIRTY=true."
  else
    echo "Working tree is dirty on staging. Commit/stash first." >&2
    exit 1
  fi
else
  git pull --rebase origin staging
fi

git checkout -b "$BRANCH"
echo "Created branch: $BRANCH"
