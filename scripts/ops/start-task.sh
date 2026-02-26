#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--allow-dirty] <issue-number> [slug]"
}

ALLOW_DIRTY=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --allow-dirty)
      ALLOW_DIRTY=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      ARGS+=("$arg")
      ;;
  esac
done

if [[ ${#ARGS[@]} -lt 1 ]]; then
  usage
  exit 1
fi

ISSUE_NUMBER="${ARGS[0]}"
CUSTOM_SLUG="${ARGS[1]:-}"
OWNER="Yuvrajsharmaa"
REPO="Yuvrajsharmaa/Trip-With-Nomads"
PROJECT_NUMBER=1
PROJECT_ID="PVT_kwHOB_crJc4BP9l8"
STATUS_FIELD_ID="PVTSSF_lAHOB_crJc4BP9l8zg-OBYI"
IN_PROGRESS_OPTION_ID="47fc9ee4"

if [[ "$ALLOW_DIRTY" -eq 0 ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit/stash changes first, or rerun with --allow-dirty."
  exit 1
fi

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

git fetch origin --prune

if git ls-remote --exit-code --heads origin staging >/dev/null 2>&1; then
  if git show-ref --verify --quiet refs/heads/staging; then
    git switch staging
  else
    git switch -c staging --track origin/staging
  fi
  git pull --rebase origin staging
else
  echo "origin/staging not found; creating it from origin/main"
  if git show-ref --verify --quiet refs/heads/staging; then
    git switch staging
  else
    git switch -c staging origin/main
  fi
  git push -u origin staging
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git switch "$BRANCH"
elif git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git switch -c "$BRANCH" --track "origin/$BRANCH"
else
  git switch -c "$BRANCH" staging
fi

ISSUE_URL="https://github.com/$REPO/issues/$ISSUE_NUMBER"
ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq ".items[] | select(.content.number == $ISSUE_NUMBER) | .id" | head -n 1 || true)

if [[ -z "$ITEM_ID" ]]; then
  gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$ISSUE_URL" >/dev/null || true
  ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq ".items[] | select(.content.number == $ISSUE_NUMBER) | .id" | head -n 1 || true)
fi

if [[ -n "$ITEM_ID" ]]; then
  gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$IN_PROGRESS_OPTION_ID" >/dev/null || true
fi

echo "Branch ready: $BRANCH"
echo "Issue: #$ISSUE_NUMBER - $TITLE"
echo "Base: staging"
echo "Project status: In Progress"
