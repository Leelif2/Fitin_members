#!/usr/bin/env bash
# Fitin — save everything to GitHub in one step.
# Usage:  bash scripts/save.sh ["commit message"]
set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:-}"
if [ -z "$MSG" ]; then
  MSG="Update: $(date '+%Y-%m-%d %H:%M')"
fi

git add -A

if git diff --cached --quiet; then
  echo "변경 사항이 없습니다. (nothing to commit)"
  exit 0
fi

git commit -m "$MSG"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --rebase origin "$BRANCH"
git push origin "$BRANCH"

echo "푸시 완료 → origin/$BRANCH"
echo "GitHub Actions가 자동으로 GitHub Pages에 배포합니다."
