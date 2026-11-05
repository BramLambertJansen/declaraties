#!/usr/bin/env bash
# pnpm check:snapshot (gate:slow, framework §6): de gegenereerde bestanden zijn gelijk aan wat de migraties opleveren.
# Draait dezelfde generatie als `pnpm db:generate` in de runner, maar schrijft niets in de repo: alleen vergelijken.
# Verschil = een migratie zonder bijgewerkte snapshot, of een handmatige wijziging in een gegenereerd bestand.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf .runner-output/gen
scripts/runner.sh gen "$@"
grep -v -E '^\\(un)?restrict ' .runner-output/gen/schema.snapshot.sql > .runner-output/gen/schema.snapshot.stabiel.sql

fail=0
diff -u db/schema.snapshot.sql .runner-output/gen/schema.snapshot.stabiel.sql || fail=1
diff -u src/api/db/schema.ts .runner-output/gen/schema.ts || fail=1
if [[ "$fail" -ne 0 ]]; then
  echo "✗ check:snapshot: gegenereerde bestanden wijken af van de migraties → draai pnpm db:generate en commit het resultaat." >&2
  exit 1
fi
echo "✓ check:snapshot: db/schema.snapshot.sql en src/api/db/schema.ts zijn gelijk aan de migraties"
