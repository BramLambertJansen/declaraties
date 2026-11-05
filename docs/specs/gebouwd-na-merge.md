---
status: gebouwd # #380
namespace: gebouwd-na-merge
---

# Gebouwd na de merge

## Doel

Een spec waarvan de implementatie al gemerged is, ook na een squash-merge, kan met `pnpm docs:status … gebouwd --pr <n>`
alsnog naar `gebouwd`, met hetzelfde bewijs als nu.

Dit voert de laatste zin van [ADR 0062](../adr/0062-spec-en-bouw-in-een-pr.md) punt 4 uit ("de bestaande vorm met PR en SHA
blijft voor een spec waarvan de implementatie al op main staat"). Die route werkt nu niet: `canRecordBuilt`
(`rails/hooks/lib/built-evidence.mjs:52`) eist dat de lokale HEAD en branch gelijk zijn aan de head en branch van PR n. Na een
squash-merge kan dat niet meer, en de statuscommit zou ook een eigen PR nodig hebben. Daarom staan `spec-en-bouw-in-een-pr`,
`klassenrail` en `typografie-en-layout` nog op `goedgekeurd` (leerpunt #314). ADR 0046 punt 10 noemt nog "de PR open is";
deze besluit-PR legt met een herzieningsregel in ADR 0062 vast dat punt 4 daar ook de gemergde PR onder verstaat.

Dit is een besluitvoorstel zonder code; de bouw volgt in een volgende PR, omdat dit werk kritiek is (ADR 0062 punt 2:
`rails/hooks/**`, `document-status` en `check-document-status`).

## Rollen en wie wat ziet

- Eigenaar: merget deze spec en later de bouw-PR; draait daarna `pnpm docs:status` of laat de hoofdsessie de status-PR maken.
- Hoofdsessie of architect: schrijft de statusregel via `pnpm docs:status`, zoals nu. De rolhekregels voor `gebouwd` met SHA
  blijven ongewijzigd.
- CI (`document-status`): toetst dezelfde regel opnieuw met hetzelfde bewijs.

## Datawijzigingen (met grants)

n.v.t. — geen databasewijziging, grants of migratie.

## Routes en foutcodes

n.v.t. — geen API-contract, route, app-permissie of foutcode.

## Kopieer de vorm van

Geen functioneel accountbeheerpad uit `docs/gouden-pad.md` past: dit betreft de werkstraat, zonder product-UI.

- `rails/hooks/lib/built-evidence.mjs` — `canRecordBuilt` en `checkedCommit` blijven de enige plek die over bouwbewijs oordeelt;
  de gemergde route komt er als tweede tak naast de bestaande.
- `test/rails/` — fixtures per toegestane en geweigerde situatie, zoals bij de bestaande route.

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI.
- Staten per scherm: n.v.t. — geen UI.
- Alle zichtbare tekst letterlijk: de bestaande foutmelding van `docs:status` blijft voor de open route. De gemergde route
  noemt bij een weigering welke voorwaarde faalt, in de vorm "Gebouwd na de merge vereist <voorwaarde>", met als voorwaarden:
  "de mergecommit van PR #<n> in HEAD", "de spec ongewijzigd en goedgekeurd in de mergecommit" en "alle verplichte
  GitHub Actions-checks groen op de head van PR #<n>", "een wijziging buiten docs/ in PR #<n> op een pad dat de spec noemt"
  en "alleen statusregels en het eigen roadmapvinkje in deze PR".
- Focusvolgorde en toetsenbord: n.v.t. — geen UI.

## Acceptatiecriteria

Begrippen: de *mergecommit* is `merge_commit_sha` van PR n volgens GitHub; de *PR-head* is de head-SHA van PR n; de
*verplichte checks* zijn `requiredChecks` uit `.claude/decisions.json` in de eerste ouder van de mergecommit (main vlak vóór de
merge), zodat een check die later is toegevoegd niet met terugwerkende kracht ontbreekt. De *bouwpaden* zijn de bestanden die de
diff van die eerste ouder naar de mergecommit wijzigt, buiten `docs/` en `CHANGELOG.md`, en die de spec in de mergecommit
letterlijk tussen backticks noemt. De statusregel heeft de bestaande vorm `status: gebouwd # #<n>; gevalideerd: <PR-head>`. De
route volgt uit GitHub: een gemergde PR n gaat altijd via de gemergde route, een open PR n via de bestaande.

- **gebouwd-na-merge/AC-1** — Gegeven een spec op `goedgekeurd` op main en een gemergde PR n (squash of mergecommit) uit dezelfde
  repository, wanneer `pnpm docs:status <spec> gebouwd --pr <n>` draait op een branch van main die de mergecommit bevat, dan
  schrijft het `status: gebouwd # #<n>; gevalideerd: <PR-head>`, als de spec in de mergecommit `goedgekeurd` is met dezelfde
  digest als nu, er minstens één bouwpad is en alle verplichte checks groen zijn op de PR-head.
- **gebouwd-na-merge/AC-2** — Gegeven een PR die tegenover haar basis alleen statusregels wijzigt, en met `--roadmap` het
  vinkje van het item van die spec, wanneer `document-status` draait, dan is het groen; ook na een `git merge origin/main` op die
  branch. Wijzigt dezelfde PR nog een ander bestand of andere tekst, dan faalt het.
- **gebouwd-na-merge/AC-3** — Gegeven een gemergde PR n waarvan de mergecommit geen voorouder is van HEAD, of een mergecommit met
  twee ouders waarvan de tweede niet de PR-head is, wanneer `docs:status` of `document-status` draait, dan faalt het.
- **gebouwd-na-merge/AC-4** — Gegeven een spec die in de mergecommit ontbreekt, een andere status dan `goedgekeurd` heeft, of een
  andere digest heeft dan nu (bijvoorbeeld een erratum na de merge), wanneer `docs:status` of `document-status` draait, dan faalt
  het.
- **gebouwd-na-merge/AC-5** — Gegeven een verplichte check uit de eerste ouder van de mergecommit die op de PR-head ontbreekt, niet
  `success` is of van een andere app komt, wanneer `docs:status` of `document-status` draait, dan faalt het; een check die pas na
  de merge aan `requiredChecks` is toegevoegd, telt niet mee.
- **gebouwd-na-merge/AC-6** — Gegeven een statusregel met een `gevalideerd:`-SHA die niet de PR-head van een gemergde PR n is,
  wanneer `document-status` draait, dan faalt het.
- **gebouwd-na-merge/AC-7** — Gegeven een PR n die gesloten is zonder merge, of uit een fork komt, wanneer `docs:status` of
  `document-status` draait, dan faalt het.
- **gebouwd-na-merge/AC-8** — Gegeven een open PR n, wanneer `docs:status` of `document-status` draait, dan gedraagt het zich als
  nu (lokale HEAD en branch gelijk aan die van PR n, alleen statusregels daarna). Een gemergde PR n gaat nooit via die tak, ook
  niet als de lokale HEAD de PR-head is.
- **gebouwd-na-merge/AC-9** — Gegeven de gemergde route met `--roadmap`, wanneer `docs:status` draait, dan tikt het het item van de
  spec af zoals nu.
- **gebouwd-na-merge/AC-10** — Gegeven een gemergde PR n zonder bouwpad (bijvoorbeeld de besluit-PR die de spec goedkeurde, of
  een PR die alleen bestanden wijzigt die de spec niet noemt), wanneer `docs:status` of `document-status` draait, dan faalt het.
- **gebouwd-na-merge/AC-11** — Gegeven een eerste ouder van de mergecommit zonder leesbaar `.claude/decisions.json` of met een
  lege `requiredChecks`, wanneer `docs:status` of `document-status` draait, dan faalt het.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Erratum op de spec na de merge van de bouw | Weigeren (AC-4); de eigenaar beslist of de bouw het erratum dekt | n.v.t. |
| Spec kwam pas na PR n op main | Weigeren (AC-4): de spec ontbreekt in de mergecommit | n.v.t. |
| Besluit-PR zonder code als PR n | Weigeren (AC-10): geen bouwpad | n.v.t. |
| Andere code-PR die toevallig een genoemd pad raakt | Niet machinaal te onderscheiden; de eigenaar ziet `#<n>` in de status-PR en merget of sluit | n.v.t. |
| PR n heeft `decisions.json` zelf gewijzigd | De eerste ouder van de mergecommit telt, niet de PR-head | n.v.t. |
| Rebase-merge | Komt niet voor: de ruleset staat alleen merge en squash toe (framework §10, "Versiebeheer, CI en release") | n.v.t. |
| Spec met `scope: functionele-ui` | De bestaande UI-akkoordtoets geldt ongewijzigd | n.v.t. |
| Spec al op `gebouwd # #<n>` zonder SHA | Ongewijzigd; die route (ADR 0062 punt 4) raakt dit niet | n.v.t. |

## Raakt ook

- Bouw: `rails/hooks/lib/built-evidence.mjs`, `scripts/kit/github-evidence.mjs` (`merge_commit_sha`),
  `scripts/kit/document-status.mjs`, `scripts/kit/check-document-status.mjs`, met tests in `test/rails/`.
- Docs: `docs/operations/agent-doorloop.md` (de route na de merge), `docs/framework.md` §10 "Besluit en status",
  `CHANGELOG.md`.
- Vervolg: na de bouw een status-PR die `spec-en-bouw-in-een-pr` (#377), `klassenrail` (#349) en `typografie-en-layout` (#347)
  via deze route op `gebouwd` zet. Daarmee is leerpunt #314 af.

## Buiten scope

- De vorm `gebouwd # #<n>` zonder SHA in de eigen PR (ADR 0062 punt 4): ongewijzigd.
- Automatisch `gebouwd` na de merge: een docs-stap na de merge blijft handwerk (framework §8); dit maakt hem alleen mogelijk.
- Het rolhek en het broncodemandaat: ongewijzigd.

## Testplan

Per AC een getagde test in `test/rails/`: per weigering (AC-3 tot en met AC-7, AC-10, AC-11) en per toegestane route (AC-1, AC-2,
AC-8, AC-9). GitHub wordt niet aangeroepen: `canRecordBuilt` krijgt het bewijs ingevoegd, en een tijdelijke git-fixture met een
squash- en een mergecommit levert mergecommit, ouders, digest, bouwpaden en `requiredChecks`. Volledige CI op de bouw-PR.

## Open vragen

Geen.
