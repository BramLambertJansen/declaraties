---
status: goedgekeurd
namespace: specplicht
sjabloon: mini
---

# Specplicht afdwingen: verplichte job `specplicht`

## Doel

De verplichte job `specplicht` in `guard.yml` wordt rood als een PR een nieuwe migratie, een nieuwe `defineRoute`-identiteit,
een nieuwe permissiesleutel of een nieuw paginabestand onder `src/web/routes/**` bevat zonder spec, zodat de volledige
straat van framework §8 en ADR 0058 punt 2 ("Architect en passende spec") niet meer alleen een afspraak is.

**Toets aan framework §1 (P1, punt 2 en 5).** Aanleiding: de post-merge-review van 2026-10-26 toonde dat specplicht voor
nieuwe routes en pagina's alleen in proza staat (doorgeglipte fout). Dit is handhaving van ADR 0058 punt 2; geen nieuw
besluit en geen nieuw ADR. ADR 0045 punt 17, 19 en 20 blijven ongewijzigd: `diff-guard` blijft optioneel. ADR 0058 punt 6
("geen documentcontrole per fix") blijft gelden: een lichte fix raakt geen van de vier categorieën.

## Besluiten

- **2026-10-26, eigenaar** — Direct blokkerend. Een spec telt via de PR-diff of via de regel `Spec:` in de PR-body, met status `goedgekeurd` of `gebouwd` op `main`.
- **2026-10-26, eigenaar** — Een aparte verplichte job `specplicht` in `.github/workflows/guard.yml`, uit hetzelfde script (`scripts/kit/diff-guard.mjs`). `diff-guard` blijft optioneel conform ADR 0045; `requiredChecks` krijgt `specplicht`, niet `diff-guard`.
- **2026-10-26, eigenaar** — Een spec in de diff telt ongeacht status en onderwerp; `document-status` bewaakt de status en de reviewer de relevantie.
- **2026-10-26, eigenaar** — Een wijziging alleen in de rolverdeling van een bestaande permissiesleutel is vrij; het risico-overzicht van `diff-guard` meldt haar.
- **2026-10-26, eigenaar** — De regel `Spec: docs/specs/<naam>.md` komt in `.github/pull_request_template.md`.
- **2026-10-26, architect** — Een hernoemd route- of paginabestand (status R) is vrij, een kopie (C) niet. De route-identiteit vergelijkt al met het oude pad (`teLezen` zet `van`), dus een verplaatste route is niet nieuw; pagina's volgen dat. Git telt een hernoeming pas bij ≥ 50 % gelijkenis (`--find-renames`); een herschreven bestand wordt D + A en is dus specplichtig. Een kopie telt in `teLezen` ook als nieuw.

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| auteur (agent of mens) | de rode uitslag en de reden in de job `specplicht` en de step summary | spec toevoegen of `Spec:` in de body zetten; de body wijzigen start de job opnieuw |
| reviewer | de reden in `specplicht`, en de categorie "Pagina's" in het risico-overzicht van `diff-guard` | toetsen of de genoemde spec past (de job toetst alleen bestaan en status) |
| eigenaar | `specplicht` als verplichte check | mergen; de ruleset op GitHub zelf activeren |
| CI (`guard.yml`, `pull_request_target`) | git-objecten van de PR, de PR-body via de API, `main` als `refs/guard/base` | niets uit de PR uitvoeren |

## Routes en foutcodes

n.v.t. — geen API-route, permissie of foutcode; de wijziging zit in `scripts/kit/diff-guard.mjs` en `guard.yml`.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — | — | — | — |

## Gedrag

**Specplichtige categorieën** (alleen tekstuele analyse, zoals nu in `risico(pr)`):

1. **Migraties:** elk item van `risico(pr).migraties` (nieuw, gewijzigd of hernoemd onder `db/migrations/`). Gewijzigd en
   hernoemd weigert `check:migrations` al; hier tellen ze mee zodat de job dicht faalt.
2. **Routes:** elk item van `risico(pr).routes` (nieuwe `METHOD path`-identiteit per bestand, of een nieuwe aanroep met
   method/path "niet letterlijk (via contract)").
3. **Permissies:** een sleutel in de na-versie van `src/shared/permissions.ts` die in de voor-versie ontbreekt
   (`permissieSleutels`). Een gewijzigde rolverdeling van een bestaande sleutel telt niet.
4. **Pagina's (nieuw):** een wijziging met status `A` of `C` op een pad onder `src/web/routes/` dat eindigt op `.ts` of
   `.tsx`, behalve `routeTree.gen.ts` en paden die passen op `testpaden` uit `.claude/gates.json`. Komt als vijfde
   categorie in het type `Risico` (`paginas`) en in het risico-overzicht van `diff-guard`.

**Een spec telt** als één van beide waar is:

- **In de diff:** een wijziging met status `A`, `M`, `R` (doelpad) of `C` op een pad dat past op
  `^docs/specs/[^_/][^/]*\.md$` (dezelfde regex als `statusViolations` in `scripts/kit/check-docs.mjs`), ongeacht status.
- **In de body:** de body bevat minstens één regel `Spec: docs/specs/<naam>.md` (regex per regel, na `\r\n` → `\n`:
  `^Spec: \x60?(docs/specs/[a-z0-9]+(?:-[a-z0-9]+)*\.md)\x60?\s*$`, met of zonder backticks), en elke genoemde spec is op
  `refs/guard/base` (de actuele `main` die de job al ophaalt) een regulier bestand (`regularGitFile` uit
  `scripts/kit/status-git.mjs`) waarvan `documentInfo` uit `rails/hooks/lib/document-state.mjs` status `goedgekeurd` of
  `gebouwd` geeft. Eén ongeldige `Spec:`-regel maakt de body-route ongeldig.

**Dicht falen:** is de body niet leesbaar (HTTP-fout, `null`, geen string, veld ontbreekt in `Pr`), dan geldt de
body-route als afwezig. Een spec op `main` die `documentInfo` niet kan lezen, telt als niet bestaand.

**Uitslag.** Een nieuwe pure, geëxporteerde functie `beoordeelSpecplicht(pr)` geeft `{ uitslag: 'groen' | 'rood', redenen,
items }`. Rood als er minstens één specplichtig item is en geen spec telt. Er is geen `overgang`: auteur, label en reviews
spelen geen rol. Zonder specplichtig item wordt de body niet gelezen voor de uitslag. `beoordeel` (de gate-regel van
`diff-guard`) verandert niet, behalve dat het risico-overzicht `paginas` toont.

**Het script.** `node scripts/kit/diff-guard.mjs` blijft de `diff-guard`-job; `node scripts/kit/diff-guard.mjs --specplicht`
draait alleen `beoordeelSpecplicht`, schrijft een eigen samenvatting (`## specplicht: <uitslag>`) naar
`GITHUB_STEP_SUMMARY`, geeft bij rood een `::error title=specplicht::`-annotatie en exitcode 1. Een onbekend argument
geeft exitcode 1. In deze modus haalt het script geen labels of reviews op.

**PR-body lezen.** De payload (`github.event.pull_request.body`) is bij een Re-run verouderd en is in een `run:`-regel een
injectiepunt. Daarom:

- de `specplicht`-modus haalt de body bij elke run op via `GET /repos/{REPO}/pulls/{PR_NUMBER}` met `GITHUB_TOKEN`
  (`pull-requests: read` staat er al); geen nieuwe permissie;
- `guard.yml` krijgt `edited` in `on.pull_request_target.types`, zodat het aanpassen van de body de jobs opnieuw start;
- `github.event.pull_request.body` komt nergens in `guard.yml` voor;
- `Pr` krijgt twee optionele velden: `body: string | null` en `specsOpMain: Record<string, string | null>` (tekst op
  `refs/guard/base` per in de body genoemd pad; `null` als het geen regulier bestand is). `beoordeelSpecplicht` blijft puur.

**Hardening van de job.** `specplicht` is een kopie van de `diff-guard`-job met dezelfde `env` (`BASE_REPO`, `BASE_REF`,
`DEFAULT_REF`, `BASE_SHA`, `HEAD_SHA`, `PR_NUMBER`, `AUTHOR`, `HEAD_REF` uit de payload, nooit in een `run:`-regel
geïnterpoleerd) en dezelfde stappen in dezelfde volgorde: (1) base-repo is de eigen repo, base-ref is de default branch, beide
SHA's 40 tekens hex; (2) checkout van `base.sha` met `persist-credentials: false` en `fetch-depth: 0`; (3) de PR alleen als
git-objecten ophalen (`refs/guard/head`, `refs/guard/base`), head gelijk aan `HEAD_SHA`, `BASE_SHA` voorouder van
`refs/guard/base`; (4) dezelfde gepinde `jdx/mise-action` met alleen `node`; (5) `node scripts/kit/diff-guard.mjs --specplicht`
met `GITHUB_TOKEN` en `REPO`. Workflowbrede `permissions` (`contents: read`, `pull-requests: read`) en `concurrency` gelden
ook voor deze job; `timeout-minutes: 5`. Geen checkout, install of uitvoering van PR-code.

**Verplichte check.** `specplicht` komt in `requiredChecks` in `.claude/decisions.json` en in `checks=(…)` van
`scripts/github-ruleset.sh`, en in `OPDRACHT` van `test/scripts/github-ruleset.test.ts`. `NIET_VERPLICHT` blijft
`['diff-guard', 'document-status']`. Het commentaar bovenin `guard.yml` noemt de nieuwe job. De ruleset op GitHub activeert
de eigenaar zelf.

## Kopieer de vorm van

n.v.t. voor `docs/gouden-pad.md` (geen resource); railwerk volgt de bestaande guard:

- `scripts/kit/diff-guard.mjs` — `risico`, `beoordeel`, `samenvatting`, `teLezen`/`leesPr` (git-objecten, `api()`); uitbreiden, geen tweede script
- `.github/workflows/guard.yml` — de job `diff-guard` als vorm voor de job `specplicht`
- `test/rails/diff-guard.test.ts` — tabeltest `$naam → $uitslag` met `pr()`-fixture
- `test/rails/diff-guard-risico.test.ts` — voor/na-tekstfixtures voor routes en permissies
- `rails/hooks/lib/document-state.mjs` — `documentInfo` voor de status
- `scripts/kit/status-git.mjs` — `regularGitFile`
- `test/scripts/guard-workflow.test.ts` — workflow-asserties

## Acceptatiecriteria

"Uitslag" is die van `beoordeelSpecplicht`; "specreden" is de tekst uit "Hergebruik en UX".

- **specplicht/AC-1** — Gegeven een nieuwe `db/migrations/<ts>_x.sql` (status A) zonder spec, dan is de uitslag `rood` met de specreden en het pad in `items`.
- **specplicht/AC-2** — Gegeven een nieuw bestand met `defineRoute({ method: 'GET', path: '/x', … })` zonder spec, dan `rood`.
- **specplicht/AC-3** — Gegeven een nieuwe `defineRoute(contract, …)` zonder letterlijke method/path, zonder spec, dan `rood`.
- **specplicht/AC-4** — Gegeven een nieuwe sleutel in `src/shared/permissions.ts` zonder spec, dan `rood`.
- **specplicht/AC-5** — Gegeven een nieuw `src/web/routes/_app/x.tsx` (status A, en apart status C) zonder spec, dan `rood`, en de `diff-guard`-samenvatting noemt het pad onder "Pagina's".
- **specplicht/AC-6** — Gegeven een nieuwe route plus een toegevoegd of gewijzigd `docs/specs/x.md` (ook met `status: voorstel`), dan `groen`.
- **specplicht/AC-7** — Gegeven een nieuwe route en body `Spec: docs/specs/x.md` met `status: goedgekeurd` op main (ook met backticks en `\r\n`), dan `groen`.
- **specplicht/AC-8** — Idem met `status: gebouwd`, dan `groen`.
- **specplicht/AC-9** — Idem met `status: voorstel` (en apart `vervallen`), dan `rood` met de statusreden.
- **specplicht/AC-10** — Idem met een pad dat op main niet bestaat, geen regulier bestand is of geen leesbare frontmatter heeft, dan `rood` met de bestaatreden.
- **specplicht/AC-11** — Gegeven twee `Spec:`-regels, één goedgekeurd en één niet-bestaand, dan `rood`.
- **specplicht/AC-12** — Gegeven body `null`, of geen `body`-veld in `Pr`, met een nieuwe route, dan `rood` met de specreden.
- **specplicht/AC-13** — Gegeven body `Spec: docs/specs/_template.md` of `Spec: docs/specs/../x.md`, dan telt de regel niet en is de uitslag bij een nieuwe route `rood`.
- **specplicht/AC-14** — Gegeven een bestaande route met andere handler, permission of schema (zelfde `METHOD path`), of een gewijzigde rolverdeling van een bestaande permissiesleutel, zonder spec, dan `groen`.
- **specplicht/AC-15** — Gegeven een hernoemd route- of paginabestand (status R, routes ongewijzigd), dan `groen`.
- **specplicht/AC-16** — Gegeven een gewijzigd of nieuw `src/web/routeTree.gen.ts`, een nieuw `src/web/routes/x.test.tsx` of een nieuw `src/web/routes/.gitkeep`, zonder spec, dan `groen`.
- **specplicht/AC-17** — Gegeven een auteur die goedkeurder is, met label `gate-wijziging` en een goedkeuring op de head, en een nieuwe route zonder spec, dan `rood`; en `beoordeel` geeft voor dezelfde PR dezelfde uitslag als vóór deze wijziging.
- **specplicht/AC-18** — Gegeven geen specplichtig item en body `Spec: docs/specs/bestaat-niet.md`, dan `groen`.
- **specplicht/AC-19** — `guard.yml` heeft een job met `name: specplicht` die `node scripts/kit/diff-guard.mjs --specplicht` draait, met dezelfde `env`-sleutels, controlestappen, checkout-instellingen (`ref` = `base.sha`, `persist-credentials: false`), fetch- en ancestor-controle en gepinde actions als de job `diff-guard`; `types` bevat `edited`; `github.event.pull_request.body` komt in het bestand niet voor.
- **specplicht/AC-20** — `requiredChecks` in `.claude/decisions.json` en de payload van `scripts/github-ruleset.sh` bevatten `specplicht` en niet `diff-guard`; `NIET_VERPLICHT` is `['diff-guard', 'document-status']`.
- **specplicht/AC-21** — `diff-guard.mjs` met een onbekend argument eindigt met exitcode ≠ 0.

## Hergebruik en UX

n.v.t. voor schermen — geen UI. Zichtbare tekst is CI-uitvoer (redenen, `::error`-annotatie en step summary):

- Bestaande componenten: n.v.t. — geen UI.
- Staten per scherm: n.v.t. — de job is `groen` of `rood`.
- Alle zichtbare tekst letterlijk:
  - Kop van de samenvatting: `## specplicht: groen` of `## specplicht: rood`
  - Specreden: `specplicht: nieuwe migratie, route, permissie of pagina zonder spec (framework §8, ADR 0058); voeg docs/specs/<naam>.md toe aan de PR of zet "Spec: docs/specs/<naam>.md" in de PR-body (status goedgekeurd of gebouwd op main)`
  - Statusreden: `specplicht: <pad> heeft op main status <status>; alleen goedgekeurd of gebouwd telt`
  - Bestaatreden: `specplicht: <pad> bestaat niet op main of is geen leesbare spec`
  - Groen zonder specplichtig item: `geen nieuwe migratie, route, permissie of pagina`
  - Kop in het risico-overzicht van `diff-guard`: `Pagina's (nieuw bestand onder src/web/routes)`
  - PR-sjabloon: `Spec: docs/specs/<naam>.md` (regel voor de auteur; laat staan of verwijder als er geen specplicht is)
- Focusvolgorde en toetsenbord: n.v.t. — geen UI.

## Randgevallen

- **`pnpm new:resource`** (`scripts/kit/new-resource.mjs`, fase `skelet` → `bouw`): fase 1 maakt `docs/specs/<naam>.md`; die
  PR bevat alleen de spec (besluit-PR, ADR 0046 punt 2 en 5) en geen specplichtig item. Fase 2 weigert bij `voorstel` en
  bouwt pas bij `goedgekeurd`, in een volgende PR (skill `spec`, stap 8). Die bouw-PR noemt de spec met `Spec:`. Dat past op
  de huidige flow.
- **`check:new-resource`** (`ci.yml`, job `check:new-resource`) genereert in een tijdelijke kopie en draait daar
  `gate:fast`; hij maakt geen PR en draait geen guard. Hij wordt hierdoor niet rood.
- **Renovate-PR's** raken geen specplichtige categorie en blijven groen op `specplicht`; `diff-guard` blijft optioneel.
- **Feature-lane met mini-spec** (spec en code in één PR) valt onder "spec in de diff".
- **De placeholder in het PR-sjabloon** (`<naam>`) past niet op de regex en telt dus niet als spec.

## Raakt ook

- `scripts/kit/diff-guard.mjs`, `.github/workflows/guard.yml`, `.github/pull_request_template.md`, `.claude/decisions.json`, `scripts/github-ruleset.sh` — allemaal gate-paden; rail-PR met reviewer-agent en eigenaar.
- Tests: `test/rails/diff-guard.test.ts`, `test/rails/diff-guard-risico.test.ts`, `test/scripts/guard-workflow.test.ts`, `test/scripts/github-ruleset.test.ts` (`OPDRACHT`: bestaande test, gewijzigd gedrag, met reden in de PR).
- `docs/framework.md` §8, stap 1: "afgedwongen door de job `specplicht`"; `CHANGELOG.md` (Unreleased): upgradenotitie dat een app-PR met een nieuwe migratie, route, permissie of pagina een spec of `Spec:`-regel nodig heeft en dat de ruleset `specplicht` als verplichte check krijgt.
- n.v.t.: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietest per rol — geen migratie, route of permissie in deze PR.

## Open vragen

- **OV-1 ✅ besloten** — Aparte verplichte job `specplicht`; `diff-guard` blijft optioneel (eigenaar, 2026-10-26; zie Besluiten).
- **OV-2 ✅ besloten** — Een spec in de diff telt ongeacht status (eigenaar, 2026-10-26).
- **OV-3 ✅ besloten** — Een wijziging alleen in de rolverdeling is vrij (eigenaar, 2026-10-26).
- **OV-4 ✅ besloten** — `Spec:` komt in `.github/pull_request_template.md` (eigenaar, 2026-10-26).
- **OV-5** — De skill `opleveren` (beschermd) zet nog geen `Spec:`-regel in de PR-body. Aanbeveling: in een volgende PR toevoegen; het PR-sjabloon dekt het tot dan.
