#!/usr/bin/env bash
# Fast doctor preview: backend subtree (if needed) + queue EAS APK without waiting.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== monorepo @ $(git rev-parse --short HEAD) =="

if git status --porcelain -- backend | grep -q .; then
  echo "backend has uncommitted changes — commit first"
  exit 1
fi

git fetch -q backend 2>/dev/null || true
LOCAL=$(git subtree split -q --prefix=backend)
REMOTE=$(git rev-parse backend/main 2>/dev/null || echo "")
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "== pushing backend subtree =="
  git branch -D split/backend-push 2>/dev/null || true
  git branch split/backend-push "$LOCAL"
  git push -q backend split/backend-push:main
  git branch -D split/backend-push
  echo "backend/main -> $(git rev-parse --short backend/main)"
else
  echo "backend already on remote ($(git rev-parse --short backend/main))"
fi

echo "== queue doctor Android preview (no wait) =="
cd "$ROOT/apps/provider"
eas build --platform android --profile preview --non-interactive --no-wait

echo ""
echo "Track: eas build:list --platform android --limit 1"
echo "When FINISHED, open the build URL from the list for the APK."
