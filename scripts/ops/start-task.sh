#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <issue-number> [slug]"
  exit 1
fi

ISSUE_NUMBER="$1"
CUSTOM_SLUG="${2:-}"
OWNER="Yuvrajsharmaa"
REPO="Yuvrajsharmaa/Trip-With-Nomads"
PROJECT_NUMBER=1
PROJECT_ID="PVT_kwHOB_crJc4BP9l8"
STATUS_FIELD_ID="PVTSSF_lAHOB_crJc4BP9l8zg-OBYI"
IN_PROGRESS_OPTION_ID="47fc9ee4"

if ! gh issue view "$ISSUE_NUMBER" -R "$REPO" >/dev/null 2>&1; then
  echo "Issue #$ISSUE_NUMBER not found in $REPO"
  exit 1
fi

TITLE=$(gh issue view "$ISSUE_NUMBER" -R "$REPO" --json title --jq '.title')

slugify() {
  echo "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g' \
    | sed -E 's/^-+|-+$//g' \
    | cut -c1-40
}

if [[ -n "$CUSTOM_SLUG" ]]; then
  SLUG=$(slugify "$CUSTOM_SLUG")
else
  SLUG=$(slugify "$TITLE")
fi

if [[ -z "$SLUG" ]]; then
  SLUG="task"
fi

BRANCH="codex/${ISSUE_NUMBER}-${SLUG}"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
else
  git checkout -b "$BRANCH"
fi

ISSUE_URL="https://github.com/$REPO/issues/$ISSUE_NUMBER"
ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq ".items[] | select(.content.number == $ISSUE_NUMBER) | .id" | head -n 1)

if [[ -z "$ITEM_ID" ]]; then
  gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$ISSUE_URL" >/dev/null
  ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq ".items[] | select(.content.number == $ISSUE_NUMBER) | .id" | head -n 1)
fi

if [[ -n "$ITEM_ID" ]]; then
  gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$IN_PROGRESS_OPTION_ID" >/dev/null
fi

echo "Branch ready: $BRANCH"
echo "Issue: #$ISSUE_NUMBER - $TITLE"
echo "Project status: In Progress"
