#!/usr/bin/env bash
# Draait door de agent geschreven tests en configs in de runner-container (ADR 0044): beperkte read-only invoer, geen
# capabilities, alleen op het interne netwerk test-net met een eigen, verse test-database.
# Gebruik: scripts/runner.sh db|ui|gen [--sta-wijzigingen-toe]   (via pnpm test:db, pnpm ui:check en pnpm db:generate)
set -euo pipefail
cd "$(dirname "$0")/.."

# Zelfverdediging, vóór elke git-aanroep: de aanroeper bepaalt niet welke repository, config of objecten git gebruikt.
# Weg met elke GIT_*-variabele (GIT_DIR, GIT_CONFIG_COUNT/KEY/VALUE, GIT_CONFIG_GLOBAL, ...); geen vervangende objecten
# (git replace), geen systeemconfig en nooit een wachtwoordprompt.
while IFS= read -r name; do unset "$name"; done < <(compgen -e | grep '^GIT_' || true)
export GIT_NO_REPLACE_OBJECTS=1 GIT_TERMINAL_PROMPT=0 GIT_CONFIG_NOSYSTEM=1

# De globale git-config (core.sshCommand, http.proxy, ...) komt alleen uit de echte home van de gebruiker, niet uit een
# door de aanroeper gekozen HOME of XDG_CONFIG_HOME. De home komt uit de gebruikersdatabase (getent, op macOS dscl).
unset XDG_CONFIG_HOME
account_home=""
if command -v getent >/dev/null 2>&1; then
  account_home="$(getent passwd "$(id -u)" | cut -d: -f6 || true)"
elif command -v dscl >/dev/null 2>&1; then
  account_home="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory 2>/dev/null | sed -n 's/^NFSHomeDirectory: *//p' || true)"
fi
if [[ -z "$account_home" ]]; then
  printf '✗ De home van gebruiker %s is niet uit de gebruikersdatabase te lezen (getent of dscl).\n' "$(id -u)" >&2
  printf '  → de runner kan de globale git-config dan niet vertrouwen; gebruik de wegwerp-CI (ADR 0044 punt 6).\n' >&2
  exit 1
fi
export HOME="$account_home"

# Wat de host vóór de container uitvoert of leest, moet gelijk zijn aan wat al op main staat (ADR 0044 punt 3–4):
# lokaal aan de merge-base met de echte main bij de remote (git ls-remote, zoals .claude/hooks/laden.mjs), niet met de
# lokale ref origin/main die een agent kan verleggen; zo draait ook een gecommitte wijziging niet ongelezen op de host. In
# CI (ondiepe checkout, wegwerp-runner) aan HEAD. Alleen de eigenaar mag dat met --sta-wijzigingen-toe overslaan, na het
# lezen van de wijziging.
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

origin_untrusted() {
  printf '✗ De remote origin is niet vast te stellen: %s\n' "$1" >&2
  printf '  → zet remote.origin.url alleen in .git/config en haal wat hem omlegt weg, of gebruik de wegwerp-CI (ADR 0044 punt 6).\n' >&2
  exit 1
}

# Herkomst van origin: precies één remote.origin.url, uit de config van de repo zelf (niet uit ~/.gitconfig, XDG of een
# include-bestand), en git gebruikt die url ongewijzigd (geen url.<x>.insteadOf die hem omlegt). Andere insteadOf- of
# include-regels mogen blijven.
check_origin_url() {
  local origins count file url expected used
  origins="$(git config --show-origin --get-all remote.origin.url || true)"
  count="$(grep -c . <<<"$origins" || true)"
  [[ "$count" == "0" ]] && origin_untrusted "geen remote origin; zet hem in .git/config en draai git fetch origin main"
  [[ "$count" == "1" ]] || origin_untrusted "remote.origin.url heeft $count waarden in de git-config"
  file="${origins%%$'\t'*}"
  url="${origins#*$'\t'}"
  expected="$(realpath -- "$(git rev-parse --git-common-dir)/config")"
  [[ "$file" == file:* && "$(realpath -- "${file#file:}" 2>/dev/null || true)" == "$expected" ]] ||
    origin_untrusted "remote.origin.url komt uit ${file:-onbekend}, niet uit de config van de repo"
  used="$(git ls-remote --get-url origin)"
  [[ "$used" == "$url" ]] || origin_untrusted "git gebruikt $used in plaats van $url (insteadOf legt origin om)"
}

# De merge-base van HEAD met main zoals de remote die nu meldt. Ontbreekt die commit lokaal, dan dicht falen: alleen een
# fetch haalt hem op, en de lokale origin/main is geen vervanging.
trusted_base() {
  local remote sha base
  local -a limit=()
  check_origin_url
  if command -v timeout >/dev/null 2>&1; then limit=(timeout --kill-after=5s 30); fi
  if ! remote="$("${limit[@]}" git ls-remote origin refs/heads/main 2>/dev/null)"; then
    printf '✗ main bij de remote is niet te lezen, dus de host-bestanden zijn niet te vergelijken: draai git fetch origin main.\n' >&2
    exit 1
  fi
  # Exact refs/heads/main: ls-remote matcht op het staartstuk, dus ook bijvoorbeeld refs/heads/fix/refs/heads/main.
  sha="$(awk -F'\t' '$2=="refs/heads/main"{print $1}' <<<"$remote")"
  if [[ ! "$sha" =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]] || ! git cat-file -e "$sha^{commit}" 2>/dev/null ||
    ! base="$(git merge-base "$sha" HEAD 2>/dev/null)"; then
    printf '✗ main bij de remote (%s) ontbreekt lokaal; draai git fetch origin main en probeer opnieuw.\n' "${sha:-onbekend}" >&2
    exit 1
  fi
  printf '%s\n' "$base"
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
  base="$(trusted_base)"
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
RUNNER_INPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/template-runner-inputs.XXXXXXXX")"
RUNNER_PRIVATE_CANARY="$(mktemp "$PWD/.runner-canary.XXXXXXXX")"
RUNNER_PRIVATE_CANARY_NAME="$(basename "$RUNNER_PRIVATE_CANARY")"
cleanup_inputs() { rm -rf -- "$RUNNER_INPUT_DIR"; rm -f -- "$RUNNER_PRIVATE_CANARY"; }
trap cleanup_inputs EXIT
printf 'synthetische leesgrenscontrole\n' > "$RUNNER_PRIVATE_CANARY"

# Een niet-getrackt bestand met meer dan één hardlink kan dezelfde inhoud hebben als een bestand buiten de repo (een
# sleutel, een privébestand); git ziet dat niet en cp zou het meekopiëren. Getrackte bestanden blijven toegestaan.
check_untracked_links() {
  local input linked
  while IFS= read -r -d '' input; do
    [[ -f "$input" && ! -L "$input" ]] || continue
    # find is draagbaar (geen GNU-stat nodig); faalt find, dan telt het bestand als hardlink.
    linked="$(find "./$input" -maxdepth 0 -links +1 -print 2>/dev/null || echo fout)"
    if [[ -n "$linked" ]]; then
      printf '✗ Niet-getrackt invoerbestand is een hardlink (linkcount > 1): %s\n' "$input" >&2
      printf '  → vervang het door een gewone kopie of leg het vast; geen agentoverride.\n' >&2
      exit 1
    fi
  done < <(git ls-files --others --exclude-standard -z -- "${RUNNER_INPUTS[@]}")
}
check_untracked_links

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
