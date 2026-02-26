#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-}"

if [[ -z "$BRANCH" ]]; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi

if [[ "$BRANCH" != codex/* ]]; then
  echo "Not a codex/* branch: $BRANCH" >&2
  exit 1
fi

ISSUE="${BRANCH#codex/}"
ISSUE="${ISSUE%%-*}"
if [[ -z "$ISSUE" ]]; then
  echo "Could not parse issue number from branch: $BRANCH" >&2
  exit 1
fi

STATUS="$(gh issue view "$ISSUE" --json state -q '.state')"
if [[ "$STATUS" != "CLOSED" ]]; then
  echo "Issue #$ISSUE is not closed. Close it after merge." >&2
  exit 1
fi

git checkout staging
git branch -D "$BRANCH" || true
echo "Closed and cleaned up branch: $BRANCH"
