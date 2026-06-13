#!/bin/zsh
set -e

cd "/Users/finn/Documents/TKPI"

echo "TS KPI: Git-Reparatur und Upload"
echo "Projektordner: $(pwd)"
echo ""

if [ ! -d ".git" ]; then
  echo "FEHLER: Kein .git Ordner gefunden."
  echo "Bitte nicht in GitHub Desktop neu anlegen, sondern erst diesen Ordner pruefen."
  read -k 1 "?Taste druecken zum Schliessen..."
  exit 1
fi

if [ ! -f ".git/HEAD" ]; then
  if [ -f ".git/HEAD 2" ]; then
    echo "Repariere fehlende .git/HEAD Datei..."
    cp ".git/HEAD 2" ".git/HEAD"
  else
    echo "FEHLER: .git/HEAD fehlt und .git/HEAD 2 wurde nicht gefunden."
    read -k 1 "?Taste druecken zum Schliessen..."
    exit 1
  fi
fi

if [ ! -f ".git/description" ] && [ -f ".git/description 2" ]; then
  cp ".git/description 2" ".git/description"
fi

echo ""
echo "Pruefe Git-Status..."
git status --short --branch

echo ""
echo "Stelle sicher, dass der Remote korrekt gesetzt ist..."
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/FAesthetic/tskpi.git"
fi
git remote -v

echo ""
echo "Fuege Aenderungen hinzu..."
git add -A

echo ""
if git diff --cached --quiet; then
  echo "Keine neuen lokalen Aenderungen zum Committen."
else
  echo "Erstelle Commit..."
  git commit -m "Update TS KPI dashboard and analysis UI"
fi

echo ""
echo "Pushe zu GitHub..."
git push -u origin main

echo ""
echo "Fertig. Vercel sollte jetzt automatisch neu deployen."
read -k 1 "?Taste druecken zum Schliessen..."
