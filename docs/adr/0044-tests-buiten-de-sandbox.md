# 0044 — Tests buiten de sandbox: de runner

Status: geaccepteerd

Vervangt [0009](0009-tests-buiten-de-sandbox.md), met de correcties uit [0025](0025-werkstraat-tot-de-merge.md) punt 4 en
[0027](0027-taakmandaat-voor-frameworkwerk.md) punt 6. Drempel: A4. Consolidatie zonder inhoudelijke wijziging
(eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen).

## Context

De sandbox van Claude Code is op Linux/WSL2 de beveiligingsgrens (`docs/framework.md` §8). Commando's die de lokale stack nodig
hebben, draaien erbuiten, met de rechten van de eigenaar en zonder proxy. Ze laden bestanden die de agent lokaal kan schrijven:
tests, configs van Vitest, Playwright en Drizzle, `node_modules`, `package.json`, `.npmrc`, `mise.toml`, compose-bestanden en
`.env.local`. `ask` en CODEOWNERS houden dat niet tegen, want lokaal schrijven gebeurt vóór elke review. Vanuit de sandbox is
`localhost` niet bereikbaar, en een Unix-socket openen kan op Linux alleen voor alle sockets tegelijk.

## Besluit

1. **Runner-container** (was 0009 optie a). Alles wat agentcode laadt en de stack nodig heeft (database-, UI- en
   generatorchecks en `gate:slow`), draait via `scripts/runner.sh` in een container met vaste argumenten: alleen `compose.yaml`
   en `db/test.env`, nooit een override-bestand of `.env.local`. CI draait hetzelfde script, dus lokaal = CI.
2. **Isolatie** (was 0009 optie a). De runner (gepinde image, dezelfde Node-major als `mise.toml`; voor e2e de Playwright-image
   van exact de gebruikte versie) staat alleen op een intern netwerk met een eigen test-Postgres zonder poorten, die `postgres`
   vanaf dat netwerk weigert. Repo en `node_modules` read-only, geen capabilities, `no-new-privileges`, caches in tmpfs, één
   uitvoermap die de host nooit uitvoert.
3. **Hostbestanden beschermd** (was 0009). Wat de host vóór de container uitvoert (scripts, package- en installatiebestanden,
   `mise.toml`, compose-bestanden, `db/test.env` en de runnerconfigs), is beschermd. Het script weigert te starten als een
   daarvan afwijkt: lokaal van de merge-base met `origin/main` (onleesbaar → weigeren met de melding `git fetch origin`), in
   CI van `HEAD` (was 0025 punt 4). De exacte lijst staat in `scripts/runner.sh`.
4. **Uitweg alleen voor de eigenaar** (was 0009, 0025 punt 4, 0027 punt 6). De eigenaar kan de hostcontrole met een vlag
   overslaan na het lezen van de wijziging. De agent gebruikt die vlag nooit, en ook geen lokaal `CI=true` of een rechtstreeks
   Docker-commando.
5. **Vaste runnerchecks zonder prompt** (was 0027 punt 6). `pnpm test:db`, `pnpm ui:check` en `pnpm gate:slow` mogen exact zo
   zonder herhaalde runprompt draaien wanneer main `autoRunner` toestaat en alle hostbestanden ongewijzigd zijn. Overige
   opdrachten buiten de sandbox houden hun prompt.
6. **Gewijzigde hostcode in de wegwerp-CI** (was 0027 punt 6). De hoofdsessie wacht met `pnpm pr:verify`, leest de werkelijke
   uitslagen en herstelt rode checks; ontbrekend runnerbewijs gaat niet als routineklus naar de eigenaar.
7. **Isolatie bewezen** (was 0009). Een test bewijst dat vanuit de runner een verbinding naar internet en naar de host,
   inloggen als `postgres` en schrijven in de repo falen.

## Alternatieven

- **Bewust risico, alleen review** (was 0009 optie b): de eigenaar keurt elke run goed na het lezen van tests en configs. In de
  praktijk wordt de prompt goedgekeurd zonder te lezen; een prompt-injectie heeft dan volledige toegang.
- **Postgres via een Unix-socket in de sandbox** (was 0009 optie c): `allowAllUnixSockets` opent ook de Docker-socket (root op
  de host) en lost UI-checks en e2e niet op.
- **Iedere runner door de eigenaar laten starten** (was 0027): vervangen door vaste gecontroleerde opdrachten en CI.

## Gevolgen

- De runnercommando's staan in `excludedCommands` (met ` *` voor argumenten) en in `ask`; het rolhek staat de vaste
  runnerchecks expliciet toe bij onveranderde hostcode (was 0009, 0027).
- Een run kost enkele seconden extra; e2e start Vite en Hono in de container, en `node_modules` moet Linux-binaries hebben.
- Restrisico: de runner draait door de agent geschreven tests zonder prompt. De container is daarvoor de grens; de
  hostcontrole vooraf dekt alleen de hostbestanden, niet de tests zelf.
