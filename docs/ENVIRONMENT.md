# Omgeving opzetten (cloudsessies)

Dit document legt vast wat een cloudomgeving van Claude Code nodig heeft om met deze repo te werken, en hoe je hem opzet.
De opzet zelf staat als code in `scripts/cloud-setup.sh`; dit document is de uitleg erbij. Wijzigt het script, werk dan dit
document bij in dezelfde PR.

## Opzetten

1. Maak op claude.ai/code een omgeving met netwerktoegang **Trusted** (de standaard).
2. Zet als setup-script precies dit, verder niets:

   ```bash
   bash scripts/cloud-setup.sh
   ```

3. Start elke sessie met één repo, zodat de hooks en permissieregels uit `.claude/settings.json` gelden.

Een andere omgeving (bijvoorbeeld voor een tweede repo uit deze template) neemt dezelfde instellingen over met dezelfde
twee stappen: netwerktoegang Trusted en `bash scripts/cloud-setup.sh` als setup-script.

## Wat het script doet

Het script is idempotent: opnieuw draaien verandert niets als alles er al staat. Het doet, in deze volgorde:

| Stap | Waarom |
|---|---|
| `bubblewrap` en `socat` installeren via `apt-get`, alleen als ze ontbreken | De Bash-sandbox van Claude Code (`sandbox` in `.claude/settings.json`) heeft ze nodig. Zonder falen sessies met `Sandbox required but unavailable: bubblewrap and socat not installed`. |
| `mise` ophalen als release-binary van github.com (gepinde versie) | `mise.run` staat niet op de allowlist van netwerktoegang Trusted. |
| `~/.bashrc` een PATH-regel voor de mise-shims geven | Latere shells (Bash-tool, hooks) vinden `node`, `pnpm` en `dbmate`. |
| `mise install` | Toolchain uit `mise.toml`. |
| `pnpm install --frozen-lockfile` | Dependencies exact volgens het lockfile. |
| `pnpm exec lefthook install` | Git-hooks (lefthook heeft geen postinstall). |

Het script bevat geen geheimen en vraagt er geen. Het draait zonder root via `sudo` als dat nodig is.

## Wat de omgeving verder nodig heeft

- Netwerk: alleen de standaard-allowlist (Trusted); `github.com` en de pakketbron van `apt-get` volstaan.
- Geen lokale stack: in een cloudsessie draaien `pnpm gate:slow` en `pnpm test:db` in CI (README, Cloud).
- Geen secrets in de omgeving; `.env*` blijft buiten beeld (`AGENTS.md`, Repo en grenzen).

## Problemen

- **`Sandbox required but unavailable`**: de setup is niet gedraaid of de omgeving is gecachet van vóór deze stap. Draai
  `bash scripts/cloud-setup.sh` opnieuw of ververs de omgevingscache.
- **Sandbox uitzetten** is bewust geen standaard: `.claude/settings.json` blijft `sandbox` aan houden. Wie dat toch wil, doet dat per
  omgeving buiten de repo en met eigenaarakkoord (beschermd pad, `docs/framework.md` §10).
