#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <issue-number>"
  exit 1
fi

ISSUE_NUMBER="$1"
REPO="Yuvrajsharmaa/Trip-With-Nomads"
OWNER="Yuvrajsharmaa"
PROJECT_NUMBER=1

BRANCH=$(git for-each-ref --format='%(refname:short)' refs/heads | grep -E "^codex/${ISSUE_NUMBER}-" | head -n 1 || true)
if [[ -z "$BRANCH" ]]; then
  CURRENT_BRANCH=$(git branch --show-current)
  if [[ "$CURRENT_BRANCH" =~ ^codex/${ISSUE_NUMBER}- ]]; then
    BRANCH="$CURRENT_BRANCH"
  fi
fi

if [[ -z "$BRANCH" ]]; then
  echo "No local branch found matching codex/${ISSUE_NUMBER}-*"
  exit 1
fi

MERGED_PR=$(gh pr list -R "$REPO" --state merged --head "$BRANCH" --json number --jq '.[0].number // empty')
if [[ -z "$MERGED_PR" ]]; then
  echo "No merged PR found for branch '$BRANCH'."
  exit 1
fi

ISSUE_STATE=$(gh issue view "$ISSUE_NUMBER" -R "$REPO" --json state --jq '.state')
if [[ "$ISSUE_STATE" != "CLOSED" ]]; then
  echo "Issue #$ISSUE_NUMBER is not closed (state=$ISSUE_STATE)."
  exit 1
fi

PROJECT_STATUS=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq ".items[] | select(.content.number == $ISSUE_NUMBER) | .status" | head -n 1 || true)
if [[ "$PROJECT_STATUS" != "Done" ]]; then
  echo "Kanban status for issue #$ISSUE_NUMBER is '$PROJECT_STATUS' (expected 'Done')."
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" == "$BRANCH" ]]; then
  if git show-ref --verify --quiet refs/heads/staging; then
    git switch staging
  else
    git switch main
  fi
fi

git branch -D "$BRANCH"

echo "Task ended for issue #$ISSUE_NUMBER"
echo "Merged PR: #$MERGED_PR"
echo "Deleted local branch: $BRANCH"
