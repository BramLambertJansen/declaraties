#!/usr/bin/env bash
# Setup-script van een cloudomgeving van Claude Code (README, Cloud): wat scripts/bootstrap.sh lokaal doet, zonder de
# machinecontrole (in de VM draait geen lokale stack). Idempotent, zonder geheimen. Netwerk alleen via de standaard-allowlist
# van de omgeving ("Trusted"): mise van github.com, daarna wat mise install en pnpm install ophalen. mise.run staat niet op
# die allowlist, daarom de release-binary. Ook de systeempakketten die de Bash-sandbox van Claude Code nodig heeft
# (bubblewrap, socat): zonder die faalt elke sessie met "Sandbox required but unavailable". Weigert de proxy de GitHub-API
# (mise install), dan haalt een terugval per tool exact dezelfde versie met controle op checksum. Zie docs/ENVIRONMENT.md.
set -euo pipefail
cd "$(dirname "$0")/.."

# Systeempakketten voor de sandbox, alleen als ze ontbreken (idempotent). Zonder root via sudo.
pakketten=()
command -v bwrap >/dev/null || pakketten+=(bubblewrap)
command -v socat >/dev/null || pakketten+=(socat)
if ((${#pakketten[@]} > 0)); then
  as_root=()
  [[ "$(id -u)" -eq 0 ]] || as_root=(sudo)
  "${as_root[@]}" apt-get update
  "${as_root[@]}" apt-get install -y "${pakketten[@]}"
fi

# Stap die het netwerk nodig heeft: bij een fout een leesbare diagnose in plaats van alleen de fout van het commando (set -e).
netwerk() {
  local stap="$1"
  shift
  "$@" && return 0
  local status=$?
  # Alleen host en poort: een proxy-URL kan inloggegevens bevatten.
  local proxy="${HTTPS_PROXY:-${https_proxy:-leeg}}"
  proxy="${proxy#*://}"
  proxy="${proxy##*@}"
  {
    printf '✗ %s mislukt (exit %s): waarschijnlijk geen netwerk.\n' "$stap" "$status"
    printf '  → staat netwerktoegang van de omgeving op Trusted (claude.ai/code)? Is de proxy bereikbaar (HTTPS_PROXY=%s)?\n' "$proxy"
    printf '  → zie docs/ENVIRONMENT.md, Problemen.\n'
  } >&2
  exit "$status"
}

# Terugval voor één tool uit mise.toml: exact de versie die mise zou installeren (mise current leest mise.toml en voor
# pnpm package.json), uit een bron die de proxy doorlaat, met een controle op de inhoud. Daarna mise link, zodat mise exec,
# de shims en lefthook de tool vinden alsof mise hem zelf installeerde.
TERUGVAL="$HOME/.local/share/mise-terugval"

# Inhoud vergelijken met het checksumbestand van de bron zelf; geen regel of een andere hash: stoppen, niets linken.
controleer_sha256() {
  local bestand="$1" sums="$2" naam="$3" verwacht
  verwacht="$(awk -v n="$naam" '$2 == n || $2 == "*" n { print $1; exit }' "$sums")"
  if [[ -z "$verwacht" ]] || ! printf '%s  %s\n' "$verwacht" "$bestand" | sha256sum -c --status; then
    printf '✗ checksum van %s klopt niet of ontbreekt in %s; niets geïnstalleerd.\n' "$naam" "${sums##*/}" >&2
    exit 1
  fi
}

# Bestand en checksumbestand ophalen naar een tijdelijke map en de inhoud controleren; echo't het pad van het bestand.
ophalen() {
  local basis="$1" naam="$2" sums="$3" tmp
  tmp="$(mktemp -d)"
  netwerk "$naam ophalen" curl -fsSL -o "$tmp/$naam" "$basis/$naam"
  netwerk "$sums ophalen" curl -fsSL -o "$tmp/$sums" "$basis/$sums"
  controleer_sha256 "$tmp/$naam" "$tmp/$sums" "$naam" >&2
  printf '%s\n' "$tmp/$naam"
}

terugval() {
  local tool="$1" versie doel bestand
  versie="$(mise current "$tool" 2>/dev/null)"
  [[ -n "$versie" ]] || { printf '✗ geen versie voor %s in mise.toml\n' "$tool" >&2; exit 1; }
  doel="$TERUGVAL/$tool-$versie"
  rm -rf "$doel"
  mkdir -p "$doel"
  case "$tool" in
    # nodejs.org staat op de allowlist; SHASUMS256.txt van dezelfde release.
    node)
      bestand="$(ophalen "https://nodejs.org/dist/v$versie" "node-v$versie-linux-$arch.tar.gz" SHASUMS256.txt)"
      tar -xzf "$bestand" -C "$doel" --strip-components=1 ;;
    # registry.npmjs.org gaat buiten de proxy om; npm controleert de integriteit (sha512) uit de registry.
    pnpm | dbmate)
      netwerk "$tool $versie via npm" mise exec node -- npm install --global --prefix "$doel" --no-fund --no-audit \
        "$tool@$versie" ;;
    # Release-downloads van github.com gaan wel door de proxy, de API niet; checksumbestand van dezelfde release.
    betterleaks)
      bestand="$(ophalen "https://github.com/betterleaks/betterleaks/releases/download/v$versie" \
        "betterleaks_${versie}_linux_$arch.tar.gz" checksums.txt)"
      tar -xzf "$bestand" -C "$doel" betterleaks ;;
    osv-scanner)
      bestand="$(ophalen "https://github.com/google/osv-scanner/releases/download/v$versie" \
        "osv-scanner_linux_${arch/x64/amd64}" osv-scanner_SHA256SUMS)"
      install -m 0755 "$bestand" "$doel/osv-scanner" ;;
    *) printf '✗ geen terugval voor %s; voeg er een toe in scripts/cloud-setup.sh\n' "$tool" >&2; exit 1 ;;
  esac
  [[ -z "${bestand:-}" ]] || rm -rf "${bestand%/*}"
  MISE_LOG_LEVEL=error mise link --force "$tool@$versie" "$doel"
  printf '✓ %s %s via terugval\n' "$tool" "$versie"
}

# Voorcontrole uit scripts/kit/toolchain.mjs, dezelfde die feiten.mjs aan het begin van elke sessie draait.
CONTROLE="const { toolchainProbleemIn } = await import('./scripts/kit/toolchain.mjs'); "
CONTROLE+="const probleem = toolchainProbleemIn(process.cwd()); "
CONTROLE+="if (probleem !== null) { console.error(probleem); process.exit(1); } "
CONTROLE+="console.log('✓ toolchain compleet (scripts/kit/toolchain.mjs)');"

case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "✗ onbekende architectuur $(uname -m)" >&2; exit 1 ;;
esac

# Zelfde versie als jdx/mise-action in .github/workflows/.
MISE_VERSION=v2026.9.18
export PATH="$HOME/.local/bin:$PATH"

if ! command -v mise >/dev/null; then
  mkdir -p "$HOME/.local/bin"
  netwerk "mise ophalen van github.com" curl -fsSL -o "$HOME/.local/bin/mise" \
    "https://github.com/jdx/mise/releases/download/$MISE_VERSION/mise-$MISE_VERSION-linux-$arch"
  chmod +x "$HOME/.local/bin/mise"
fi

# Latere shells van de sessie (Bash-tool, hooks) vinden node, pnpm en dbmate via de shims. Enkele aanhalingstekens:
# $HOME en $PATH worden pas bij het laden van ~/.bashrc ingevuld.
line='export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"'
touch "$HOME/.bashrc"
grep -qxF "$line" "$HOME/.bashrc" || printf '%s\n' "$line" >>"$HOME/.bashrc"

mise trust
# mise install vraagt voor de aqua-tools (pnpm, dbmate, betterleaks, osv-scanner) de GitHub-API; de proxy van een
# cloudsessie weigert die voor repo's die niet aan de sessie hangen. Dan vult de terugval hieronder aan; wat dan nog
# ontbreekt, stopt het script.
if ! mise install; then
  printf '! mise install onvolledig: terugval voor de ontbrekende tools (docs/ENVIRONMENT.md, Terugval).\n' >&2
fi
# Geen stille installatiepoging bij elke mise exec voor een tool die hier al mislukte.
export MISE_EXEC_AUTO_INSTALL=false
for tool in node pnpm dbmate betterleaks osv-scanner; do
  mise where "$tool" >/dev/null 2>&1 || terugval "$tool"
done
ontbreekt="$(mise ls --missing 2>/dev/null)"
if [[ -n "$ontbreekt" ]]; then
  printf '✗ tools uit mise.toml ontbreken, ook na de terugval:\n%s\n  → zie docs/ENVIRONMENT.md, Terugval.\n' "$ontbreekt" >&2
  exit 1
fi

netwerk "pnpm install (of lockfile ongeldig)" mise exec -- pnpm install --frozen-lockfile
# lefthook heeft geen postinstall (pnpm-workspace.yaml: allowBuilds); de hooks komen alleen hier.
mise exec -- pnpm exec lefthook install
# Bewijs: dezelfde voorcontrole als elke sessie (exacte Node- en pnpm-versie, node_modules), nu meteen bij de setup.
mise exec -- node --input-type=module -e "$CONTROLE"
