# 0009 — Tests buiten de sandbox

Status: geaccepteerd (2026-10-09), optie (a) — voorgesteld door de agent, herzien na de review van 2026-10-09, geaccepteerd door de eigenaar.
Gewijzigd door 0025 (punt 4: runner vergelijkt lokaal met origin/main) en [0027](0027-taakmandaat-voor-frameworkwerk.md) (vaste vertrouwde runnerchecks automatisch; CI voor gewijzigde hostcode).

## Context

De sandbox van Claude Code is op Linux/WSL2 de beveiligingsgrens (framework §8). `pnpm test:db`, `db:reset`, `db:types`, `ui:check` en
`gate:slow` staan in `excludedCommands`, omdat ze de lokale stack nodig hebben; volgens de docs draaien ze dan "outside the sandbox,
which means no filesystem restrictions and no network proxy", en hun kinderprocessen "with your full access". Ze laden bestanden
die de agent lokaal kan schrijven: tests, Vitest-/Playwright-/Drizzle-configs, `node_modules`, maar ook `package.json`, `.npmrc`,
`mise.toml` (`[env]`, hooks), `compose.override.yaml` en `.env.local` (`COMPOSE_FILE`, `COMPOSE_PROFILES`). `ask` en CODEOWNERS
houden dat niet tegen: lokaal schrijven gebeurt vóór elke review. Zo draait door de agent geschreven code met de rechten van de eigenaar.

Docs ([sandboxing](https://code.claude.com/docs/en/sandboxing), [settings](https://code.claude.com/docs/en/settings-reference),
geraadpleegd 2026-10-09, nieuwste genoemde versie v2.1.285): de sandbox draait in een eigen netwerknamespace en bereikt `localhost`
niet; `allowLocalBinding` werkt alleen op macOS; databasedrivers negeren de proxy; op Linux opent alleen `allowAllUnixSockets` sockets, en
dan alle; `excludedCommands` zonder wildcard matcht exact.

## Opties

**(a) Alles wat agentcode laadt, draait in een runner-container.** Het script start met vaste argumenten
`docker compose -f compose.yaml --project-directory . --env-file db/test.env --profile test run --rm …` (geen override-bestand, nooit
`.env.local`). De runner (gepinde Node-image met dezelfde major als `mise.toml`, glibc; voor e2e de Playwright-image met exact de versie van
`@playwright/test`) staat alleen op netwerk `test-net` (`internal: true`), met een eigen test-Postgres zonder poorten en een `pg_hba`
die `postgres` vanaf dat netwerk weigert. Repo en `node_modules` read-only, `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`,
caches (`.vite`, `.vitest`) in tmpfs, één uitvoermap die de host nooit uitvoert. Geldt voor `test:db`, `db:reset`, `db:types`, `ui:check`, `gate:slow`.
- Voor: sluit het gat; lokaal = CI (CI draait hetzelfde script); past bij de gepinde Playwright-image (§11).
- Tegen: 2–5 s extra per run; e2e start Vite en Hono in de container; `node_modules` moet Linux-binaries hebben (onzeker bij pnpm's
  globale virtual store: dan symlinks buiten de repo, uitzetten in `pnpm-workspace.yaml`).

**(b) Bewust risico, alleen review.** De eigenaar keurt elke uitgesloten run goed (staat in `ask`) na het lezen van nieuwe tests en configs.
- Voor: geen werk. Tegen: in de praktijk wordt de prompt goedgekeurd zonder te lezen; een prompt-injectie heeft volledige toegang.

**(c) Postgres binnen de sandbox bereiken via een Unix-socket** (`allowAllUnixSockets: true`).
- Tegen: opent ook `/var/run/docker.sock` (root op de host); lost `ui:check`/e2e niet op (TCP naar Vite).

## Besluit

**(a)**, gebouwd in roadmap fase 1 stuk 1 (test-infra), zodat stuk 2 en 3 hun tests er al mee draaien. Aanvullend, omdat het script zelf
op de host draait: de bestanden die de host vóór de container uitvoert (`scripts/**`, `package.json`, `pnpm-workspace.yaml`, `.npmrc`,
`.pnpmfile.cjs`, `mise.toml`, `compose*.yaml`, `db/test.env`) zijn beschermd, en het script weigert te starten als een van die bestanden
afwijkt van `HEAD` (`git diff --quiet HEAD -- <lijst>`), tenzij de eigenaar dat met een vlag expliciet toestaat.
Gewijzigd door 0025 (punt 4): lokaal vergelijkt het script met de merge-base met `origin/main` (onleesbaar → weigeren), in CI met `HEAD` (`check_host_files` in `scripts/runner.sh`).
Een test bewijst de isolatie: vanuit de runner falen een verbinding naar internet en naar de host, inloggen als `postgres` en schrijven in de repo.

## Gevolgen

- `excludedCommands` krijgt patronen met ` *` (argumenten); dezelfde commando's staan in `ask`. ADR 0027 laat het rolhek de drie vaste runnerchecks expliciet toestaan bij onveranderde vertrouwde hostcode; overige opdrachten houden hun prompt.
- Tot (a) staat, geldt (b); de PR-template vraagt bij nieuwe tests of configs: "gelezen vóór een run buiten de sandbox".
