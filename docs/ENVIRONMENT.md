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

## Eerst controleren in een sessie

Een sessie controleert dit eerst en stopt bij een fout, voordat ze iets verkent:

| Vereiste | Controle | Bij een fout |
|---|---|---|
| Node uit `mise.toml` en dependencies | `node scripts/kit/feiten.mjs` geeft geen `✗ toolchain ontbreekt` (`scripts/kit/toolchain.mjs`) | setup-script niet gedraaid of mislukt; zie Problemen |
| Netwerk vanuit de Bash-tool | `pnpm install --frozen-lockfile` slaagt | zie Problemen, proxy |
| Branch | `git branch --show-current` | zie Branchnaam |

Zonder Node 26 en dependencies draait geen enkele check die bewijs levert (`pnpm gate:fast`, `pnpm pr:verify`, `pnpm meting`).
Een overdracht aan een cloudsessie begint daarom met een blok **Vereisten** met deze drie punten.

## Grens van de sandbox

De Bash-sandbox (`sandbox` in `.claude/settings.json`) kan niet schrijven naar `.claude/settings.json`,
`.claude/settings.local.json`, `.claude/hooks/**` en `.claude/skills/**`. Dat is een grens van Claude Code, niet van deze repo,
en hij geldt lokaal en in de cloud. Een wijziging daar gaat alleen via de Edit-tool in de hoofdsessie, met een prompt die de
eigenaar accepteert; het rolhek weigert een developer-subagent op die paden. Een taak die die paden raakt, vraagt dus een
sessie waarin de eigenaar aanwezig is, of de eigenaar voert de wijziging zelf uit. De sandbox ruimer zetten is een
eigenaarsbesluit (beschermd pad, `docs/framework.md` §10).

## Branchnaam

Een cloudsessie start op een branch die het platform kiest (`claude/<naam>`). Een overdracht schrijft daarom geen
branchnaam voor; de PR komt van de opgelegde branch. Is een vaste naam nodig, dan start de eigenaar de sessie op die branch.

## Problemen

- **`✗ toolchain ontbreekt`** (bijvoorbeeld `Node v22…, verwacht 26…` of `node_modules ontbreekt`): het setup-script is niet
  gedraaid, mislukt of de omgeving is gecachet van vóór het script. Controleer in claude.ai/code dat het setup-script precies
  `bash scripts/cloud-setup.sh` is en ververs de omgevingscache.
- **`✗ mise ophalen van github.com mislukt`** (of `mise install`, `pnpm install`): geen netwerk. Controleer dat netwerktoegang
  op Trusted staat. Meldt curl `Failed to connect to localhost port 3128`, dan antwoordt de proxy uit `HTTPS_PROXY` niet.
- **Proxy in de Bash-tool**: het setup-script draait in een ander proces dan de sandboxed Bash-tool van de sessie. Dat het
  script slaagt, bewijst niet dat de Bash-tool het netwerk bereikt; controleer beide (zie Eerst controleren).
- **`Sandbox required but unavailable`**: de setup is niet gedraaid of de omgeving is gecachet van vóór deze stap. Draai
  `bash scripts/cloud-setup.sh` opnieuw of ververs de omgevingscache.
- **Sandbox uitzetten** is bewust geen standaard: `.claude/settings.json` blijft `sandbox` aan houden. Wie dat toch wil, doet dat per
  omgeving buiten de repo en met eigenaarakkoord (beschermd pad, `docs/framework.md` §10).
