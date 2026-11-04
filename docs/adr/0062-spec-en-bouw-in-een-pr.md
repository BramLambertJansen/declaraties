# 0062 — Spec en bouw in één PR

Status: geaccepteerd

Herzien: 2026-10-30 (#379): punt 4 geldt ook na de merge; voor een gemergde PR vervalt "de PR open is" uit 0046 punt 10 en
volgt het bouwbewijs uit de mergecommit ([spec](../specs/gebouwd-na-merge.md)).
Herzien: 2026-10-30 (#385): in punt 2 vervallen "gate-label" en "of mandaat"
([0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md)).
Herzien: 2026-11-04 (#535): gewijzigd door [0079](0079-een-padtabel.md) punt 2, de kritieke paden komen uit de kolom
`besluit: besluit-pr` van de padtabel in `.claude/gates.json`, niet meer uit een lijst in `scripts/kit/lane.mjs`

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 5, 10, 12, 14 en 15. Drempel: A3 (de lanetoets in
`check-document-status` laat meer toe) en A4 (afspraken uit een geaccepteerd ADR). De status is de bedoelde acceptatie in dit
voorstel; alleen de eigenaar maakt het besluit met zijn merge geldend. Uitwerking: [spec](../specs/spec-en-bouw-in-een-pr.md).

## Context

De eigenaar wil spec en bouw in één PR (opdracht 2026-10-29): de aparte spec-PR en de statuscommit achteraf houden de flow op.
Gemeten wrijving (P1, P6): elk volledig stuk templatewerk kostte twee PR's met elk een eigen CI-lus, bijvoorbeeld #362 en #346
(app-init-proef) en #371 en #372 (sandbox). Daarna kost `gebouwd` nog een extra CI-ronde op een statuscommit, die bovendien
rood wordt na een `git merge origin/main` (leerpunt #314).

De oorzaak is de smalle feature-lane uit 0046 punt 14: alleen één nieuwe mini-spec, en geen `src/core`, geen pad uit
`voorReview` en geen gewijzigde bestaande test. Vrijwel al het templatewerk valt erbuiten. Het vroege stopmoment dat de aparte
spec-PR gaf, is voor gewoon werk weinig waard: een afgekeurde PR kost alleen agenttijd, en de eigenaar beoordeelt spec en code
toch samen bij de merge.

## Besluit

1. **Eén PR is de standaard.** Een of meer specs met een eigenaarstatus (nieuw, volledig of mini, of een inhoudelijke wijziging
   van een goedgekeurde spec) mogen samen met code, tests en docs in één PR. De merge door de eigenaar blijft het besluit
   (0046 punt 1); afwijzen blijft de PR sluiten.
2. **Kritiek blijft in een aparte besluit-PR vóór het bouwen:**
   - elk ADR (nieuw, herschreven, vervangen of vervallen);
   - auth en gegevensisolatie: `src/core/api/auth/`, `src/core/api/db/`, `db/init/`, een migratie buiten het owner-tabelpatroon
     uit `new:resource`, en een gewijzigde of verwijderde migratie;
   - de bewaking zelf: de paden in `altijdVragen` (CI, hooks, Claude-instellingen, het gate- en besluitregister,
     dependencies) en de scripts die over besluiten en merges oordelen.
   Bij twijfel geldt kritiek. Voor overige `src/core`, `scripts/`, `rails/` en instructies blijven CODEOWNERS,
   diff-guard, rolhek en eigenaarreview gelden; een spec in de PR geeft geen extra schrijfrechten.
3. **Borging van de spec in dezelfde PR.** Elke spec in de PR krijgt vóór het bouwen een spec-review door een onafhankelijke
   reviewer, die ook de keuze "niet kritiek" toetst. De spec staat in de PR in een commit vóór de eerste commit met code of
   tests (`document-status` controleert de volgorde). De PR-beschrijving opent met wat er besloten wordt en de uitslag van de
   spec-review.
4. **`gebouwd` in dezelfde PR.** Een spec mag in de PR die haar implementatie bevat direct naar `gebouwd` met alleen het eigen
   PR-nummer, zonder gevalideerde SHA en zonder statuscommit achteraf. Bouwbewijs is dan de ruleset op main, die de verplichte
   checks op de gemergde head eist; `document-status` wordt daarom een verplichte check in die ruleset. De bestaande vorm met
   PR en SHA (0046 punt 10) blijft voor een spec waarvan de implementatie al op main staat; bij een gemergde PR toetst
   `docs:status` dan de mergecommit in plaats van een open PR.
5. 0046 punt 5 (inhoud van een goedgekeurde spec nooit met code), punt 12 (framework-lane voor alles in `src/core`, rails, gates
   of agentconfiguratie), punt 14 (bereik van de feature-lane) en punt 15 (herkenning) gelden zoals hierboven gewijzigd. De
   besluit-PR uit 0046 blijft bestaan voor punt 2 en voor wie een besluit los wil voorleggen.

## Alternatieven

- **Alles bij het oude laten:** twee PR's en een statuscommit per stuk werk; de gemeten wrijving blijft.
- **Ook kritiek werk in één PR:** verliest het stopmoment vóór werk aan auth, RLS of de bewaking zelf, waar een fout in het
  ontwerp het duurst is en de checks die het werk bewaken zelf veranderen.
- **Spec-review alleen door de eigenaar in de sessie:** vraagt weer een wachtmoment; de reviewer doet het zonder wachten en de
  eigenaar ziet de uitslag in de PR.
- **`gebouwd` automatisch na de merge:** een docs-stap na de merge bestaat bewust niet (framework §8).

## Gevolgen

Gewoon volledig werk is één PR met één CI-lus. Leerpunt #314 vervalt voor nieuw werk. De ruleset krijgt één extra verplichte
check; de eigenaar draait het rulesetscript na de merge opnieuw. Deze wijziging is zelf kritiek en volgt daarom nog de oude
route: dit besluit en de spec eerst, de bouw in een volgende PR. Meting (P6): het aantal PR's per spec tot de eindstatus op main,
vóór (basislijn twee PR's en een statuscommit) en na de eerste vijf specs onder dit besluit.
