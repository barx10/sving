#!/usr/bin/env bash
#
# Rebuilds the GraphHopper prototype from scratch. Everything it downloads is
# gitignored, so this is the only thing needed to reproduce the numbers in
# README.md.
#
# Takes about ten minutes and needs roughly 6 GB of free RAM.

set -euo pipefail

cd "$(dirname "$0")"

GH_VERSION="11.0"
JAR="graphhopper-web.jar"
PBF="norway-latest.osm.pbf"

if [ ! -f "$JAR" ]; then
  echo "==> Henter GraphHopper $GH_VERSION"
  curl -fL --retry 3 -o "$JAR" \
    "https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${GH_VERSION}/graphhopper-web-${GH_VERSION}.jar"
fi

if [ ! -f "$PBF" ]; then
  echo "==> Henter Norge-uttrekk fra Geofabrik (~1,3 GB)"
  curl -fL --retry 3 -C - -o "$PBF" \
    "https://download.geofabrik.de/europe/norway-latest.osm.pbf"
fi

echo "==> Starter GraphHopper (første kjøring bygger grafen, ~7 min)"
java -Xmx10g -Xms2g -jar "$JAR" server config.yml &
GH_PID=$!

echo "==> Venter på at serveren svarer"
for _ in $(seq 1 240); do
  if curl -fsS -m 3 http://127.0.0.1:8989/health > /dev/null 2>&1; then
    echo "==> Klar på http://127.0.0.1:8989"
    echo
    echo "Kjør så, fra rota av repoet:"
    echo "  npx tsx experiments/graphhopper/compare.ts"
    echo "  npx tsx experiments/graphhopper/tune.ts"
    echo "  npx tsx experiments/graphhopper/diagnose.ts"
    echo
    echo "Stopp serveren med: kill $GH_PID"
    exit 0
  fi
  if ! kill -0 "$GH_PID" 2>/dev/null; then
    echo "GraphHopper avsluttet uventet." >&2
    exit 1
  fi
  sleep 5
done

echo "Tidsavbrudd: serveren ble ikke klar." >&2
kill "$GH_PID" 2>/dev/null || true
exit 1
