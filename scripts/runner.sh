#!/usr/bin/env bash
# Draait door de agent geschreven tests en configs in de runner-container (ADR 0044): beperkte read-only invoer, geen
# capabilities, alleen op het interne netwerk test-net met een eigen, verse test-database.
# Gebruik: scripts/runner.sh db|ui|gen [--sta-wijzigingen-toe]   (via pnpm test:db, pnpm ui:check en pnpm db:generate)
set -euo pipefail
cd "$(dirname "$0")/.."

# Wat de host vóór de container uitvoert of leest, moet gelijk zijn aan wat al op main staat (ADR 0044 punt 3–4):
# lokaal aan de merge-base met origin/main, zodat ook een gecommitte wijziging niet ongelezen op de host draait; in CI
# (ondiepe checkout zonder origin/main, wegwerp-runner) aan HEAD. Alleen de eigenaar mag dat met --sta-wijzigingen-toe
# overslaan, na het lezen van de wijziging.
# 'compose.*.yaml' staat gequote: git leest het als pathspec, bash expandeert het niet naar de bestanden die nu bestaan
# (een verwijderd compose.<x>.yaml viel dan uit de vergelijking). De hook (rails/hooks/lib/runner-authority.mjs)
# heeft dezelfde lijst; test/scripts/runner-host-files.test.ts houdt ze gelijk.
HOST_FILES=(scripts package.json pnpm-workspace.yaml .npmrc .pnpmfile.cjs mise.toml compose.yaml 'compose.*.yaml'
  compose.override.yaml db/test.env db/docker vitest.config.ts playwright.config.ts vite.config.ts)

suite="${1:-}"
case "$suite" in
  # pgTAP eerst: die tests draaien in een teruggedraaide transactie en verwachten de verse database na de migraties.
  db) services=(test-pgtap runner) ;;
  ui) services=(ui-runner) ;;
  # Uitvoer naar .runner-output/gen; scripts/db-generate.sh zet die op zijn plek.
  gen) services=(gen-snapshot gen-schema) ;;
  *) echo "Gebruik: scripts/runner.sh db|ui|gen [--sta-wijzigingen-toe]" >&2; exit 2 ;;
esac

unsafe_host_path() {
  printf '✗ Hostpad is een symlink of geen veilig pad: %s\n' "$1" >&2
  printf '  → gebruik de wegwerp-CI (ADR 0044 punt 6); geen agentoverride.\n' >&2
  exit 1
}

# Een veilig hostpad: vaste tekenset, geen . of .. en zelf noch een map erin een symlink (net als safeRepositoryPath in de
# hook). Bestaat een voorvoegsel niet, dan valt er voor dat pad niets te controleren. Draait vóór de git-status-controle,
# lokaal en in CI.
check_host_paths() {
  local ignored hostpath prefix part
  local -a parts
  local LC_ALL=C # de tekenreeksen [A-Za-z] hangen anders van de locale af
  ignored="$(git ls-files --others --ignored --exclude-standard -- "${HOST_FILES[@]}")"
  if [[ -n "$ignored" ]]; then
    printf '✗ Genegeerde bestanden in hostpaden; de host zou ze ongezien gebruiken:\n%s\n' "$ignored" >&2
    printf '  → verwijder ze of gebruik de wegwerp-CI (ADR 0044 punt 6).\n' >&2
    exit 1
  fi
  [[ "$(pwd -P)" == "$PWD" ]] || unsafe_host_path "$PWD"
  while IFS= read -r -d '' hostpath; do
    [[ "$hostpath" =~ ^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$ ]] || unsafe_host_path "$hostpath"
    IFS='/' read -ra parts <<<"$hostpath"
    prefix=""
    for part in "${parts[@]}"; do
      [[ "$part" == "." || "$part" == ".." ]] && unsafe_host_path "$hostpath"
      prefix="${prefix:+$prefix/}$part"
      [[ -L "$prefix" ]] && unsafe_host_path "$hostpath"
      [[ -e "$prefix" ]] || break
    done
  done < <(git ls-files -z -- "${HOST_FILES[@]}")
}

check_host_files() {
  local changed base
  check_host_paths
  changed="$(git status --porcelain --untracked-files=all -- "${HOST_FILES[@]}")"
  if [[ -n "$changed" ]]; then
    printf '✗ Bestanden die de host uitvoert, wijken af van HEAD:\n%s\n' "$changed" >&2
    printf '  → leg ze vast en gebruik de wegwerp-CI; de agent wacht op de echte gate:slow-uitslag.\n' >&2
    exit 1
  fi
  [[ "${CI:-}" == "true" ]] && return 0
  if ! base="$(git merge-base origin/main HEAD 2>/dev/null)"; then
    printf '✗ origin/main is niet te lezen, dus de host-bestanden zijn niet te vergelijken: draai git fetch origin.\n' >&2
    exit 1
  fi
  changed="$(git diff --name-status "$base" -- "${HOST_FILES[@]}")"
  if [[ -n "$changed" ]]; then
    printf '✗ Bestanden die de host uitvoert, wijken af van origin/main (merge-base):\n%s\n' "$changed" >&2
    printf '  → gebruik de wegwerp-CI en verzamel de echte gate:slow-uitslag (ADR 0044 punt 6); geen agentoverride.\n' >&2
    exit 1
  fi
}

if [[ "${2:-}" != "--sta-wijzigingen-toe" ]]; then check_host_files; fi

# Alleen benodigde bronpaden; nooit .git, persoonlijke instellingen of losse bestanden uit de werkmap.
# Git selecteert getrackte en nieuwe niet-genegeerde bestanden. Een gewijzigde test blijft dus gewoon meedraaien.
RUNNER_INPUTS=(src test e2e public scripts rails db package.json pnpm-workspace.yaml
  tsconfig.base.json tsconfig.json tsconfig.node.json tsconfig.web.json
  vitest.config.ts playwright.config.ts vite.config.ts .prettierrc.json index.html)

check_input_path() {
  local prefix="$1"
  while true; do
    [[ -L "$prefix" ]] && unsafe_host_path "$prefix"
    [[ "$prefix" == */* ]] || break
    prefix="${prefix%/*}"
  done
  return 0
}

# Ook bij een eigenaaroverride blijven mountbronnen en de uitvoermap echte mappen, geen symlinks naar hostbestanden.
for input in "${RUNNER_INPUTS[@]}" node_modules .runner-output; do check_input_path "$input"; done

export RUNNER_INPUT_DIR RUNNER_PRIVATE_CANARY RUNNER_PRIVATE_CANARY_NAME
RUNNER_INPUT_DIR="$(mktemp -d /tmp/template-runner-inputs.XXXXXXXX)"
RUNNER_PRIVATE_CANARY="$(mktemp "$PWD/.runner-canary.XXXXXXXX")"
RUNNER_PRIVATE_CANARY_NAME="$(basename "$RUNNER_PRIVATE_CANARY")"
cleanup_inputs() { rm -rf -- "$RUNNER_INPUT_DIR"; rm -f -- "$RUNNER_PRIVATE_CANARY"; }
trap cleanup_inputs EXIT
printf 'synthetische leesgrenscontrole\n' > "$RUNNER_PRIVATE_CANARY"

git ls-files --cached --others --exclude-standard -z -- "${RUNNER_INPUTS[@]}" > "$RUNNER_INPUT_DIR/files"
while IFS= read -r -d '' input; do
  case "/$input/" in */.env/*|*/.env.*/*) continue ;; esac
  check_input_path "$input"
  [[ -e "$input" ]] || continue # lokaal verwijderd bestand
  [[ -f "$input" ]] || unsafe_host_path "$input"
  cp --parents --no-dereference -- "$input" "$RUNNER_INPUT_DIR/"
done < "$RUNNER_INPUT_DIR/files"
rm -- "$RUNNER_INPUT_DIR/files"
mkdir -p "$RUNNER_INPUT_DIR/node_modules"

# Geen invloed van de shell op compose: vaste bestanden, eigen projectnaam, nooit .env of .env.local.
while IFS= read -r name; do unset "$name"; done < <(compgen -e | grep '^COMPOSE_' || true)
export RUNNER_UID RUNNER_GID
RUNNER_UID="$(id -u)"
RUNNER_GID="$(id -g)"
project="template-test-$(printf '%s' "$PWD" | sha256sum | cut -c1-12)"
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
cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  cleanup_inputs
}
trap cleanup EXIT
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
