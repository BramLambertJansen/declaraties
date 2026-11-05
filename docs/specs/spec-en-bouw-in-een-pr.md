---
status: gebouwd # #377
namespace: spec-en-bouw
---

# Spec en bouw in één PR

## Doel

Gewoon volledig werk gaat met spec, tests, code, docs en `gebouwd` in één PR met één CI-lus; alleen kritiek werk krijgt eerst
een aparte besluit-PR ([ADR 0062](../adr/0062-spec-en-bouw-in-een-pr.md)).

Dit is een besluitvoorstel zonder code: de bedoelde status hierboven activeert niets vóór de merge door de eigenaar op `main`.
De implementatie volgt in een volgende PR, omdat dit werk zelf kritiek is (het wijzigt `check-document-status`).

## Rollen en wie wat ziet

- Eigenaar: beoordeelt spec en code samen in één PR en merget of sluit die. Draait na de bouw-PR het rulesetscript opnieuw.
- Hoofdsessie: kiest de route (licht, volledig in één PR, of kritiek) en noemt kort waarom.
- Architect: schrijft de spec, zoals nu. Tester: tests uit de spec, na de spec-review. Bouwer: code.
- Reviewer: spec-review vóór het bouwen bij elke spec in de PR, inclusief de toets of het werk kritiek is; daarna de gewone review.

## Datawijzigingen (met grants)

n.v.t. — geen databasewijziging, grants of migratie.

## Routes en foutcodes

n.v.t. — geen API-contract, route, app-permissie of foutcode.

## Kopieer de vorm van

Geen functioneel accountbeheerpad uit `docs/gouden-pad.md` past: dit betreft de werkstraat, zonder product-UI.

- `scripts/kit/lane.mjs` — de bestaande lane-herkenning en `migratieOvertreding` blijven de basis; de feature-lane wordt verbreed.
- `test/rails/lane-status.test.ts` — fixtures per toegestane en geweigerde overgang.

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI.
- Staten per scherm: n.v.t. — geen UI.
- Alle zichtbare tekst letterlijk: de meldingen van `document-status` volgen de bestaande vorm "geen herkende lane: <reden>".
- Focusvolgorde en toetsenbord: n.v.t. — geen UI.

## Acceptatiecriteria

Kritieke paden (AC-3) zijn: `src/core/api/auth/**`, `src/core/api/db/**`, `db/init/**`, elk pad uit `altijdVragen` in
`.claude/gates.json`, alle hookcode in `rails/hooks/**`, en de scripts die over besluiten, statussen en merges oordelen:
`scripts/kit/check-document-status.mjs`, `scripts/kit/lane.mjs`, `scripts/kit/functional-ui-status.mjs`,
`scripts/kit/status-git.mjs`, `scripts/kit/github-evidence.mjs`, `scripts/kit/diff-guard.mjs`, `scripts/kit/pr-gate-label.mjs`,
`scripts/kit/pr-verify.mjs`, `scripts/kit/check-roadmap.mjs`, `scripts/kit/roadmap-item.mjs`, `scripts/kit/document-status.mjs`,
`scripts/kit/document-decision.mjs` en `scripts/kit/gates.mjs`.

Erratum (2026-10-29): de lijst noemde eerst alleen vijf bestanden. ADR 0062 punt 2 rekent ook hooks en alle besluit- en
mergescripts tot de bewaking; de onafhankelijke review van de bouw vond dat gat en de eigenaar koos deze verbreding.

- **spec-en-bouw/AC-1** — Gegeven een PR met een nieuwe volledige spec op `goedgekeurd` en wijzigingen in `src/`, overige
  `scripts/`, `docs/` en nieuwe tests, zonder kritiek pad, wanneer `document-status` draait, dan herkent het de feature-lane en is
  het groen.
- **spec-en-bouw/AC-2** — Gegeven dezelfde PR met twee specs die een eigenaarstatus krijgen, of met een inhoudelijke wijziging van
  een goedgekeurde spec op main, wanneer `document-status` draait, dan is het groen.
- **spec-en-bouw/AC-3** — Gegeven een PR met een spec die een eigenaarstatus krijgt en een wijziging op een kritiek pad, wanneer
  `document-status` draait, dan faalt het met "geen herkende lane" en het kritieke pad in de reden.
- **spec-en-bouw/AC-4** — Gegeven een PR met een ADR die een eigenaarstatus krijgt en code, wanneer `document-status` draait, dan
  faalt het; een PR met alleen ADR's en specs blijft een besluit-PR.
- **spec-en-bouw/AC-5** — Gegeven een feature-lane-PR met een migratie buiten het owner-tabelpatroon, of een gewijzigde of
  verwijderde migratie, wanneer `document-status` draait, dan faalt het zoals nu.
- **spec-en-bouw/AC-6** — Gegeven een feature-lane-PR met een gewijzigde bestaande test, wanneer `document-status` draait, dan is
  het groen; een verwijderde bestaande test faalt.
- **spec-en-bouw/AC-7** — Gegeven een feature-lane-PR waarin de eerste commit met code of tests vóór de commit met de spec staat,
  wanneer `document-status` draait, dan faalt het met een melding over de volgorde.
- **spec-en-bouw/AC-8** — Gegeven een PR met implementatie buiten `docs/` en een spec op `gebouwd # #<n>` waarbij n het eigen
  PR-nummer is, zonder `gevalideerd:`, wanneer `document-status` draait, dan is het groen zonder statuscommit achteraf.
- **spec-en-bouw/AC-9** — Gegeven een spec op `gebouwd # #<n>` zonder SHA met een ander PR-nummer, of in een PR zonder bestand
  buiten `docs/`, wanneer `document-status` draait, dan faalt het.
- **spec-en-bouw/AC-10** — Gegeven een spec op `gebouwd # #<n>` zonder SHA in de eigen PR, wanneer daarna `git merge origin/main`
  op de branch landt, dan blijft `document-status` groen.
- **spec-en-bouw/AC-11** — Gegeven de bestaande vorm `gebouwd # #<n>; gevalideerd: <sha>` via `pnpm docs:status`, wanneer
  `document-status` draait, dan gedraagt het zich als nu.
- **spec-en-bouw/AC-12** — Gegeven `scripts/github-ruleset.sh`, wanneer het de verplichte checks opbouwt, dan staat
  `document-status` erin, en `test/scripts/github-ruleset.test.ts` houdt dat gelijk met de workflows.
- **spec-en-bouw/AC-13** — `.claude/agents/reviewer.md` eist in de modus spec-review een review bij elke spec in de PR en een
  oordeel over "kritiek"; `.github/pull_request_template.md` opent met een sectie "Spec".

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Spec hernoemd van een document met eigenaarstatus op main | Weigeren zoals nu (`verifyGeenRename`) | n.v.t. |
| Spec terug naar `voorstel` met code | Mag altijd, zoals nu | n.v.t. |
| Feature-lane met functionele UI (`scope: functionele-ui`) | Bestaande extra toets blijft (`functionalUiReason`) | n.v.t. |
| Spec op `gebouwd` zonder SHA en het roadmapvinkje in dezelfde PR | Toegestaan; `check-roadmap` accepteert het PR-nummer | n.v.t. |
| PR zonder nummer (lokaal, vóór `gh pr create`) | `gebouwd` zonder SHA faalt; eerst de PR openen | n.v.t. |

## Raakt ook

`docs/framework.md` §1 punt 8, §8 stap 1 en 6 en §10 "Besluit en status"; `docs/operations/agent-doorloop.md` (lanes en de
volgorde uit leerpunt #314); `AGENTS.md` (regel "bouwen pas bij `status: goedgekeurd`"); `docs/specs/_template.md`
(statuscommentaar); de skill `opleveren`; `CHANGELOG.md`.

## Buiten scope

- Het broncodemandaat in `.claude/decisions.json` en het rolhek op `voorReview`: ongewijzigd.
- De lichte route uit ADR 0058: ongewijzigd.
- Agent-merge (0046 punt 30): blijft uit.

## Testplan

Unit- en fixturetests in `test/rails/` (`lane.test.ts`, `lane-status.test.ts`) en `test/scripts/github-ruleset.test.ts`, per AC een getagde test.
Elke weigering (AC-3, AC-4, AC-5, AC-7, AC-9) krijgt een fixture die faalt. Volledige CI op de bouw-PR.

## Open vragen

- **OV-1 ✅ besloten** — Dependencies (`package.json`, lockfile) blijven kritiek via `altijdVragen` (eigenaar akkoord op het voorstel, 2026-10-29).
- **OV-2 ✅ besloten** — De volgordecheck (spec-commit vóór code) komt erin (idem).
- **OV-3 ✅ besloten** — Overige `src/core` buiten auth en db mag in één PR, met de bestaande bescherming (idem).
