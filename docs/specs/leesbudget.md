---
status: goedgekeurd
namespace: leesbudget
---

# Leesbudget per laag

## Doel

Agents lezen per taak alleen wat nodig is, en de template kan doorgroeien zonder dat grenzen bevriezen, documenten ongemerkt uitdijen of normen ongemerkt wegvallen ([ADR 0064](../adr/0064-leesbudget-per-laag.md) punt 2, 4 en 7; [ADR 0065](../adr/0065-grenzen-als-meting.md)).

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

n.v.t. — geen UI. Uitvoer is tekst van `check-docs`, `feiten.mjs`, `pnpm leespad` en `pnpm meting`.

## Acceptatiecriteria

PR rails:

- **leesbudget/AC-1** — `check-docs` geeft alleen voor `AGENTS.md` (9 KB, 100 regels) en `CLAUDE.md` (50 regels) een overtreding; een bestaande overschrijding staat in de baseline (ratchet). Voor een hoofdstuk van `docs/framework.md` (kop `## <n>.` met `<n>` een nummer, ook §13 en verder, met optionele letter zoals `11a` of `8a`), het totaal van `framework.md`, een spec en een ADR geeft `check-docs` geen overtreding meer; hun budget-ingangen verdwijnen uit `.kit/baseline.json`. De ankercontrole (regel 8) laat hoofdstukken boven §12 toe; de ankers §1–§12 blijven verplicht.
- **leesbudget/AC-2** — Vanaf 85 % van een grens uit AC-1 (drempel `ceil(0,85 × grens)`; de grens zelf is geen overtreding) meldt `check-docs` "let op: <eenheid> op <n> % van de grens; verplaats naar een lagere laag" zonder overtreding en zonder andere exitcode; de melding staat in de uitvoer van `pnpm ratchet` en `pnpm leespad`. `scripts/kit/ratchet.mjs` krijgt daarvoor een kanaal voor meldingen.
- **leesbudget/AC-3** — `pnpm leespad` telt van `docs/framework.md` hoofdstuk 8 en zijn letter-subhoofdstukken plus de tekst vóór de eerste `## `-kop, toont per scenario het streefdoel (nieuwe-feature ≤ 25 KB) en de waarschuwingsdrempel (56, 28 en 16 KB), en toont als meting tegenover hun streefwaarde: elk hoofdstuk (12 KB), het totaal van `framework.md` (40 KB), de grootste specs (10 KB) en ADR's (6 KB), de regels van rules en skills (60 en 200 regels) en de omvang van operations-docs. Boven een streefwaarde staat "let op"; nooit een overtreding of andere exitcode.
- **leesbudget/AC-4** — `node scripts/kit/feiten.mjs hoofdstuk <n>` drukt de tekst vóór de eerste `## `-kop en dat hoofdstuk af, van zijn kop tot de volgende `## `-kop, bij `hoofdstuk 8` ook 8a, 8b enzovoort (gelijk aan wat `pnpm leespad` telt); een onbekend hoofdstuk geeft een foutmelding en exit 1.
- **leesbudget/AC-5** — Groeiproef: een hoofdstuk van 20 KB, een framework van 60 KB, een nieuw §13, een spec van 50 KB en een ADR van 9 KB geven geen overtreding, wel "let op" in `leespad`; `AGENTS.md` boven 9 KB of 100 regels en `CLAUDE.md` boven 50 regels zijn rood.
- **leesbudget/AC-6** — Krimp: een diff waarin een bindend document (`docs/framework.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/rules/*`, `docs/dod.md`) meer dan 20 % in bytes krimpt ten opzichte van de basis, is rood in `check-docs` tenzij de PR-tekst of een bestand in de diff een kop `Normeninventaris` bevat met per vervallen of verplaatste norm een regel `oud → R-id` of `oud → geschrapt: <reden>`. De reviewer toetst die lijst.
- **leesbudget/AC-7** — `pnpm meting --pr-tabel` meldt "let op: <maat> steeg" als het gemiddelde aantal reviewrondes, CI-rode runs of Codex-bevindingen over de laatste tien gemergde PR's hoger ligt dan over de tien daarvoor; minder dan twintig PR's geeft "te weinig data". Geen exitcode.

PR instructies:

- **leesbudget/AC-8** — Framework §9 bevat de regels uit ADR 0065 en ADR 0064 punt 2, 4 en 7 als R-id's (zonder de bewaartermijn van metingen: een roadmap-item), R-DOC-01 noemt streefwaarden in plaats van grenzen, en R-TEST-02 de regel over teksttests; `.claude/rules/*` volgen letterlijk. De skill `opleveren` noemt een "let op" uit AC-7 in de oplevering.
- **leesbudget/AC-9** — `AGENTS.md`, `CLAUDE.md`, de agents en de spec-skill verwijzen voor het regelboek naar `feiten.mjs hoofdstuk` in plaats van het hele bestand.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Tekst vóór de eerste `## `-kop | gaat mee met `hoofdstuk` en `leespad` | n.v.t. |
| Hoofdstuk `11a` of `8a` | eigen eenheid in de meting; `leespad` telt `8a` bij §8 | n.v.t. |
| Bestaande overschrijding `AGENTS.md`/`CLAUDE.md` | in de baseline; groei rood, krimp vraagt `ratchet:update` | n.v.t. |
| Precies de drempel of precies de grens | drempel: melding; gelijk aan de grens: geen overtreding | n.v.t. |
| Nieuw bindend document of verplaatsing naar een ander bindend document | krimp telt per bestand; verplaatste normen staan als `oud → R-id` in de inventaris | n.v.t. |
| Minder dan twintig gemergde PR's | `meting --pr-tabel`: "te weinig data" | n.v.t. |

## Raakt ook

`test/rails/kennisbasis-budget.test.ts` (gevallen voor framework, spec en ADR worden meldingsgevallen; geen gevallen weg), `test/rails/meting-kerncijfers-leespad.test.ts`, `scripts/kit/ratchet.mjs`, `scripts/kit/meting.mjs`, `.kit/baseline.json`, spec compacte-kennisbasis-rails AC-9. De bytegrenzen in `test/rails/review-checklists.test.ts` blijven staan (ADR 0064 punt 6).

## Buiten scope

`docs/operations/agent-doorloop.md` opsplitsen (restpunt), het regelboek in losse bestanden, rode checks op hoofdstuk, regelboek, specs, ADR's, rules, skills, operations-docs of leespad-scenario's (ADR 0065).

## Testplan

Tabeltests in `test/rails/leesbudget.test.ts` voor AC-1 tot en met AC-7 met fixtures (AC-7 met een vaste PR-tabel); docs-tests (structuur) voor AC-8 en AC-9. De rails-PR noemt de huidige omvang per hoofdstuk en de baseline-ingangen die verdwijnen.

## Open vragen

- **OV-1 ✅ besloten** — Harde grenzen alleen op `AGENTS.md` en `CLAUDE.md`, de rest streefwaarden (ADR 0065); herijking bij het afsluiten van een roadmap-fase.
- **OV-2 ✅ besloten** — Kwaliteitsdrempel over tien PR's tegenover de tien daarvoor (eigenaar, 2026-11-02).
