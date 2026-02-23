#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <issue-number> <type> <area> <summary>"
  echo "Example: $0 4 feat checkout \"add coupon validation flow\""
  exit 1
fi

ISSUE_NUMBER="$1"
TYPE="$2"
AREA="$3"
SUMMARY="$4"
REPO="Yuvrajsharmaa/Trip-With-Nomads"

CURRENT_BRANCH=$(git branch --show-current)
if [[ ! "$CURRENT_BRANCH" =~ ^codex/${ISSUE_NUMBER}- ]]; then
  echo "Current branch '$CURRENT_BRANCH' does not match codex/${ISSUE_NUMBER}-*"
  echo "Switch to the task branch first."
  exit 1
fi

COMMIT_MESSAGE="${TYPE}(${AREA}): ${SUMMARY} (#${ISSUE_NUMBER})"

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "$COMMIT_MESSAGE"
else
  echo "No local changes to commit."
fi

git push -u origin "$CURRENT_BRANCH"

if gh pr view -R "$REPO" "$CURRENT_BRANCH" >/dev/null 2>&1; then
  echo "PR already exists for branch $CURRENT_BRANCH"
else
  gh pr create \
    -R "$REPO" \
    --base main \
    --head "$CURRENT_BRANCH" \
    --title "$COMMIT_MESSAGE" \
    --body "Closes #${ISSUE_NUMBER}

## Summary
- ${SUMMARY}

## Testing
- [ ] Added/updated tests
- [ ] Manually validated behavior"
fi

echo "Done: pushed branch and ensured PR exists for issue #$ISSUE_NUMBER"
