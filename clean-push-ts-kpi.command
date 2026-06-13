#!/bin/zsh
set -e

SOURCE="/Users/finn/Documents/TKPI"
CLEAN="/private/tmp/TKPI-clean-upload-$(date +%Y%m%d-%H%M%S)"
REMOTE="https://github.com/FAesthetic/tskpi.git"

echo "TS KPI: sauberer GitHub Upload"
echo "Quelle: $SOURCE"
echo "Saubere Kopie: $CLEAN"
echo ""

if ! command -v git >/dev/null 2>&1; then
  echo "FEHLER: Git wurde nicht gefunden."
  read -k 1 "?Taste druecken zum Schliessen..."
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "FEHLER: rsync wurde nicht gefunden."
  read -k 1 "?Taste druecken zum Schliessen..."
  exit 1
fi

echo "Hole frisches Repository von GitHub..."
git clone "$REMOTE" "$CLEAN"

echo "Kopiere aktuelle App-Dateien sauber rueber..."
rsync -a --delete \
  --exclude ".git/" \
  --exclude ".next/" \
  --exclude ".next-corrupt-*/" \
  --exclude "node_modules/" \
  --exclude ".env.local" \
  --exclude ".env.hostinger" \
  --exclude ".env 2.local" \
  --exclude "*.tsbuildinfo" \
  --exclude "* 2.*" \
  --exclude "agent-scripts/" \
  --exclude "supabase/.branches/" \
  --exclude "supabase/.temp/" \
  --exclude "clean-push-ts-kpi.command" \
  --exclude "repair-and-push-ts-kpi.command" \
  "$SOURCE/" "$CLEAN/"

rm -rf "$CLEAN/supabase/.branches" "$CLEAN/supabase/.temp"

cd "$CLEAN"

echo ""
echo "Pruefe Aenderungen..."
git status --short

echo ""
echo "Fuege Aenderungen hinzu..."
git add -A

if git diff --cached --quiet; then
  echo "Keine Aenderungen zum Hochladen."
else
  echo "Erstelle Commit..."
  git commit -m "Update TS KPI dashboard and analysis UI"
fi

echo ""
echo "Pushe zu GitHub..."
git push origin main

echo ""
echo "Fertig. Vercel sollte jetzt automatisch neu deployen."
echo "Die saubere Kopie liegt hier: $CLEAN"
read -k 1 "?Taste druecken zum Schliessen..."
