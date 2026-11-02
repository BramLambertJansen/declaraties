---
status: goedgekeurd
namespace: leesbudget
---

# Leesbudget per laag

## Doel

Agents lezen per taak alleen wat nodig is, en de template kan doorgroeien zonder dat grenzen bevriezen of documenten ongemerkt uitdijen ([ADR 0064](../adr/0064-leesbudget-per-laag.md) punt 1 tot en met 4 en 7).

## Rollen en wie wat ziet

n.v.t. — rails en instructies voor agents en de eigenaar; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/check-docs.mjs` — `budgetViolations` (sleutel met waarde, ratchet op overschrijdingen)
- `scripts/kit/leespad.mjs` — `SCENARIOS` en `leespad()`

## Hergebruik en UX

n.v.t. — geen UI. Uitvoer is tekst van `check-docs`, `feiten.mjs` en `pnpm leespad`.

## Acceptatiecriteria

PR rails:

- **leesbudget/AC-1** — `check-docs` geeft per hoofdstuk van `docs/framework.md` (kop `## <n>.` met `<n>` een nummer, ook §13 en verder, met optionele letter zoals `11a` of `8a`) boven 12 KB een overtreding met sleutel `docs:docs/framework.md#<n>:budget:<bytes>`; het totaal van het bestand is geen grens. De ankercontrole (regel 8) laat hoofdstukken boven §12 toe; de ankers §1–§12 blijven verplicht.
- **leesbudget/AC-2** — Vanaf 85 % van de grenzen van `AGENTS.md` (9 KB, 100 regels) en van een hoofdstuk (drempel is `ceil(0,85 × grens)`, de grens zelf is geen overtreding) meldt `check-docs` "let op: <eenheid> op <n> % van de grens; splits of verplaats" zonder overtreding en zonder andere exitcode; de melding staat in de uitvoer van `pnpm ratchet` en van `pnpm leespad`. `scripts/kit/ratchet.mjs` krijgt daarvoor een kanaal voor meldingen. Spec- en ADR-grenzen blijven zoals in compacte-kennisbasis-rails/AC-9.
- **leesbudget/AC-3** — `pnpm leespad` telt van `docs/framework.md` hoofdstuk 8 en zijn letter-subhoofdstukken plus de tekst vóór de eerste `## `-kop, toont per scenario het streefdoel (nieuwe-feature ≤ 25 KB) en de waarschuwingsdrempel (56, 28 en 16 KB) met "let op" bij overschrijding, en toont het totaal van `framework.md` en de regels van `CLAUDE.md`, rules en skills tegenover hun norm (50, 60 en 200 regels, R-DOC-01) als meting, met "let op" bij overschrijding; geen overtreding.
- **leesbudget/AC-4** — `node scripts/kit/feiten.mjs hoofdstuk <n>` drukt de tekst vóór de eerste `## `-kop en dat hoofdstuk af, van zijn kop tot de volgende `## `-kop, bij `hoofdstuk 8` ook 8a, 8b enzovoort (gelijk aan wat `pnpm leespad` telt); een onbekend hoofdstuk geeft een foutmelding en exit 1.
- **leesbudget/AC-5** — Groeiproef: vanuit een hoofdstuk van 10 KB geven 1 KB groei en een nieuw hoofdstuk §13 geen overtreding, ook als het totaal boven 40 KB komt; een hoofdstuk boven 12 KB is rood.

PR instructies:

- **leesbudget/AC-6** — Framework §9 bevat de regels uit ADR 0064 punt 1 tot en met 4 en 7 (zonder de bewaartermijn: een roadmap-item) als R-id's en R-TEST-02 de regel over teksttests; `.claude/rules/*` volgen letterlijk.
- **leesbudget/AC-7** — `AGENTS.md`, `CLAUDE.md`, de agents en de spec-skill verwijzen voor het regelboek naar `feiten.mjs hoofdstuk` in plaats van het hele bestand.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Tekst vóór de eerste `## `-kop | telt bij geen hoofdstukgrens; gaat mee met `hoofdstuk` en `leespad` | n.v.t. |
| Hoofdstuk `11a` of `8a` | eigen eenheid; `leespad` telt `8a` bij §8 | n.v.t. |
| Bestaande overschrijding | in de baseline; groei rood, krimp vraagt `ratchet:update` | n.v.t. |
| Precies de drempel of precies de grens | drempel: waarschuwing; gelijk aan de grens: geen overtreding | n.v.t. |

## Raakt ook

`test/rails/kennisbasis-budget.test.ts` (de fixtures met één framework.md boven 40 KB gaan over naar een hoofdstuk; geen gevallen weg), `test/rails/meting-kerncijfers-leespad.test.ts`, `scripts/kit/ratchet.mjs`, spec compacte-kennisbasis-rails AC-9. De bytegrenzen in `test/rails/review-checklists.test.ts` blijven staan (ADR 0064 punt 6).

## Buiten scope

`docs/operations/agent-doorloop.md` opsplitsen (restpunt), het regelboek in losse bestanden, rode checks op rules, skills, operations-docs of leespad-scenario's.

## Testplan

Tabeltests in `test/rails/leesbudget.test.ts` voor AC-1 tot en met AC-5 met fixtures; docs-tests (structuur) voor AC-6 en AC-7. De rails-PR noemt de huidige omvang per hoofdstuk en de baseline-ingangen die ontstaan.

## Open vragen

- **OV-1 ✅ besloten** — Grenzen en streefwaarden zoals ADR 0064; herijking bij elke release.
