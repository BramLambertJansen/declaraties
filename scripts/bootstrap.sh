#!/usr/bin/env bash
# Eenmalig na het clonen, door de eigenaar (framework §8: de toolchain installeert de eigenaar, niet de agent).
# Vooraf: de machine uit docs/nieuwe-app.md (Ubuntu 24.04/WSL2, Docker Engine, mise, gh, bubblewrap, socat).
set -euo pipefail
cd "$(dirname "$0")/.."

mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
# lefthook heeft geen postinstall (pnpm-workspace.yaml: allowBuilds); de hooks komen alleen hier.
mise exec -- pnpm exec lefthook install
scripts/doctor.sh --machine
