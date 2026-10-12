#!/usr/bin/env bash
# Setup-script van een cloudomgeving van Claude Code (README, Cloud): wat scripts/bootstrap.sh lokaal doet, zonder de
# machinecontrole (in de VM draait geen lokale stack). Idempotent, zonder geheimen. Netwerk alleen via de standaard-allowlist
# van de omgeving ("Trusted"): mise van github.com, daarna wat mise install en pnpm install ophalen. mise.run staat niet op
# die allowlist, daarom de release-binary.
set -euo pipefail
cd "$(dirname "$0")/.."

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
  curl -fsSL -o "$HOME/.local/bin/mise" \
    "https://github.com/jdx/mise/releases/download/$MISE_VERSION/mise-$MISE_VERSION-linux-$arch"
  chmod +x "$HOME/.local/bin/mise"
fi

# Latere shells van de sessie (Bash-tool, hooks) vinden node, pnpm en dbmate via de shims. Enkele aanhalingstekens:
# $HOME en $PATH worden pas bij het laden van ~/.bashrc ingevuld.
line='export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"'
touch "$HOME/.bashrc"
grep -qxF "$line" "$HOME/.bashrc" || printf '%s\n' "$line" >>"$HOME/.bashrc"

mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
# lefthook heeft geen postinstall (pnpm-workspace.yaml: allowBuilds); de hooks komen alleen hier.
mise exec -- pnpm exec lefthook install
