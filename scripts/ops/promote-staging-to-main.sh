#!/usr/bin/env bash
set -euo pipefail

REPO="Yuvrajsharmaa/Trip-With-Nomads"
AFTER_MERGE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --after-merge)
      AFTER_MERGE=1
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--after-merge]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ "$AFTER_MERGE" -eq 1 ]]; then
  MERGED_PR=$(gh pr list -R "$REPO" --state merged --base main --head staging --limit 1 --json number,mergedAt --jq '.[0]')
  if [[ -z "$MERGED_PR" || "$MERGED_PR" == "null" ]]; then
    echo "No merged staging->main PR found."
    exit 1
  fi

  git fetch origin --prune
  if git show-ref --verify --quiet refs/heads/main; then
    git switch main
  else
    git switch -c main --track origin/main
  fi
  git pull --rebase origin main

  TAG="baseline/prod-$(date +%Y%m%d-%H%M)"
  git tag -a "$TAG" -m "Production baseline $TAG"
  git push origin "$TAG"

  echo "Created and pushed release tag: $TAG"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit/stash changes before promotion."
  exit 1
fi

git fetch origin --prune
if git show-ref --verify --quiet refs/heads/staging; then
  git switch staging
else
  git switch -c staging --track origin/staging
fi
git pull --rebase origin staging
git push origin staging

TITLE="release: promote staging to main ($(date +%Y-%m-%d))"
BODY_FILE=$(mktemp)
cat > "$BODY_FILE" <<'PRBODY'
## Release Checklist
- [ ] Staging QA fully passed
- [ ] Critical flows validated
- [ ] Data migration impact reviewed
- [ ] Rollback plan confirmed

## Monitoring Plan
- [ ] Error logs monitored
- [ ] Payment flow monitored
- [ ] Trip pricing checks verified

## Rollback
- Revert this PR and republish previous stable release tag.
PRBODY

if gh pr view -R "$REPO" staging >/dev/null 2>&1; then
  echo "A PR for staging already exists."
else
  gh pr create -R "$REPO" --base main --head staging --title "$TITLE" --body-file "$BODY_FILE"
fi

rm -f "$BODY_FILE"

echo "Promotion PR ensured: staging -> main"
echo "After merge, run: $0 --after-merge"
