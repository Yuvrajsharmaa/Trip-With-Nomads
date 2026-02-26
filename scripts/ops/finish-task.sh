#!/usr/bin/env bash
set -euo pipefail

MSG="${1:-}"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != codex/* ]]; then
  echo "Not on a codex/* branch. Current: $BRANCH" >&2
  exit 1
fi

ISSUE="${BRANCH#codex/}"
ISSUE="${ISSUE%%-*}"
if [[ -z "$ISSUE" ]]; then
  echo "Could not parse issue number from branch: $BRANCH" >&2
  exit 1
fi

if [[ -z "$MSG" ]]; then
  echo "Usage: $0 \"<commit message>\"" >&2
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "No staged changes to commit." >&2
  exit 1
fi

git commit -m "${MSG} (#${ISSUE})"
git push -u origin "$BRANCH"

if [[ -f .github/pull_request_template.md ]]; then
  gh pr create --base staging --head "$BRANCH" --title "$MSG" --body-file .github/pull_request_template.md
else
  gh pr create --base staging --head "$BRANCH" --title "$MSG" --body "Closes #${ISSUE}"
fi
