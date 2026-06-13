#!/bin/zsh
set -e

PROJECT="/Users/finn/Documents/TKPI"
PUBLISH="$PROJECT/clean-push-ts-kpi.command"

cd "$PROJECT"

echo "TS KPI Auto-Deploy"
echo "Beobachte Aenderungen in: $PROJECT"
echo "Vercel deployed automatisch nach jedem erfolgreichen GitHub-Push."
echo "Zum Stoppen: Ctrl + C"
echo ""

fingerprint() {
  find "$PROJECT" \
    -path "$PROJECT/.git" -prune -o \
    -path "$PROJECT/.next" -prune -o \
    -path "$PROJECT/node_modules" -prune -o \
    -path "$PROJECT/agent-scripts" -prune -o \
    -path "$PROJECT/.next-corrupt-*" -prune -o \
    -name ".env.local" -prune -o \
    -name ".env 2.local" -prune -o \
    -name "* 2.*" -prune -o \
    -type f -print0 \
    | xargs -0 stat -f "%m %N" 2>/dev/null \
    | shasum
}

last="$(fingerprint)"

while true; do
  sleep 25
  current="$(fingerprint)"

  if [ "$current" != "$last" ]; then
    echo ""
    echo "Aenderung erkannt. Warte kurz, damit Dateien fertig gespeichert sind..."
    sleep 8
    last="$(fingerprint)"
    echo "Starte Upload..."
    "$PUBLISH" || echo "Upload fehlgeschlagen. Ich versuche es bei der naechsten Aenderung erneut."
    last="$(fingerprint)"
    echo "Beobachte weiter..."
  fi
done
