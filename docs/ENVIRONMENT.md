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
| `bubblewrap` en `socat` installeren via `apt-get`, alleen als ze ontbreken | De Bash-sandbox van Claude Code (`sandbox` in `.claude/settings.json`) heeft ze nodig. Zonder falen sessies met `Sandbox required but unavailable: bubblewrap and socat not installed`. `gate:fast` heeft bubblewrap ook nodig: de kooi (`scripts/kit/kooi.mjs`, ADR 0072) draait overgenomen commando's in tests en valt zonder bubblewrap dicht. |
| `mise` ophalen als release-binary van github.com (gepinde versie) | `mise.run` staat niet op de allowlist van netwerktoegang Trusted. |
| `~/.bashrc` een PATH-regel voor de mise-shims geven | Latere shells (Bash-tool, hooks) vinden `node`, `pnpm` en `dbmate`. |
| `mise install` | Toolchain uit `mise.toml`. |
| Terugval per ontbrekende tool (zie Terugval) | De proxy van een cloudsessie weigert de GitHub-API, die `mise install` voor pnpm, dbmate, betterleaks en osv-scanner nodig heeft. |
| Stoppen als `mise ls --missing` nog iets noemt | Een tool zonder terugval valt meteen op, niet pas bij de eerste check of commit. |
| `pnpm install --frozen-lockfile` | Dependencies exact volgens het lockfile. |
| `pnpm exec lefthook install` | Git-hooks (lefthook heeft geen postinstall). |
| Voorcontrole uit `scripts/kit/toolchain.mjs` | Bewijst aan het eind van de setup dezelfde exacte Node- en pnpm-versie en `node_modules` die elke sessie eerst controleert. |

Het script bevat geen geheimen en vraagt er geen. Het draait zonder root via `sudo` als dat nodig is.

## Terugval

`mise install` haalt node van nodejs.org, maar voor de aqua-tools (pnpm, dbmate, betterleaks, osv-scanner) vraagt het
eerst de GitHub-API (`api.github.com/repos/<repo>/releases/tags/<versie>`). De proxy van een cloudsessie weigert die API
voor repo's die niet aan de sessie hangen (403); release-downloads van `github.com`, `nodejs.org` en `registry.npmjs.org`
gaan wel door. Daarom vult `scripts/cloud-setup.sh:65` (`terugval`) elke tool aan waarvoor `mise where` faalt:

| Tool | Bron | Controle op de inhoud |
|---|---|---|
| node | `nodejs.org/dist/v<versie>/` | `SHASUMS256.txt` van dezelfde release |
| pnpm, dbmate | npm-registry (`npm install --global --prefix`) | npm controleert de integriteit (sha512) uit de registry |
| betterleaks | release-download op `github.com` | `checksums.txt` van dezelfde release |
| osv-scanner | release-download op `github.com` | `osv-scanner_SHA256SUMS` van dezelfde release |

Waarom zo:

- **Exact dezelfde versie.** De versie komt uit `mise current <tool>`, dus uit `mise.toml` (pnpm via `packageManager` in
  `package.json`). Er staat geen tweede versienummer in het script; een Renovate-update werkt ook voor de terugval.
- **Geen stille afwijking.** Klopt een checksum niet of ontbreekt hij, dan stopt het script vóór er iets geïnstalleerd is.
  De slotcontrole met `scripts/kit/toolchain.mjs` faalt bij elke andere Node- of pnpm-versie.
- **Voor mise onzichtbaar.** `mise link` registreert de map (`~/.local/share/mise-terugval/<tool>-<versie>`) als die
  versie, zodat `mise exec`, de shims en de pre-commit-hook (`mise exec -- betterleaks`) werken alsof mise hem installeerde.
  `MISE_EXEC_AUTO_INSTALL=false` geldt alleen tijdens het script.
- **Alleen waar nodig.** Lokaal en in CI installeert mise alles zelf, met zijn eigen attestatiecontroles; de terugval draait
  alleen voor een tool die na `mise install` ontbreekt, en het script draait alleen in de cloud.
- **Uitbreidbaar.** Een nieuwe tool in `mise.toml` zonder terugval laat de setup stoppen met de naam van de tool
  (`mise ls --missing`); voeg dan een tak toe aan `terugval` met een bron en een controle op de inhoud.

De tests staan in `test/scripts/cloud-setup.test.ts`: versie en bron per tool, `mise link`, weigering bij een verkeerde
checksum, een mislukte download en een tool die blijft ontbreken.

## Wat de omgeving verder nodig heeft

- Netwerk: alleen de standaard-allowlist (Trusted); `github.com`, `nodejs.org`, de npm-registry en de pakketbron van
  `apt-get` volstaan. De GitHub-API is niet nodig (zie Terugval).
- Geen lokale stack: in een cloudsessie draaien `pnpm gate:slow` en `pnpm test:db` in CI (README, Cloud).
- Geen secrets in de omgeving; `.env*` blijft buiten beeld (`AGENTS.md`, Repo en grenzen).

## Minimale Claude Code-versie

Claude Code 2.1.295 of nieuwer, lokaal en in de cloud. Vanaf die versie bestaat `onFailure: "block"`, waarmee het rolhek
een aanroep tegenhoudt als het zelf crasht, niet start of zijn timeout haalt (ADR 0045 punt 3). Een oudere versie laat de
aanroep dan door of verwerpt de sleutel; wat precies, is niet gemeten. `scripts/doctor.sh` (volledig en `--machine`) geeft
bij een oudere of onleesbare versie een ✗ en exit 1, ook als `claude --version` faalt; `werkstraat session-start` zet dezelfde
melding in de context (`rails/hooks/lib/claude-versie.mjs`), maar zwijgt als `claude --version` faalt of ontbreekt. Zonder
`claude` op het pad, zoals in CI, slaat de doctor de controle over. Beide kijken naar de `claude` op het pad; met meerdere
installaties kan dat een andere zijn dan die de sessie draait. In een cloudsessie zonder projecthooks draait het rolhek
niet (#462).

## Eerst controleren in een sessie

Een sessie controleert dit eerst en stopt bij een fout, voordat ze iets verkent:

| Vereiste | Controle | Bij een fout |
|---|---|---|
| Node, exacte pnpm-pin en installatiebestanden aanwezig | `node scripts/kit/feiten.mjs` geeft geen `✗ toolchain ontbreekt` (`scripts/kit/toolchain.mjs`) | setup-script niet gedraaid of mislukt; zie Problemen |
| Netwerk vanuit de Bash-tool | `pnpm install --frozen-lockfile` slaagt | zie Problemen, proxy |
| Branch | `git branch --show-current` | zie Branchnaam |

Zonder Node 26 en dependencies draait geen enkele check die bewijs levert (`pnpm gate:fast`, `pnpm pr:verify`, `pnpm meting`).
Een overdracht aan een cloudsessie begint daarom met een blok **Vereisten** met deze drie punten.

De voorcontrole valideert ook de exacte `packageManager`-pin en vergelijkt die met de werkelijke uitvoer van
pnpm op `PATH`. Een verkeerde versie met exitcode 0 telt als fout; een waarschuwing over een SQLite-cache gevolgd door
een andere versie is geen geslaagde versiewissel. Deze controle bewijst geen synchronisatie van dependencies.
Voor `pnpm run` en `pnpm exec`
controleert pnpm zelf of de installatie bij de huidige workspace past (`verifyDepsBeforeRun: error` in
`pnpm-workspace.yaml`). Past een verouderde of gekopieerde installatie niet bij de workspace, dan stopt pnpm met
`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` vóór het werkcommando, zonder dependencies automatisch bij te werken. Herstel de installatie expliciet met `pnpm install --frozen-lockfile`
volgens de setup. De regressieproef in `test/scripts/dependency-readiness.test.ts` draait de gepinde pnpm met lokale
fixtures en controleert ook dat een weigering installatiebestanden ongemoeid laat.

## Dagelijks werken binnen de Claude Code-sandbox

Volgens [ADR 0061](adr/0061-claude-sandbox-werkstraat.md) selecteert `mise.toml` rechtstreeks de exacte pnpm-versie
uit `package.json`. De bestaande setup installeert die vooraf, zodat de shell en Git-hooks dezelfde pnpm gebruiken.
Er staat geen tweede versienummer in mise en dagelijks werk hoeft geen globale pnpm-cache te wijzigen.
Na een template-update met een andere pin hoort de passende toolchain bij de eenmalige inrichting; een ontbrekende
versie blijft een installatiefout, geen aanleiding om de sandbox uit te zetten.

`autoAllowBashIfSandboxed` staat expliciet aan. De hoofdsessie kan normale wijzigingen stagen en committen en de
huidige featurebranch pushen met `git push origin HEAD`. Deze vorm schrijft geen upstreaminstelling in de
afgeschermde Git-config. Bij PR-aanmaak noemt de hoofdsessie de werkbranch met `--head` en gebruikt zij `--body-file`,
zodat gh geen extra pushkeuze hoeft te vragen. De volledige pre-commit-, commit-msg- en pre-push-hooks blijven draaien.
De [agentdoorloop](operations/agent-doorloop.md#ontwikkelen-en-runnerchecks) beschrijft de overdracht aan CI.

`ask`, `deny`, het rolhek uit main en de verplichte GitHub-checks blijven leidend. Subagents krijgen geen push- of
PR-schrijfrechten; main-push, force, hookoverslaan, PR-merge en zelfreview blijven geweigerd. De bestaande lokale
merge van main en veilige taakbranchopruiming blijven beschikbaar. Geen nieuwe runneruitzondering, Git-allowWrite
of schrijfbare globale pnpm-opslag is nodig.

Regressies staan in `test/scripts/mise-pnpm-selection.test.ts`, `test/scripts/toolchain-pnpm-runtime.test.ts`,
`test/rails/claude-sandbox-werkstraat.test.ts` en `test/hooks/rolhek-sandbox-werkstraat.test.ts`.
Configuratietests bewijzen niet dat een native Claude-sessie werkt: de implementatie-PR legt afzonderlijk de
werkelijke versie, prompts, commit-hooks, featurepush, PR-aanmaak en CI vast, in hoofdcheckout én worktree.

## Grens van de sandbox

De Bash-sandbox (`sandbox` in `.claude/settings.json`) kan niet schrijven naar `.claude/settings.json`,
`.claude/settings.local.json`, `.claude/hooks/**` en `.claude/skills/**`. Dat is een grens van Claude Code, niet van deze repo,
en hij geldt lokaal en in de cloud. Een wijziging daar gaat alleen via de Edit-tool in de hoofdsessie, met een prompt die de
eigenaar accepteert; het rolhek weigert een developer-subagent op die paden. Een taak die die paden raakt, vraagt dus een
sessie waarin de eigenaar aanwezig is, of de eigenaar voert de wijziging zelf uit. De sandbox ruimer zetten is een
eigenaarsbesluit (beschermd pad, `docs/framework.md` §10).

De broncode van de hooks staat daarom in `rails/hooks/`, buiten die grens (ADR 0045 punt 3). In `.claude/hooks/` staan alleen
stubs die de versie van `main` op de remote draaien, uitgepakt in `.claude/hooks/.cache/`: binnen de grens, zodat Bash die code
niet kan vervangen. Wie `rails/hooks/` op een branch wijzigt, verandert de lopende sessie niet. Het anker (de SHA van `main` op de
remote) legt de start van een sessie vast en vraagt netwerk; weigert het rolhek alles met "geen geldig anker", probeer de actie opnieuw (de meethook legt het anker dan meestal vast) of start één sessie
met netwerk.

## Branchnaam

Een cloudsessie start op een branch die het platform kiest (`claude/<naam>`). Een overdracht schrijft daarom geen
branchnaam voor; de PR komt van de opgelegde branch. Is een vaste naam nodig, dan start de eigenaar de sessie op die branch.

## Problemen

- **`✗ toolchain ontbreekt`** (bijvoorbeeld `Node v22…, verwacht 26…` of `node_modules ontbreekt of is onvolledig`): het setup-script is niet
  gedraaid, mislukt of de omgeving is gecachet van vóór het script. Controleer in claude.ai/code dat het setup-script precies
  `bash scripts/cloud-setup.sh` is en ververs de omgevingscache.
- **`! mise install onvolledig`** gevolgd door `✓ <tool> <versie> via terugval`: verwacht in een cloudsessie (zie Terugval).
- **`✗ checksum van … klopt niet`**: de download wijkt af van het checksumbestand van de release; er is niets geïnstalleerd.
  Draai het script opnieuw; blijft het, meld het als leerpunt en ga niet zonder controle verder.
- **`✗ tools uit mise.toml ontbreken, ook na de terugval`**: een tool zonder terugval; voeg een tak toe aan `terugval` in
  `scripts/cloud-setup.sh`.
- **`✗ mise ophalen van github.com mislukt`** (of een download van de terugval, `pnpm install`): geen netwerk. Controleer dat netwerktoegang
  op Trusted staat. Meldt curl `Failed to connect to localhost port 3128`, dan antwoordt de proxy uit `HTTPS_PROXY` niet.
- **Proxy in de Bash-tool**: het setup-script draait in een ander proces dan de sandboxed Bash-tool van de sessie. Dat het
  script slaagt, bewijst niet dat de Bash-tool het netwerk bereikt; controleer beide (zie Eerst controleren).
- **`Sandbox required but unavailable`**: de setup is niet gedraaid of de omgeving is gecachet van vóór deze stap. Draai
  `bash scripts/cloud-setup.sh` opnieuw of ververs de omgevingscache.
- **Sandbox uitzetten** is bewust geen standaard: `.claude/settings.json` blijft `sandbox` aan houden. Wie dat toch wil, doet dat per
  omgeving buiten de repo en met eigenaarakkoord (beschermd pad, `docs/framework.md` §10).
