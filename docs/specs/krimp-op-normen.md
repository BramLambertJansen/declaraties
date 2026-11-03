---
status: goedgekeurd
namespace: krimp-op-normen
---

# Krimpcontrole op normen

## Doel

Geen norm verdwijnt ongemerkt uit het regelboek, ook niet in een kleine PR of met een inventaris die leeg te vullen is ([ADR 0067](../adr/0067-krimp-op-normen.md)). Aanleiding: bevindingen L1, L2 en L3 van de review van main op 2 november 2026. Deze spec vervangt [leesbudget](leesbudget.md)/AC-6; de rest van leesbudget blijft gelden.

## Rollen en wie wat ziet

n.v.t. — `check-docs` en de reviewer-agent; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/leesbudget.mjs` — `krimpViolations` en `regelProblemen` (de huidige krimpcontrole)
- `scripts/kit/check-docs.mjs` — overtredingen die nooit in de baseline komen

## Hergebruik en UX

n.v.t. — geen UI. Een overtreding noemt per R-id of document wat ontbreekt of fout is en verwijst naar `docs/normen-vervallen.md`.

## Acceptatiecriteria

- **krimp-op-normen/AC-1** — Een R-id is gedefinieerd in `docs/framework.md` als een regel buiten een codeblok en buiten een HTML-commentaar exact begint met `- **R-<GROEP>-<n>**` of `- **R-<GROEP>-<n><letter>**` (één patroon, gedeeld door `check-docs` en de krimpcontrole). Een regel die op een definitie lijkt (`- **R-` of `* **R-`) maar niet aan het patroon voldoet, of een R-id die twee keer gedefinieerd is, maakt `check-docs` rood; een definitie beslaat één regel, en een ingesprongen vervolgregel direct onder een definitie is ook rood. Elke R-id die op `git merge-base origin/main HEAD` gedefinieerd is en in de werkmap niet meer, staat in `docs/normen-vervallen.md` onder `## docs/framework.md` als lijstregel `R-id → R-id` of `R-id → geschrapt: <reden>`. Anders is `check-docs` rood, ongeacht hoeveel bytes het regelboek krimpt, met per ontbrekende R-id een overtreding.
- **krimp-op-normen/AC-2** — Een doel is geldig als het `geschrapt: <reden>` is met een reden van minstens drie woorden, of een R-id die in de werkmap gedefinieerd is, of een R-id die zelf links op de lijst staat en via die keten op een gedefinieerde R-id of een geschrapte uitkomt (`R-DOC-07 → R-DOC-12` en later `R-DOC-12 → geschrapt: …`). Een overtreding is: een ongeldig doel; een R-id links die in de werkmap nog gedefinieerd is; dezelfde R-id twee keer links; een kringverwijzing.
- **krimp-op-normen/AC-3** — Krimpt `docs/framework.md`, `AGENTS.md`, `CLAUDE.md`, een bestand in `.claude/rules/` of `docs/dod.md` meer dan 20 % en minstens 1 KB ten opzichte van de merge-base, dan is `check-docs` rood, tenzij de diff in `docs/normen-vervallen.md` onder `## <pad>` minstens één nieuwe lijstregel `<oude norm> → R-id` of `<oude norm> → geschrapt: <reden>` toevoegt, met de doelregels van AC-2; de kop mag al bestaan. Bij `docs/framework.md` tellen de regels uit AC-1 hiervoor mee. Een kop `Normeninventaris` in een ander bestand telt niet meer.
- **krimp-op-normen/AC-4** — `docs/normen-vervallen.md` begint met een uitleg: alles vóór de eerste `## `-kop, zonder lijstregels, codeblokken of HTML-commentaar. Daarna bevat hij alleen koppen `## <pad>`, lijstregels `- <oud> → <doel>` en lege regels; een codeblok (```` ``` ```` of `~~~`), een HTML-commentaar, een ingesprongen regel of andere tekst is een overtreding. Hij krimpt nooit: een regel of kop die op de merge-base stond en nu ontbreekt of anders luidt, is een overtreding. Het pad staat in `.claude/gates.json` in `gates` en `voorReview`, net als `docs/framework.md`, en in `.github/CODEOWNERS`.
- **krimp-op-normen/AC-5** — Overtredingen uit AC-1 tot en met AC-4 komen nooit in de baseline. In CI is een ontbrekende merge-base of `origin/main` rood; lokaal meldt `check-docs` dan dat de krimpcontrole niet draaide, zonder andere exitcode. Met een actuele `origin/main` zijn lokaal en CI gelijk.
- **krimp-op-normen/AC-6** — `check-docs` meldt (zonder overtreding) elke R-id waarvan de definitieregel in `docs/framework.md` ten opzichte van de merge-base veranderde; dat is een extra signaal. `docs/operations/review-checklists.md` en `.claude/agents/reviewer.md` vragen, als de diff een definitieregel in `docs/framework.md` wijzigt of `docs/normen-vervallen.md` raakt: is de gewijzigde norm niet uitgehold, staat een verplaatste norm inhoudelijk bij de nieuwe R-id, is de reden van schrappen aanvaardbaar, en mist er geen norm die alleen in de tekst (zonder R-id) stond. Het PR-sjabloon vraagt onder Bewijs welke R-id's vervielen of veranderden. De bytegrenzen van `test/rails/review-checklists.test.ts` blijven gelden.
- **krimp-op-normen/AC-7** — R-DOC-07 beschrijft AC-1 tot en met AC-5 in plaats van de huidige inventaris en noemt 0067; leesbudget/AC-8 en de randgevallen van leesbudget over krimp verwijzen naar deze spec.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Eén R-id geschrapt in een PR die het regelboek laat groeien | rood zonder regel op de lijst (AC-1) | n.v.t. |
| R-id hernummerd (`R-DOC-07` wordt `R-DOC-12`), later `R-DOC-12` geschrapt | `R-DOC-07 → R-DOC-12`, daarna `R-DOC-12 → geschrapt: …`; de oude regel blijft geldig via de keten (AC-2) | n.v.t. |
| Twee normen samengevoegd | beide oude R-id's naar de nieuwe | n.v.t. |
| `alles → geschrapt: .`, een regel voor een R-id die nog bestaat, een reden van één woord | rood (AC-2) | n.v.t. |
| Kop `Normeninventaris` in een kladje, of een lijstregel in een codeblok of commentaar | telt niet; in `normen-vervallen.md` rood (AC-3, AC-4) | n.v.t. |
| Definitie in een HTML-commentaar of codeblok in `framework.md` | telt niet als gedefinieerd (AC-1) | n.v.t. |
| `* **R-DOC-07**` of `- **R-DOC-07 **` | rood: lijkt op een definitie maar voldoet niet (AC-1) | n.v.t. |
| Tekst van een R-id uitgehold, de R-id blijft | melding (AC-6); de reviewer toetst het | n.v.t. |
| `docs/framework.md` verwijderd of hernoemd | elke R-id is verdwenen; elk staat op de lijst | n.v.t. |
| R-id verdwijnt en komt in dezelfde PR elders in `framework.md` terug | geen verdwenen R-id; wel een melding als de tekst veranderde (AC-6) | n.v.t. |
| Tweede krimp van `AGENTS.md` in een latere PR | nieuwe regels onder de bestaande kop `## AGENTS.md` (AC-3) | n.v.t. |
| Ondiepe checkout in CI | rood (AC-5) | n.v.t. |

## Raakt ook

`scripts/kit/leesbudget.mjs` (`krimpViolations`, `inventarissen`, `regelProblemen`), `scripts/kit/check-docs.mjs` (de R-id-controle en `docsKrimp` delen het patroon van AC-1), `test/rails/leesbudget.test.ts` (krimpgevallen van leesbudget/AC-6 worden gevallen van deze spec; geen gevallen weg zonder vervanging, met reden in de PR), `test/rails/leesbudget-instructies.test.ts` (leesbudget/AC-8 noemt nu "Normeninventaris" in een R-DOC-regel; wijzigt met reden in de PR), `.claude/gates.json` en `.github/CODEOWNERS` (beschermd pad), `docs/framework.md` R-DOC-07, `docs/specs/leesbudget.md`, `.github/pull_request_template.md`, `docs/operations/review-checklists.md`, `.claude/agents/reviewer.md`.

## Buiten scope

Krimp in stappen onder 20 % bij de documenten van AC-3 (blijft het bestaande roadmap-item); R-id's die alleen in andere documenten genoemd worden; een historische lijst van normen die vóór deze spec vervielen.

## Testplan

Tabeltests in `test/rails/krimp-op-normen.test.ts` met fixtures voor AC-1 tot en met AC-5, de melding van AC-6 en elk randgeval; docs-tests (structuur) voor de checklist, de reviewer-agent en het PR-sjabloon (AC-6) en voor AC-7. Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

Geen. De keuze voor een vaste lijst in plaats van de PR-tekst staat in ADR 0067 (alternatieven).
