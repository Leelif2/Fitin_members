#!/usr/bin/env bash
# Fitin — background auto-commit. Commits and pushes any change every INTERVAL seconds.
# Usage:  bash scripts/autosave-watch.sh [interval_seconds]
# Stop with Ctrl-C.
set -uo pipefail
cd "$(dirname "$0")/.."

INTERVAL="${1:-300}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "자동 저장 감시 시작 — ${INTERVAL}초 간격, 브랜치 $BRANCH. 중지: Ctrl-C"

while true; do
  sleep "$INTERVAL"
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "autosave: $(date '+%Y-%m-%d %H:%M')" >/dev/null
    if git pull --rebase --quiet origin "$BRANCH" && git push --quiet origin "$BRANCH"; then
      echo "[$(date '+%H:%M')] 자동 저장 및 푸시 완료"
    else
      echo "[$(date '+%H:%M')] 커밋됨 — 푸시 실패 (수동 확인 필요)"
    fi
  fi
done
