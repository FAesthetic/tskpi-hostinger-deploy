#!/bin/zsh

set -e

cd "$(dirname "$0")"

echo "Starte TS KPI..."
echo ""

exec ./start-ts-kpi.command
