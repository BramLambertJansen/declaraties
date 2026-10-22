#!/usr/bin/env bash
# pnpm db:generate: verse test-database met alle migraties, dan in de runner het schema-snapshot (pg_dump uit het gepinde
# image, ADR 0042) en het Drizzle-schema (scripts/db-introspect.mjs). Daarna zet dit script ze op hun plek.
# Beide bestanden zijn gegenereerd: nooit met de hand bewerken (framework §6).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf .runner-output/gen
scripts/runner.sh gen "$@"
# pg_dump ≥ 17.6 zet een willekeurige \restrict-sleutel in de dump; zonder die regels is de snapshot stabiel.
grep -v -E '^\\(un)?restrict ' .runner-output/gen/schema.snapshot.sql > db/schema.snapshot.sql
mkdir -p src/api/db
cp .runner-output/gen/schema.ts src/api/db/schema.ts
echo "✓ db/schema.snapshot.sql en src/api/db/schema.ts bijgewerkt; commit ze met de migratie."
