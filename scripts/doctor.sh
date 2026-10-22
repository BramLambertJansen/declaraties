#!/usr/bin/env bash
# Controleert de machine (framework §11). Zonder vlag ook de stack; --machine controleert alleen installatie en git-hooks.
# --quick: alleen de status van de lokale stack, voor de SessionStart-hook (nooit Docker, nooit netwerk buiten 127.0.0.1).
# Exit 1 bij een fout in de volledige of machine-modus; --quick meldt alleen en eindigt altijd met 0.
set -euo pipefail
cd "$(dirname "$0")/.."

mode="${1:-full}"
if (($# > 1)); then
  echo 'Gebruik: scripts/doctor.sh [--machine|--quick]' >&2
  exit 2
fi
case "$mode" in
  full|--machine|--quick) ;;
  *) echo 'Gebruik: scripts/doctor.sh [--machine|--quick]' >&2; exit 2 ;;
esac
failures=0

ok() { printf '✓ %s\n' "$1"; }
fail() {
  printf '✗ %s\n  → %s\n' "$1" "$2"
  failures=$((failures + 1))
}

# Poort uit .env.local (zonder het bestand uit te voeren), anders de standaard uit .env.example.
port() {
  local value=""
  [[ -f .env.local ]] && value="$(grep -E "^$1=[0-9]+$" .env.local | tail -1 | cut -d= -f2 || true)"
  printf '%s' "${value:-$2}"
}

listening() { timeout 1 bash -c "exec 3<>/dev/tcp/127.0.0.1/$1" 2>/dev/null; }

check_stack() {
  local name port_number
  for entry in "Postgres:$(port PG_PORT 54322)" "Mailpit:$(port MAIL_UI_PORT 54324)" "API:$(port API_PORT 8787)" "Web:$(port WEB_PORT 5173)"; do
    name="${entry%%:*}"
    port_number="${entry#*:}"
    if listening "$port_number"; then ok "$name luistert op 127.0.0.1:$port_number"; else fail "$name niet bereikbaar op 127.0.0.1:$port_number" "de eigenaar start de stack met \`pnpm dev\`"; fi
  done
}

if [[ "$mode" == --quick ]]; then
  check_stack
  exit 0
fi

expect_version() {
  local label="$1" expected="$2" actual
  shift 2
  if ! actual="$("$@" 2>/dev/null)"; then
    fail "$label ontbreekt" "scripts/bootstrap.sh (mise install)"
  elif [[ "$actual" == *"$expected"* ]]; then
    ok "$label $expected"
  else
    fail "$label is '$actual', verwacht $expected" "mise install (versie uit mise.toml)"
  fi
}

mise_version() { sed -nE "s/^$1 = \"([^\"]+)\"/\1/p" mise.toml; }
expect_version node "v$(mise_version node)" mise exec -- node --version
expect_version pnpm "$(sed -nE 's/.*"packageManager": "pnpm@([^"]+)".*/\1/p' package.json)" mise exec -- pnpm --version
expect_version dbmate "$(mise_version dbmate)" mise exec -- dbmate --version
expect_version betterleaks "$(mise_version betterleaks)" mise exec -- betterleaks version
expect_version osv-scanner "$(mise_version osv-scanner)" mise exec -- osv-scanner --version

for tool in git gh jq bwrap socat; do
  if command -v "$tool" >/dev/null; then ok "$tool aanwezig"; else fail "$tool ontbreekt" "sudo apt-get install -y $tool (docs/nieuwe-app.md)"; fi
done

watches="$(sysctl -n fs.inotify.max_user_watches 2>/dev/null || echo 0)"
if ((watches >= 524288)); then ok "inotify max_user_watches $watches"; else fail "inotify max_user_watches $watches" "fs.inotify.max_user_watches=524288 (docs/nieuwe-app.md)"; fi

if [[ "$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" == "1" ]]; then
  fail "AppArmor beperkt user namespaces: de sandbox van Claude Code start niet" "niet zelf wijzigen; melden (docs/nieuwe-app.md)"
elif bwrap --ro-bind / / --unshare-all true 2>/dev/null; then
  ok "bubblewrap start een sandbox"
else
  fail "bubblewrap start geen sandbox" "docs/nieuwe-app.md, probleemtabel"
fi

if docker info >/dev/null 2>&1; then ok "Docker draait"; else fail "Docker draait niet of je zit niet in de groep docker" "sudo systemctl start docker (docs/nieuwe-app.md)"; fi

if [[ -x .git/hooks/pre-commit ]] && grep -q lefthook .git/hooks/pre-commit; then ok "git-hooks (lefthook) geïnstalleerd"; else fail "git-hooks ontbreken" "pnpm exec lefthook install"; fi

if [[ "$mode" != --machine ]]; then check_stack; fi

if ((failures > 0)); then
  printf '\n%d probleem/problemen.\n' "$failures"
  exit 1
fi
