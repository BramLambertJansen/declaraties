---
status: goedgekeurd # besluiten OV-1 t/m OV-5 van de eigenaar (2026-10-28); de merge door de eigenaar is de acceptatie (ADR 0046)
namespace: app-init-proef
---

# App-init-proef: de snelle suite draait ook tegen een verse app

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Een nieuwe check `check:app-init` draait `pnpm app:init` op een tijdelijke kopie van de repo en daarna de snelle suite in
die kopie, zodat een test die alleen in de template slaagt (leest `onderhoud` uit `.claude/gates.json`, `name` uit
`package.json`, of roept `planAppInit` ongeguard aan) de template-CI rood maakt in plaats van de eerste app.

**Toets aan framework §1.** Aanleiding: leerpunt #334 (soort "valkuil zonder check"), eerder dezelfde klasse in #317
(fix 6819c27 in `test/rails/leerpunt-settings.test.ts`; daarna `test/hooks/rolhek-leerpunt.test.ts` met de guard
`config.onderhoud === undefined`). Kosten volgens #334: een extra review- en testronde, en bij #317 een app-PR die niet
kon mergen. Een strengere check is geen ADR (framework kop, ADR 0046 punt 4); geen nieuwe dependency.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| CI (job `check:app-init`) | draait `pnpm check:app-init` op elke PR en elke push naar `main`; verplichte check (OV-1) | — |
| developer / hoofdsessie | draait `pnpm check:app-init` lokaal (sandbox, zonder Docker); `--bewaar` om de kopie te inspecteren | de check overslaan of een rode uitslag als groen melden |
| eigenaar | merget de PR en past daarna de ruleset toe (`scripts/github-ruleset.sh`), zodat `check:app-init` verplicht is (OV-1) | — |

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of policy; de check raakt alleen een tijdelijke map.

## Routes en foutcodes

n.v.t. — geen API-route, permissie of foutcode.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Kopieer de vorm van

Geen accountbeheerpad uit `docs/gouden-pad.md` past (dit is een check, geen feature). De vorm komt van de bestaande
kopie-check die `docs/gouden-pad.md` al noemt (`pnpm check:new-resource`):

- `scripts/kit/check-new-resource.mjs` — `kopie()` (git ls-files met nieuwe bestanden, link naar `node_modules`, `git init` met een basiscommit en de ref refs/remotes/origin/main), `script()` (een `package.json`-script uitvoeren zonder pnpm), try/finally met `rmSync` en de vlag `--bewaar`
- `scripts/kit/gate-fast.mjs` — `snelleGates()` als enige bron van de snelle suite
- `.github/workflows/ci.yml` — de job `new-resource` (checkout, mise, `pnpm install --frozen-lockfile`, één `pnpm`-stap)
- `test/scripts/app-init.test.ts` — fixtures voor de bestanden die `app:init` leest, in een `mkdtempSync`-map met opruimen in `afterEach`

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI. Hergebruikt: `scripts/kit/app-init.mjs` (als CLI, ongewijzigd), `snelleGates()` uit `scripts/kit/gate-fast.mjs`, en `kopie()`/`script()`, die uit `scripts/kit/check-new-resource.mjs` verhuizen naar de nieuwe gedeelde module `scripts/kit/proef-kopie.mjs` (OV-3).
- Staten per scherm: n.v.t. — geen scherm. Uitvoer op de terminal: per stap de bestaande uitvoer van de gate; aan het eind één regel.
- Alle zichtbare tekst letterlijk:
  - geslaagd: `check:app-init: proef-app haalt gate:fast na app:init`
  - overgeslagen in een app: `check:app-init: overgeslagen, dit is al een app`
  - init mislukt: `✗ check:app-init: app:init faalde in de kopie` (gevolgd door de bestaande uitvoer van `app-init.mjs`)
  - gate rood: `✗ check:app-init: <script> faalt na app:init (de template slaagt; zie leerpunt #334)`
  - geen node_modules: `✗ check:app-init: node_modules ontbreekt; draai eerst pnpm install`
  - bewaard: `check:app-init: kopie bewaard in <pad>`
  - opruimen geweigerd: `✗ check:app-init: weigert <pad> te verwijderen: niet de eigen tijdelijke map` (bij `check:new-resource` staat daar `check:new-resource`: de guard noemt de check van zijn prefix)
  - geen `.claude/gates.json`: `✗ check:app-init: .claude/gates.json ontbreekt`
- Focusvolgorde en toetsenbord: n.v.t. — geen UI.

### Werking (bindend)

0. **Alleen in de template.** Heeft `.claude/gates.json` van de bron geen `onderhoud`, dan is de bron al een app: exit 0 met de tekst "overgeslagen" (OV-4). Ontbreekt het bestand zelf, dan faalt de check (AC-18): anders slaagt de verplichte check stil als de template het bestand per ongeluk kwijtraakt.
1. **Kopie.** Via `kopie()` uit `scripts/kit/proef-kopie.mjs` (OV-3) met prefix `app-init-proef-`: een map via `mkdtempSync(path.join(os.tmpdir(), 'app-init-proef-'))` (respecteert `TMPDIR`, dus de sandbox).
   Inhoud: `git ls-files -z --cached --others --exclude-standard` van de bron, plus een symlink naar `node_modules` van de bron.
   Daarin `git init -b main`, alles toevoegen, commit `basis` (de templatestand), en `refs/remotes/template/main` op die commit,
   zodat `app-init.mjs` zijn `git rev-parse --short template/main` vindt zoals in een gekoppelde app.
2. **Init.** `node scripts/kit/app-init.mjs proef-app "Proef-app" --owner proef-eigenaar` in de kopie: de CLI, niet
   `planAppInit`, zodat ook `main()` meedoet; met `--owner`, zodat ook `.github/CODEOWNERS` wijzigt (de breedste init).
   Daarna commit `chore: rename to proef-app` en `refs/remotes/origin/main` op die commit (de stand van een app na de
   init-PR). `template/main` blijft op `basis`, zodat `test/scripts/app-init-template.test.ts` zijn templateinvoer in de geschiedenis vindt.
3. **Suite.** Elk script uit `snelleGates()` na elkaar via `script()` (zonder pnpm, met `node_modules/.bin` vooraan in `PATH`);
   de eerste rode stopt de check met exitcode ≠ 0. Alle snelle gates, geen eigen lijst (OV-2).
4. **Opruimen.** In `finally` en bij `SIGINT`/`SIGTERM` (exit 130/143, ook tijdens het kopiëren, en voor beide checks via `bijSignaal()` in de gedeelde module) `rmSync(kopie, { recursive: true, force: true })`,
   maar alleen als het pad direct onder `os.tmpdir()` ligt en met het eigen prefix begint; anders weigeren (tekst hierboven).
   Die opruimguard staat in `scripts/kit/proef-kopie.mjs`, met het prefix als parameter (`app-init-proef-` hier, `new-resource-` voor `check:new-resource`).
   `rmSync` volgt de `node_modules`-link niet; de bron blijft heel. `--bewaar` slaat het opruimen over en meldt het pad.
5. **Isolatie.** Elk kindproces krijgt de omgeving zonder de repo-variabelen van git (`git rev-parse --local-env-vars`,
   zoals `test/setup/git-env.ts`; o.a. `GIT_DIR`, `GIT_INDEX_FILE`), zodat een git-hook de kopie niet naar de bron laat wijzen.
   Ook dit staat in `scripts/kit/proef-kopie.mjs`, zodat `check:new-resource` dezelfde isolatie krijgt (OV-3).
6. **Niet:** geen `pnpm` of `npm` in de kopie (pnpm wil daar installeren), geen `pnpm install`, geen netwerk, geen Docker,
   geen `test:db`, `ui:check` of `check:snapshot` (die vragen de runner, ADR 0044), geen schrijfactie in de bron. Niet in
   `gate:fast` en niet in het gate-register (`scripts/kit/gates.mjs`): de check duurt minuten, net als `check:new-resource`.
7. **Gedeelde module (OV-3).** `scripts/kit/proef-kopie.mjs` exporteert `kopie(bron, prefix)`, `script(root, naam)` en de
   opruimfunctie, en draait niets bij import. `scripts/kit/check-new-resource.mjs` importeert ze; zijn gedrag blijft gelijk
   (zelfde basiscommit, `origin/main`, gates en eindregel), met de opruimguard en de git-env-isolatie erbij.

## Acceptatiecriteria

- **app-init-proef/AC-1** — Gegeven een schone checkout van de template, wanneer `pnpm check:app-init` draait, dan eindigt hij met exitcode 0 en als laatste regel `check:app-init: proef-app haalt gate:fast na app:init`.
- **app-init-proef/AC-2** — Gegeven een fixture-repo met de `app:init`-invoer (vorm van `test/scripts/app-init.test.ts`) en een snel script dat faalt zodra `.claude/gates.json` geen `onderhoud` meer heeft, wanneer de check daarop draait, dan is de exitcode ≠ 0 en noemt de uitvoer `✗ check:app-init: <script> faalt na app:init`; zonder die afhankelijkheid slaagt dezelfde fixture.
- **app-init-proef/AC-3** — Gegeven dezelfde fixture met een script dat `planAppInit` zonder guard aanroept, wanneer de check draait, dan faalt hij (exitcode ≠ 0); hetzelfde script in de bron zonder init slaagt.
- **app-init-proef/AC-4** — Gegeven de kopie na stap 2, dan heet `package.json` `proef-app`, bevat `.claude/gates.json` geen `onderhoud`, staat `@proef-eigenaar` in `.github/CODEOWNERS`, wijst `origin/main` naar de rename-commit en `template/main` naar `basis`.
- **app-init-proef/AC-5** — Gegeven een fixture met `onderhoud` in `.claude/gates.json` waarin `app-init.mjs` met `AppInitError` faalt (bijv. `README.md` zonder de kop `# App-template`), wanneer de check draait, dan is de exitcode ≠ 0 met `✗ check:app-init: app:init faalde in de kopie` en draait er geen gate.
- **app-init-proef/AC-6** — Gegeven een geslaagde én een gefaalde run, dan bestaat de tijdelijke map daarna niet meer; met `--bewaar` bestaat hij nog en staat het pad in de uitvoer.
- **app-init-proef/AC-7** — Gegeven een run die met `SIGTERM` wordt afgebroken terwijl een gate draait, dan bestaat de tijdelijke map daarna niet meer en is de exitcode 143.
- **app-init-proef/AC-8** — Gegeven een te verwijderen pad buiten `os.tmpdir()` of zonder prefix `app-init-proef-`, wanneer de opruimfunctie wordt aangeroepen, dan verwijdert ze niets en meldt ze `✗ check:app-init: weigert <pad> te verwijderen: niet de eigen tijdelijke map`.
- **app-init-proef/AC-9** — Gegeven een run (geslaagd of gefaald), dan zijn `git status --porcelain` en `git rev-parse HEAD` van de bron gelijk aan ervoor en bestaat `node_modules` van de bron nog met dezelfde inhoud van `node_modules/.bin`.
- **app-init-proef/AC-10** — Gegeven `GIT_DIR` en `GIT_INDEX_FILE` die naar de bron wijzen (zoals in een git-hook), wanneer de check draait, dan krijgt de bron geen commit en geen gewijzigde index (AC-9 blijft waar).
- **app-init-proef/AC-11** — Gegeven een `PATH` met vooraan nep-uitvoerbare bestanden `pnpm`, `npm` en `docker` die een markeerbestand schrijven, wanneer de check op de fixture draait, dan bestaat dat markeerbestand daarna niet.
- **app-init-proef/AC-12** — Gegeven `.github/workflows/ci.yml`, dan bestaat er een eigen job (OV-5; geen stap in de job `new-resource`) met `name: check:app-init` die op `pull_request` en push naar `main` draait, de vorm van de job `new-resource` heeft en `pnpm check:app-init` uitvoert; en `package.json` heeft het script `check:app-init` dat `node scripts/kit/check-app-init.mjs` start.
- **app-init-proef/AC-13** — Gegeven een bron waarvan `.claude/gates.json` geen `onderhoud` heeft (een app), wanneer de check draait, dan is de exitcode 0, is de uitvoer `check:app-init: overgeslagen, dit is al een app` en wordt er geen tijdelijke map gemaakt.
- **app-init-proef/AC-14** — Gegeven een bron zonder `node_modules`, wanneer de check draait, dan is de exitcode ≠ 0 met `✗ check:app-init: node_modules ontbreekt; draai eerst pnpm install` en wordt er geen tijdelijke map gemaakt.
- **app-init-proef/AC-15** — Gegeven `.claude/decisions.json`, `scripts/github-ruleset.sh` en `docs/nieuwe-app.md`, dan staat `check:app-init` in `requiredChecks`, in de lijst `checks=(…)` en in beide opsommingen van verplichte checks in `docs/nieuwe-app.md` (OV-1).
- **app-init-proef/AC-16** — Gegeven `scripts/kit/proef-kopie.mjs`, dan importeren `scripts/kit/check-app-init.mjs` en `scripts/kit/check-new-resource.mjs` allebei `kopie()` en `script()` daaruit en definieert geen van beide ze zelf; importeren van `proef-kopie.mjs` start geen proces en maakt geen map; en `pnpm check:new-resource` eindigt na de refactor met exitcode 0 en zijn bestaande eindregel `check:new-resource: time-entries haalt gate:fast` (OV-3).
- **app-init-proef/AC-17** — Gegeven `kopie(bron, 'new-resource-')` uit `scripts/kit/proef-kopie.mjs` met `GIT_DIR` en `GIT_INDEX_FILE` naar de bron, dan krijgt de bron geen commit en geen gewijzigde index; en de opruimfunctie met prefix `new-resource-` weigert een pad met prefix `app-init-proef-` (OV-3).

- **app-init-proef/AC-18** — Gegeven een bron zonder `.claude/gates.json`, wanneer de check draait, dan is de exitcode 1 met `✗ check:app-init: .claude/gates.json ontbreekt` en wordt er geen tijdelijke map gemaakt.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Bron heeft een verwijderd maar niet gecommit bestand | overslaan bij kopiëren, zoals `kopie()` nu (`cpSync` met `force`) | n.v.t. |
| Bron is al een app (`onderhoud` ontbreekt) | overslaan, exit 0 (AC-13, OV-4) | n.v.t. |
| `node_modules` ontbreekt in de bron | stoppen vóór het kopiëren (AC-14) | n.v.t. |
| Gate in de kopie hangt | de CI-job heeft `timeout-minutes: 20`; GitHub stuurt dan een signaal, opruimen via AC-7 | n.v.t. |
| Een test gebruikt `origin/main` of de geschiedenis | `origin/main` = rename-commit, `template/main` = `basis` (stap 2) | n.v.t. |
| Een bestaande test faalt bij de eerste run na init | in dezelfde PR die test app-bestendig maken (guard zoals in `test/hooks/rolhek-leerpunt.test.ts`), met reden in de PR; niet skippen | n.v.t. |

## Raakt ook

- Nieuw: `scripts/kit/check-app-init.mjs`, script `check:app-init` in `package.json`, job `check:app-init` in `.github/workflows/ci.yml`, test `test/scripts/check-app-init.test.ts`.
- Nieuw (OV-3): `scripts/kit/proef-kopie.mjs` (`kopie()`, `script()`, opruimguard, git-env-isolatie) en test `test/scripts/proef-kopie.test.ts`.
- Gewijzigd (OV-1, verplicht): `requiredChecks` in `.claude/decisions.json`, de lijst `checks=(…)` in `scripts/github-ruleset.sh`, en de twee opsommingen van verplichte checks in `docs/nieuwe-app.md` (de alinea over `main-dicht` en de opsomming van CI-checks); na de merge past de eigenaar de ruleset toe.
- Gewijzigd (OV-3): `scripts/kit/check-new-resource.mjs` importeert `kopie()`/`script()` uit `scripts/kit/proef-kopie.mjs`, gedrag gelijk (AC-16).
- Docs: `docs/operations/agent-doorloop.md` (de alinea over de compatibiliteitsproef van `app:init`: één zin over `check:app-init`), `CHANGELOG.md`. `docs/framework.md` en `docs/dod.md` hoeven niet: §10 en "Altijd" verwijzen al naar `requiredChecks`.
- Beschermde paden (eigenaarakkoord, label `gate-wijziging` met review; `altijdVragen` voor `package.json`, `.github/**` en `.claude/decisions.json`): `scripts/**` (`scripts/kit/check-app-init.mjs`, `scripts/kit/proef-kopie.mjs`, `scripts/kit/check-new-resource.mjs`, `scripts/github-ruleset.sh`), `package.json` (sleutel `scripts`), `.github/workflows/ci.yml`, `.claude/decisions.json`, `test/**`, `docs/nieuwe-app.md`. Een eventuele aanpassing van een bestaande test is een testwijziging met reden in de PR.
- Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietests — geen migratie, functie, tabel of permissie.

## Buiten scope

- `test:db`, `ui:check`, `check:snapshot` na init (vragen de runner; eventueel later, op aanleiding).
- De check zinvol laten draaien in een app: daar is `app:init` al gedaan (AC-13).
- `app-init.mjs` zelf wijzigen.
- Een lint- of AST-regel die het lezen van `onderhoud`/`name` in tests verbiedt (deze check vangt het gedrag, niet de vorm).

## Testplan

- `test/scripts/check-app-init.test.ts` (unit, fixture-repo in `mkdtempSync`, opruimen in `afterEach`): AC-2 t/m AC-11, AC-13, AC-14, AC-18.
- `test/scripts/proef-kopie.test.ts` (unit): AC-16 (import zonder bijwerking; beide checks importeren uit de module) en AC-17. De check exporteert daarvoor een functie die bron en de te draaien scripts als parameter neemt; de fixture heeft een eigen `package.json` met nepscripts, zodat de test seconden duurt en niet de volle suite draait.
- AC-1: uitslag van `pnpm check:app-init` lokaal en de CI-job `check:app-init` op de PR-SHA (`pnpm pr:verify`).
- AC-12: een test die `ci.yml` en `package.json` leest en job-naam, triggers en commando controleert.
- AC-15: een test die `.claude/decisions.json`, `scripts/github-ruleset.sh` en `docs/nieuwe-app.md` leest en `check:app-init` in elk zoekt.
- AC-16 (eindregel): uitslag van `pnpm check:new-resource` lokaal en de CI-job `check:new-resource` op de PR-SHA.
- Negatief bewijs in de PR: een tijdelijke commit met een test die `onderhoud` uit `.claude/gates.json` eist, met de rode `check:app-init`-run als link; daarna terugdraaien.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan.

- **OV-1 ✅ besloten** — `check:app-init` wordt een verplichte check (`requiredChecks`, ruleset), zoals `check:new-resource` (eigenaar, 2026-10-28; AC-15).
- **OV-2 ✅ besloten** — Na init draaien alle snelle gates uit `snelleGates()`, geen tweede lijst (eigenaar, 2026-10-28; stap 3). App-breuk die de eerste run toont, wordt in dezelfde PR hersteld (randgeval).
- **OV-3 ✅ besloten** — `kopie()` en `script()` verhuizen naar de gedeelde module `scripts/kit/proef-kopie.mjs`, met de opruimguard en de git-env-isolatie erin; `check:new-resource` gebruikt hem ook (eigenaar, 2026-10-28; stap 7, AC-16, AC-17).
- **OV-4 ✅ besloten** — In een app slaat de check over met exit 0 (eigenaar, 2026-10-28; stap 0, AC-13).
- **OV-5 ✅ besloten** — Eigen CI-job `check:app-init`, geen stap in de job `new-resource` (eigenaar, 2026-10-28; AC-12).
