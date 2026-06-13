#!/bin/zsh

set -e

cd "$(dirname "$0")"

export PATH="/Users/finn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"

echo "TS KPI wird vorbereitet..."

for port in 3000 3001 3004 3010; do
  ids=$(lsof -ti tcp:$port 2>/dev/null || true)
  if [ -n "$ids" ]; then
    echo "Stoppe alten Server auf Port $port..."
    kill -9 $ids 2>/dev/null || true
  fi
done

if [ -d ".next" ]; then
  backup=".next-corrupt-$(date +%Y%m%d-%H%M%S)"
  echo "Archiviere alten Next-Cache nach $backup..."
  mv .next "$backup" 2>/dev/null || rm -rf .next
fi

echo ""
echo "Starte TS KPI auf:"
echo "http://127.0.0.1:3000/dashboard"
echo ""
echo "Dieses Fenster offen lassen."
echo ""

node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 3000
