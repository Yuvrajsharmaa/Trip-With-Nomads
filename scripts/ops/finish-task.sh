#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--base staging] <issue-number> <type> <area> \"<summary>\""
  echo "Example: $0 42 feat checkout \"add coupon validation\""
}

BASE_BRANCH="staging"
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#ARGS[@]} -lt 4 ]]; then
  usage
  exit 1
fi

ISSUE_NUMBER="${ARGS[0]}"
TYPE="${ARGS[1]}"
AREA="${ARGS[2]}"
SUMMARY="${ARGS[3]}"
REPO="Yuvrajsharmaa/Trip-With-Nomads"

if ! gh issue view "$ISSUE_NUMBER" -R "$REPO" >/dev/null 2>&1; then
  echo "Issue #$ISSUE_NUMBER not found in $REPO"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [[ ! "$CURRENT_BRANCH" =~ ^codex/${ISSUE_NUMBER}-[a-z0-9-]+$ ]]; then
  echo "Current branch '$CURRENT_BRANCH' does not match codex/${ISSUE_NUMBER}-<slug>"
  exit 1
fi

if [[ ! "$TYPE" =~ ^(feat|fix|chore|refactor|docs|test|perf)$ ]]; then
  echo "Invalid commit type '$TYPE'. Use: feat|fix|chore|refactor|docs|test|perf"
  exit 1
fi

if [[ ! "$AREA" =~ ^[a-z0-9_-]+$ ]]; then
  echo "Invalid area '$AREA'. Use lowercase letters/numbers/_/-"
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

PR_BODY_FILE=$(mktemp)
cat > "$PR_BODY_FILE" <<PRBODY
## Target Env
- [x] staging
- [ ] main (hotfix only)

## Summary
- ${SUMMARY}

## Linked Issue
Closes #${ISSUE_NUMBER}

## Staging QA Evidence (Required)
- Staging URL:
- Test steps:
- Screenshots/logs:

## Risk Level
- [ ] Low
- [ ] Medium
- [ ] High

## Rollback Plan (Required)
- Revert PR:
- Data rollback notes:

## Data / Migration Impact
- [ ] None
- [ ] Yes (describe)
PRBODY

if gh pr view -R "$REPO" "$CURRENT_BRANCH" >/dev/null 2>&1; then
  echo "PR already exists for $CURRENT_BRANCH"
else
  gh pr create \
    -R "$REPO" \
    --base "$BASE_BRANCH" \
    --head "$CURRENT_BRANCH" \
    --title "$COMMIT_MESSAGE" \
    --body-file "$PR_BODY_FILE"
fi

rm -f "$PR_BODY_FILE"

echo "Done: pushed branch and ensured PR exists for issue #$ISSUE_NUMBER -> base '$BASE_BRANCH'"
