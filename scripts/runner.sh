#!/usr/bin/env bash
# Draait door de agent geschreven tests en configs in de runner-container (ADR 0009): read-only repo, geen
# capabilities, alleen op het interne netwerk test-net met een eigen, verse test-database.
# Gebruik: scripts/runner.sh db|ui|gen [--sta-wijzigingen-toe]   (via pnpm test:db, pnpm ui:check en pnpm db:generate)
set -euo pipefail
cd "$(dirname "$0")/.."

# Wat de host vóór de container uitvoert of leest, moet gelijk zijn aan HEAD (ADR 0009). Alleen de eigenaar
# mag dat met --sta-wijzigingen-toe overslaan, na het lezen van de wijziging.
HOST_FILES=(scripts package.json pnpm-workspace.yaml .npmrc .pnpmfile.cjs mise.toml compose.yaml compose.*.yaml
  compose.override.yaml db/test.env db/docker)

suite="${1:-}"
case "$suite" in
  # pgTAP eerst: die tests draaien in een teruggedraaide transactie en verwachten de verse database na de migraties.
  db) services=(test-pgtap runner) ;;
  ui) services=(ui-runner) ;;
  # Uitvoer naar .runner-output/gen; scripts/db-generate.sh zet die op zijn plek.
  gen) services=(gen-snapshot gen-schema) ;;
  *) echo "Gebruik: scripts/runner.sh db|ui|gen [--sta-wijzigingen-toe]" >&2; exit 2 ;;
esac

if [[ "${2:-}" != "--sta-wijzigingen-toe" ]]; then
  changed="$(git status --porcelain --untracked-files=all -- "${HOST_FILES[@]}")"
  if [[ -n "$changed" ]]; then
    printf '✗ Bestanden die de host uitvoert, wijken af van HEAD:\n%s\n' "$changed" >&2
    printf '  → commit ze eerst, of (alleen de eigenaar, na lezen) voeg --sta-wijzigingen-toe toe.\n' >&2
    exit 1
  fi
fi

# Geen invloed van de shell op compose: vaste bestanden, eigen projectnaam, nooit .env of .env.local.
while IFS= read -r name; do unset "$name"; done < <(compgen -e | grep '^COMPOSE_' || true)
export RUNNER_UID RUNNER_GID
RUNNER_UID="$(id -u)"
RUNNER_GID="$(id -g)"
project="$(basename "$PWD")-test"
COMPOSE=(docker compose -f compose.yaml --project-directory . --project-name "$project" --env-file db/test.env --profile test)
compose() { "${COMPOSE[@]}" "$@"; }

# Images eerst binnenhalen, elke poging begrensd: een hangende pull (gezien op mcr.microsoft.com) at anders de hele
# time-out van gate:slow op en eindigde als "cancelled" zonder oorzaak. Een gezonde pull duurt in CI ruim onder een minuut.
pull_images() {
  local attempt
  for attempt in 1 2 3; do
    if timeout --kill-after=10s 300 "${COMPOSE[@]}" pull --ignore-buildable --include-deps "${services[@]}"; then return 0; fi
    printf '✗ images binnenhalen: poging %s van 3 faalde of hing langer dan 300 s.\n' "$attempt" >&2
  done
  printf '✗ images binnenhalen faalde na 3 pogingen; de registry is traag of onbereikbaar. Draai de job later opnieuw.\n' >&2
  exit 1
}

mkdir -p .runner-output
trap 'compose down --volumes --remove-orphans >/dev/null 2>&1 || true' EXIT
compose down --volumes --remove-orphans >/dev/null 2>&1 || true
pull_images
for service in "${services[@]}"; do
  if ! compose run --rm --build "$service"; then
    # Eerst laten zien waarom (migraties, pooler, Mailpit), dan pas opruimen via de trap.
    printf '\n✗ %s faalde. Logs van de testdiensten:\n' "$service" >&2
    compose logs --no-color --tail=60 test-db test-migrate test-pooler test-mailpit >&2 || true
    exit 1
  fi
done
