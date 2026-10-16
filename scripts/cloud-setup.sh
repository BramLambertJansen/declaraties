#!/usr/bin/env bash
# Setup-script van een cloudomgeving van Claude Code (README, Cloud): wat scripts/bootstrap.sh lokaal doet, zonder de
# machinecontrole (in de VM draait geen lokale stack). Idempotent, zonder geheimen. Netwerk alleen via de standaard-allowlist
# van de omgeving ("Trusted"): mise van github.com, daarna wat mise install en pnpm install ophalen. mise.run staat niet op
# die allowlist, daarom de release-binary. Ook de systeempakketten die de Bash-sandbox van Claude Code nodig heeft
# (bubblewrap, socat): zonder die faalt elke sessie met "Sandbox required but unavailable". Zie docs/ENVIRONMENT.md.
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

# Zelfde versie als jdx/mise-action in .github/workflows/.
MISE_VERSION=v2026.9.18
export PATH="$HOME/.local/bin:$PATH"

if ! command -v mise >/dev/null; then
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) echo "✗ onbekende architectuur $(uname -m)" >&2; exit 1 ;;
  esac
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
netwerk "mise install" mise install
netwerk "pnpm install (of lockfile ongeldig)" mise exec -- pnpm install --frozen-lockfile
# lefthook heeft geen postinstall (pnpm-workspace.yaml: allowBuilds); de hooks komen alleen hier.
mise exec -- pnpm exec lefthook install
