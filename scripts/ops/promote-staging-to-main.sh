#!/usr/bin/env bash
set -euo pipefail

git fetch origin
git checkout staging
git pull --rebase origin staging

TITLE="Promote staging to main"
BODY=$'Release checklist:\n- [ ] Staging QA complete\n- [ ] Rollback plan ready\n- [ ] Migrations applied (if any)\n\nThis PR promotes staging to production.'

gh pr create --base main --head staging --title "$TITLE" --body "$BODY"
