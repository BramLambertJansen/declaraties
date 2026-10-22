#!/usr/bin/env bash
# Migraties als app_migrator (ADR 0042), het enige pad naar dbmate. Leest MIGRATOR_DATABASE_URL uit het opgegeven
# env-bestand (standaard .env.local); de waarde komt nooit in src/ (framework §6).
# Gebruik: scripts/db-migrate.sh [env-bestand] [dbmate-commando, standaard: up]
set -euo pipefail
cd "$(dirname "$0")/.."

env_file="${1:-.env.local}"
command="${2:-up}"
[[ -f "$env_file" ]] || { echo "✗ $env_file ontbreekt (pnpm dev maakt hem uit .env.example)" >&2; exit 1; }

exec mise exec -- dbmate --env-file "$env_file" --env MIGRATOR_DATABASE_URL --migrations-dir db/migrations \
  --no-dump-schema --wait "$command"
