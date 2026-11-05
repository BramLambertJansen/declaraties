---
status: gebouwd # #537
namespace: padtabel
model: opus
---

# Eén padtabel

## Doel

Hoe zwaar een pad beschermd is, staat op één plek (`paden` in `.claude/gates.json`) en wordt overal afgeleid, zonder dat één
pad losser wordt ([ADR 0079](../adr/0079-een-padtabel.md)); `.claude/decisions.json` verliest zijn dode records.

**Toets aan framework §1.** Aanleiding: vraag van de eigenaar (4 november 2026), bevinding A en B. Geen nieuwe dependency.
Raakt rolhek, lane en agent-merge (kritiek), daarom eerst deze besluit-PR.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| elke rol | leest het niveau met `feiten.mjs pad <pad>` | — |
| hoofdsessie / developer | schrijft volgens het afgeleide niveau | `gates.json` wijzigen zonder besluit-PR |
| architect, tester, reviewer, docs | schrijven binnen `schrijfrecht`, getoetst tegen de afgeleide gates | buiten `schrijfrecht` schrijven |
| eigenaar | merget de bouw-PR, beslist over de terugval | — |

## Datawijzigingen (met grants)

n.v.t.: geen migratie, tabel of policy. Wel een configvorm:
`"paden": { "<glob>": { "schrijven"?: "gate"|"voorReview"|"altijdVragen", "besluit"?: "agent"|"eigenaar"|"besluit-pr" } }`.
Vervalt: `gates`, `voorReview`, `altijdVragen`, `agentMerge.toegestaan` en `agentMerge.kritiek` (de "oude lijsten"); de rest
blijft, ook `merge`, `jsonGates` en `agentMerge.codex`/`maxRegels`/`maxBytes`.

## Routes en foutcodes

n.v.t.: geen API-route, permissie of foutcode.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Kopieer de vorm van

- `scripts/kit/agent-merge.mjs`: `leesMergeConfig` (ontbrekend of onleesbaar valt dicht) en `padReden` (oordeel per pad).
- `rails/hooks/lib/rolhek.mjs`: `loadConfig` (vorm van de afgeleide `Config`, die gelijk blijft).
- `scripts/kit/check-docs.mjs`: `agentMergeViolations` (elk getrackt pad plus `voorbeeldPad` per glob).
- `scripts/kit/feiten.mjs`: `hoofdstuk <n>` (CLI-vorm met één argument, foutmelding en exit 1).

## Hergebruik en UX

- Hergebruikt: `globMatch` (`rails/hooks/lib/rolhek.mjs`), `padReden` en `kritiekPad` (signatuur en meldingen ongewijzigd,
  ook "staat niet op agentMerge.toegestaan" en "staat op agentMerge.kritiek"), `voorbeeldPad` en `globsOverlap` (`check-docs.mjs`).
- Bestaande componenten, staten per scherm, focusvolgorde: n.v.t., geen UI.
- Alle zichtbare tekst letterlijk:
  - `feiten.mjs pad <pad>`: `<pad>: schrijven <niveau> (<bronnen>), besluit <niveau> (<bronnen>)`. Bronnen zijn de globs die
    de winnende waarde leveren, met komma's; komt de waarde uit de standaard, dan `standaard`. Vrij heet `vrij`.
  - zonder argument: `Gebruik: node scripts/kit/feiten.mjs pad <pad>` en exit 1.
  - check-docs, telkens na `.claude/gates.json: paden.<glob>: `: `altijdVragen vraagt besluit besluit-pr`,
    `schrijven <niveau> met besluit agent`, `onbekende <sleutel of waarde> <x>`, `rij zonder kolom`, `dubbele sleutel`,
    `een glob begint niet met !`, `vloer: verwacht altijdVragen en besluit-pr`; verder `.claude/gates.json: paden naast de
    oude lijsten` en `.claude/gates.json: oude vorm zonder paden; zet de lijsten om naar paden (ADR 0079)`.

### Werking (bindend)

1. **Lezer.** `rails/hooks/lib/padtabel.mjs` exporteert `padNiveau(pad, ruw)` → `{ schrijven, besluit, bronnen }` en
   `afgeleid(ruw)` → `{ gates, voorReview, altijdVragen, kritiek, agentMerge: { toegestaan, kritiek } }`. Orde:
   vrij < gate < voorReview < altijdVragen; agent < eigenaar < besluit-pr. Elke passende rij telt mee met haar waarde of de
   standaard (vrij, eigenaar).
2. **Afleiding, defensief.** `gates` = rijen met schrijven ≥ gate, behalve een sleutel die letterlijk gelijk is aan een
   bestand in `jsonGates`; `voorReview` = schrijven ≥ voorReview; `altijdVragen` = schrijven altijdVragen;
   `kritiek` = besluit-pr ∪ schrijven altijdVragen; `agentMerge.toegestaan` = rijen met besluit `agent` én schrijven vrij;
   `agentMerge.kritiek` = elke andere rij. Zo is een pad alleen agent-mergebaar als elke passende rij `agent` en vrij is.
3. **Geen terugval in de nieuwe vorm.** De afgeleide lijsten zijn er altijd; een lege lijst is `[]` en betekent leeg, zoals
   `[]` nu. De terugvallen bij een ontbrekende lijst (`voorReview ?? gates`, `altijdVragen ?? voorReview ?? gates`) gelden alleen
   voor de oude vorm. De vloer in check-docs (stap 6) voorkomt een stil lege bewaking.
4. **Oude vorm.** Zonder `paden` geeft `afgeleid` de oude lijsten door zoals ze staan (ontbrekend blijft ontbrekend), met
   `kritiek` = de bevroren lijst `OUDE_KRITIEK` (de `KRITIEK` van `lane.mjs` op 30cc352) plus `altijdVragen ?? voorReview ?? gates`.
   `paden` naast een van de oude lijsten: de lezer gooit, de aanroeper faalt dicht.
5. **Onleesbare rij.** Een rij die geen object is, een onbekende kolom of een onbekende waarde heeft, telt bij lezen als
   `{ schrijven: altijdVragen, besluit: besluit-pr }`. Een lege rij `{}` is leesbaar en telt als vrij/eigenaar. `paden` geen
   object: de lezer gooit.
6. **check-docs.** Elke lezer van ruwe lijsten in `check-docs` gaat via `afgeleid`: `gatesViolations` (CODEOWNERS = afgeleide
   gates plus `jsonGates`-bestanden), `askViolations` (Edit-`ask` = afgeleide `altijdVragen`), `schrijfrechtViolations`
   (overlap van rolglobs met de afgeleide gates), `agentMergeVorm` en `agentMergeViolations` (blijft als gedragscheck per pad:
   geen pad met schrijven ≠ vrij is agent-mergebaar). Nieuw: de samenhangregels, dubbele sleutels in de ruwe tekst
   (`JSON.parse` houdt stil de laatste), sleutels die met `!` beginnen, `{}`, en de vloer: `.github/**`, `.claude/hooks/**`,
   `.claude/settings.json`, `.claude/gates.json`, `.claude/decisions.json`, `package.json` en `pnpm-lock.yaml` hebben elk een
   eigen rij met `altijdVragen` en `besluit-pr`. De oude vorm is rood (migratiemelding); de overige regels draaien dan op
   `afgeleid` van de oude vorm. Vervallen: `voorReview` ⊆ gates en `altijdVragen` ⊆ `voorReview`. Blijven:
   `SCHRIJFRECHT_VRIJ` (architect in `docs/adr/**` en `docs/specs/**`, tester in de testpaden) en de uitzondering voor
   gates op bestandsnaam (`**/`-globs uit `testpaden` tellen niet mee bij de schrijfrechttoets).
7. **Aanroepers.** `loadConfig`, diff-guard `leesConfig`, `leesMergeConfig`, `leesAgentMerge` en `agentMergeFouten` (ook direct
   aangeroepen door `pr:merge` op de `gates.json` van main) lezen via `afgeleid` en geven dezelfde vorm terug als nu, plus
   `kritiek`. `kritiekPad(pad, config)` gebruikt `config.kritiek`, en zonder dat veld de oude regel.
8. **decisions.json.** `readRegistry` accepteert `{ version, requiredChecks }` en de oude vorm met `decisions`, en geeft
   `decisions: []` als de sleutel ontbreekt. Elke andere sleutel blijft een fout.

## Acceptatiecriteria

- **padtabel/AC-1** — Gegeven rijen `src/**` (agent) en `src/core/**` (gate), dan is `padNiveau('src/core/x.ts')` schrijven
  gate en besluit eigenaar, in beide volgordes van de rijen.
- **padtabel/AC-2** — Gegeven de fixture van 30cc352 (oude lijsten plus `OUDE_KRITIEK`) en de huidige `gates.json`, dan geldt
  voor elk pad uit `git ls-files` en elk `voorbeeldPad` van een glob uit beide: rolhekniveau nieuw ≥ oud; `kritiekPad` oud waar
  ⇒ nieuw waar; `padReden` (status `M` en `A`) oud niet null ⇒ nieuw niet null. Blijvende test: een latere PR die één pad
  losser maakt dan de fixture, is rood.
- **padtabel/AC-3** — Een rij met `altijdVragen` zonder `besluit-pr`, of schrijven ≥ gate met `agent`, geeft de melding uit
  Hergebruik en UX.
- **padtabel/AC-4** — Een onbekende kolom of waarde: check-docs rood en `padNiveau` altijdVragen/besluit-pr voor die glob.
  `{}`: check-docs rood (`rij zonder kolom`) en `padNiveau` vrij/eigenaar voor die glob.
- **padtabel/AC-5** — Gegeven als `gates.json` van main (a) de nieuwe vorm of (b) de oude vorm van 30cc352: `leesAgentMerge`
  en `agentMergeFouten` geven geen "ontbreekt of is onleesbaar", en `beoordeelMerge` gebruikt `codex`, `maxRegels` en
  `maxBytes` uit het blok. Het padoordeel (de diff-guard-job; `pr:merge` leest alleen de uitslag via `guardRedenen`):
  `agentMerge(pr, oordeel, configTekst)` uit `scripts/kit/diff-guard.mjs` is in (a) en (b) `ja` voor een PR met alleen
  `src/web/x.ts` en `nee` met `.claude/settings.json` erbij. Gegeven (c) `paden` naast `gates`: `loadConfig` en `leesConfig`
  gooien, `agentMerge` geeft `nee`, en `beoordeelMerge` geeft de lezerfout als reden, zonder crash, en merget niet.
- **padtabel/AC-6** — Gegeven de oude vorm van 30cc352, dan leveren de lezers precies de lijsten van 30cc352.
- **padtabel/AC-7** — CODEOWNERS is precies de afgeleide gates plus de `jsonGates`-bestanden; de Edit-`ask` is precies de
  afgeleide `altijdVragen`; een afwijking is rood.
- **padtabel/AC-8** — In de nieuwe vorm geeft een `schrijfrecht`-glob van architect, tester, reviewer of docs die een rij met
  schrijven ≥ gate overlapt (bv. docs: `docs/**`), de melding `schrijfrecht van <rol> (<glob>) overlapt met gate <glob>`.
- **padtabel/AC-9** — Twee keer dezelfde sleutel in `paden` in de ruwe tekst, of een sleutel `!x/**`, is rood.
- **padtabel/AC-10** — Ontbreekt de rij `.claude/gates.json` of heeft hij een lager niveau dan altijdVragen/besluit-pr, dan is
  check-docs rood (vloer); hetzelfde voor elk ander vloerpad.
- **padtabel/AC-11** — Een `gates.json` zonder `paden` (oude vorm) geeft in check-docs de migratiemelding; hooks en scripts
  lezen hem zonder fout.
- **padtabel/AC-12** — `scripts/kit/lane.mjs` bevat geen padlijst voor kritiek meer; `OUDE_KRITIEK` staat alleen in
  `padtabel.mjs`, gelijk aan de fixture.
- **padtabel/AC-13** — `feiten.mjs pad docs/adr/0001-x.md` toont `schrijven gate (docs/adr/**)` en
  `besluit besluit-pr (docs/adr/**)`; `feiten.mjs pad notities.md` toont `schrijven vrij (standaard), besluit eigenaar (standaard)`;
  zonder argument exit 1 met de gebruiksregel.
- **padtabel/AC-14** — `.claude/decisions.json` heeft precies `version` en `requiredChecks` (ongewijzigde waarden); `readRegistry`
  leest het, en ook het register van 30cc352 met zijn 26 records.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Onleesbare rij, `{}`, dubbele sleutel, oude vorm, beide vormen | zie Werking 4–6 en AC-4, AC-5, AC-9, AC-11 | n.v.t. |
| Pad in `jsonGates` (`package.json`) | geen gate voor het rolhek (sleutels bewaakt zoals nu); wel voorReview, altijdVragen, kritiek | n.v.t. |
| Pad zonder passende glob | vrij en eigenaar: geen agent-merge | n.v.t. |
| App voegt eigen rijen toe | mag, in een besluit-PR; strengste-wint maakt template-rijen niet losser; de vloer geldt ook in de app | n.v.t. |
| Oude code leest nieuwe `gates.json` of `decisions.json` uit main | oude lezers gooien of vallen op `['**']`: dicht tot rebase | n.v.t. |

## Raakt ook

- Code: `rails/hooks/lib/padtabel.mjs` (nieuw), `rails/hooks/lib/rolhek.mjs` (`loadConfig`; ook via `check-document-status.mjs`,
  `document-status.mjs`, `functional-ui-status.mjs`), `scripts/kit/lane.mjs` (`KRITIEK` weg), `scripts/kit/agent-merge.mjs`
  (`leesMergeConfig`, `leesAgentMerge`, `agentMergeFouten`), `scripts/kit/pr-merge.mjs`, `scripts/kit/diff-guard.mjs`
  (`leesConfig`), `scripts/kit/check-docs.mjs` (Werking 6), `scripts/kit/feiten.mjs` (`pad <pad>`),
  `rails/hooks/lib/task-authority.mjs` (`readRegistry`).
- Config: `.claude/gates.json` (`paden`, `$comment`), `.claude/decisions.json`, commentaar in `.github/CODEOWNERS`.
- Docs en instructies: `docs/framework.md` §8 (R-WERK-05 naar de padtabel; R-WERK-10, R-WERK-24, R-ROL-01/02) en §10 (R-REPO-01,
  R-REPO-03), `AGENTS.md` waar het "kritiek" noemt, `.claude/agents/developer.md` (stap 3), `.claude/rules/core.md` (R-REPO-03),
  `CHANGELOG.md`. Geen R-id verdwijnt.
- Herzien-markering (R-CI-05): ADR 0045 punt 1, 7 en 9; 0046 punt 27 en 28; 0062 punt 2; 0069 punt 1 (in deze besluit-PR).
- Bestaande tests: zie OV-1.

## Buiten scope

- De structurele vangnetten in code (agent-merge: `VANZELF_GELADEN`, `CONTRACT`, testpaden, omvang, permissieregels; lane:
  `BEKEND`, `INSTRUCTIES`, migratieregels; rolhek: vrije `docs/specs/`), `schrijfrecht`, `zelfladend`, `gegenereerd`.
- Een ander niveau voor een pad dan nu (alleen `docs/adr/**` wordt expliciet `besluit-pr`).

## Testplan

- Unit: AC-1, AC-3, AC-4, AC-6 t/m AC-12 en AC-14 tegen `padtabel.mjs`, de lezers, `check-docs` en `readRegistry`; AC-5 met de
  nep-API van `test/scripts/pr-merge.test.ts` (`beoordeelMerge`) en `agentMerge` uit `scripts/kit/diff-guard.mjs`; AC-13 als CLI-test van `feiten.mjs`.
- Gelijkwaardigheid (AC-2): fixture `test/rails/fixtures/padtabel/` met de `gates.json` van 30cc352 en `OUDE_KRITIEK`; de test
  blijft staan als vloer. Het precieze verschil (alleen `docs/adr/**` strenger, voor `kritiekPad`) staat eenmalig als bewijs in
  de beschrijving van de bouw-PR.
- Negatief bewijs in de PR: een tijdelijke commit die één `besluit-pr` weghaalt, met de rode AC-2 en AC-10 als link.
- **Vangnet**: (1) samenhangregels, vloer, dubbele sleutels en de dicht falende lezer nemen de spiegelregels over;
  schrijfrecht, agent-mergegedrag per pad en de oude-vormmelding blijven in check-docs (AC-8, AC-11); (2) bewijs: AC-2, AC-6
  en de bestaande tests met gelijke verwachte uitkomsten groen (OV-1); (3) meting vóór en na: `pnpm leespad` en
  `pnpm meting --trend`, uitslag in de PR; (4) terugval: één pad losser dan op 30cc352 ⇒ revert van de bouw-PR, de eigenaar
  beslist (ADR 0079 punt 9).

## Open vragen

- **OV-1 ✅ besloten** — Bestaande tests die de ruwe vorm van de echte `gates.json` lezen of samenstellen, of een vervallen
  regel toetsen, veranderen in de bouw-PR, elk met reden in de PR (R-TEST-02). De merge van deze besluit-PR is het
  eigenaarakkoord voor precies deze lijst (vastgesteld op 30cc352). Elke afwijking ervan (een test erbij, een andere groep, een
  andere verwachte uitkomst) krijgt vóór de wijziging apart eigenaarakkoord (R-TEST-02).
  - **(i) Alleen lezen of samenstellen omgezet, verwachte uitkomst gelijk:** in `test/rails/`: `spec-en-bouw.test.ts`
    (`altijdVragen()` uit de ruwe tekst), `agent-merge.test.ts` (`aangepast` met oude lijsten), `agent-merge-bytegrens.test.ts`
    (`gatesMet`), `agent-merge-zonder-codex.test.ts` (`metGrens`, `aangepast`, het blok met `toegestaan`/`kritiek` op de echte
    tekst), `lane.test.ts` (`voorReview: undefined` wordt een fixture in oude vorm, anders test hij niets meer),
    `check-docs-voorreview.test.ts` en `check-docs-onderhoud.test.ts` (de tests op de ruwe lijsten van de echte
    `gates.json`), `krimp-op-normen.test.ts` (AC-4 splitst de ruwe tekst op `"voorReview"`; wordt: het pad staat in de
    afgeleide gates en `voorReview`); in `test/hooks/`: `rolhek-onderhoud.test.ts` (`kaal`/`withKeys`), `rolhek-voorreview.test.ts` ("voorReview
    ontbreekt" wordt een fixture in oude vorm), `vertrouwde-basis-anker.test.ts` (`VOOR`), `authority-git.test.ts`
    (`replaceAll('".github/**",')` haalt de rij uit `paden`).
  - **(ii) Regel vervalt of nieuwe uitkomst:** `test/rails/check-docs-voorreview.test.ts` (`docs:spiegel:voorreview-gates:*`:
    vervalt), `test/rails/check-docs-onderhoud.test.ts` (`altijdVragen` ⊆ `voorReview`: vervalt), `test/rails/check-docs-gates.test.ts`
    en `test/rails/check-docs.test.ts` (fixture in oude vorm: de verwachte sleutels krijgen de migratiemelding erbij),
    `test/scripts/app-init-template.test.ts` (`toHaveProperty('gates')` wordt `toHaveProperty('paden')`).
  - **Blijft ongewijzigd:** fixtures in oude vorm voor de lezers en tests die alleen `loadConfig`/`leesConfig` op de echte
    `gates.json` gebruiken; de afgeleide vorm is gelijk.
- **OV-2 ✅ besloten** — Strengste-wint in plaats van eerste-treffer (ADR 0079, Alternatieven).
- **OV-3 ✅ besloten (ADR 0079 punt 6)** — De oude vorm is rood in check-docs; anders blijft een app na een template-merge
  stil op twee vormen staan. Hooks en scripts accepteren hem wel, voor de overgang en oude commits.
