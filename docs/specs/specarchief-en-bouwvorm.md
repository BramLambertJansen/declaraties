---
status: goedgekeurd
namespace: specarchief-en-bouwvorm
model: opus
modelreden: wijzigt de guard over besluiten en bouwbewijs, het rolhek en `docs:status` (ADR 0046 punt 18)
---

# Specarchief, levende spec en één vorm voor gebouwd

## Doel

Vervallen specs naar `docs/specs/archief/`, één levende spec per mechanisme, en één vorm `gebouwd # #<PR>`
([ADR 0080](../adr/0080-specarchief-en-bouwvorm.md)).

**Toets aan framework §1.** Aanleiding: "Framework versimpelen", bevinding C en D. Geen dependency. Kritiek (guard, rolhek),
dus eerst deze besluit-PR.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| architect | werkt de levende spec bij met nieuwe AC's | een AC-id weghalen; in het archief schrijven |
| hoofdsessie | `pnpm docs:status`, `git mv` naar het archief | een SHA in een statusregel |
| eigenaar | merget de drie PR's | — |

## Datawijzigingen (met grants)

n.v.t.: geen migratie.

## Routes en foutcodes

n.v.t.: geen API-route.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Koppeling

n.v.t.: geen externe dienst; GitHub lezen zoals nu.

## Kopieer de vorm van

- `scripts/kit/check-document-status.mjs`: `verhuisBron` en `verifyVerhuizingen` (het ADR-archief).
- `rails/hooks/lib/rolhek.mjs`: `archiefViaBash`; `rails/hooks/lib/effect.mjs`: `verhuizingen`.
- `scripts/kit/check-docs.mjs`: `linkDoelen`.
- `rails/hooks/lib/built-evidence.mjs`: `mergedRefusal`.

## Hergebruik en UX

- Hergebruikt: `documentKind`, `isArchief`, `beslisOvergang`, `builtReference` (leest beide vormen), `mergedEvidence`.
  Componenten, staten, focus: n.v.t., geen UI.
- Alle zichtbare tekst letterlijk:
  - rolhek: "het archief is onwijzigbaar; via Bash alleen `git mv docs/adr/<naam> docs/adr/archief/` of
    `git mv docs/specs/<naam> docs/specs/archief/` met dezelfde naam (framework §10, R-CI-06)"
  - check-document-status: `<pad>: alleen een vervallen spec verhuist naar het archief (status <s>)`;
    `<spec>: <ns>/AC-n verdwijnt; een AC houdt zijn id (ADR 0080)`;
    `<spec>: een spec met eigenaarstatus verlaat docs/specs/ alleen via vervallen naar het archief (ADR 0080)`;
    `<spec>: gebouwd # #<n> met een AC (nog niet gebouwd) (ADR 0080)`;
    `<spec>: gebouwd # #<n> is niet deze PR en PR #<n> is niet gemerged (ADR 0080)`.
  - check-docs: `<spec>: statusregel met gevalideerd: <sha>; schrijf status: gebouwd # #<PR> (ADR 0080)`;
    `<spec>: de naam staat ook in docs/specs/archief/; een naam komt niet terug (ADR 0080)`.
  - check-roadmap: `<spec>: naar gebouwd zonder bouwbewijs; zet de status met pnpm docs:status (status: gebouwd # #<PR>)`.
  - docs:status, open PR: `Gebouwd vereist de juiste geopende PR op deze branch en code buiten docs/`.

### Werking (bindend)

1. **Archief** zoals het ADR-archief: onwijzigbaar (`a4`); binnen alleen via byte-gelijke rename van een op main vervallen
   spec (AC-1 t/m AC-3). Links: vanuit het archief alsof in `docs/specs/`; een doel `docs/specs/<naam>.md` lost vanuit
   `docs/adr/**` en `docs/specs/**` ook op naar het archief; elders het letterlijke pad.
2. **Levende spec** (AC-7, AC-8). `beslisOvergang`: `gebouwd` → `gebouwd`, zelfde verwijzing, andere digest is `besluit`.
   Een nieuwe AC: `- **<ns>/AC-n** (nog niet gebouwd)`, alleen op een id dat niet op main staat; regel 6 van `check-docs` slaat
   alleen die over. De digest telt zonder markeringen: alleen weghalen is geen inhoudswijziging. In `check-document-status`
   (tegen de stand op main): een id `<ns>/AC-n` (`ns` = namespace, anders de naam) verdwijnt bij geen overgang. Een verhuizing
   gaat alleen naar `docs/specs/archief/` (`docs/template/specs/` uit `verhuisBron`); een andere rename is rood.
3. **`docs:status`** schrijft alleen `status: gebouwd # #N`. Open PR N op deze branch, code buiten `docs/`, spec
   goedgekeurd op main of UI-akkoord; geen check-runs. Gemergd: `mergedRefusal`, head uit GitHub.
4. **Guard.** Zonder SHA: N is deze PR → eigen route zoals nu; anders → gemergde route, head uit GitHub. Met SHA: zoals nu. Al
   `gebouwd` op main: alleen `; gevalideerd: <sha>` weghalen bij gelijke digest is `vrij`; elke andere wijziging van de
   verwijzing geeft in `beslisOvergang` `gebouwd` (nieuw bewijs), ook bij gelijke digest.
5. **Omzetten.** De bouw-PR haalt `; gevalideerd: <sha>` weg uit elke statusregel in `docs/specs/` (17 op 781fcd6).

## Acceptatiecriteria

- **specarchief-en-bouwvorm/AC-1** — `documentKind` geeft `spec` en `isArchief` waar voor `docs/specs/archief/a.md`; niet voor
  `docs/specs/archief/_a.md` of `docs/specs/archief/x/a.md`.
- **specarchief-en-bouwvorm/AC-2** — Byte-gelijke `git mv` van een op main vervallen spec naar `docs/specs/archief/`, alleen
  met `docs/`-wijzigingen: groen. Rood: andere status op main; inhoud anders; andere naam; terug; nieuw, gewijzigd of
  verwijderd bestand in het archief; een bestand buiten `docs/` ernaast.
- **specarchief-en-bouwvorm/AC-3** — Het rolhek weigert elke rol elke schrijfactie in `docs/specs/archief/` met de melding
  uit Hergebruik en UX, behalve `git mv docs/specs/<naam> docs/specs/archief/` (zelfde naam); de toets op effect ook.
- **specarchief-en-bouwvorm/AC-4** — Een link `../adr/<adr>.md` in een gearchiveerde spec en een link `a.md` in een gebouwde
  spec naar een gearchiveerde `a.md`: check-docs groen. Een link naar die `a.md` vanuit `docs/operations/` of `README.md`: rood.
- **specarchief-en-bouwvorm/AC-5** — `docs/specs/a.md` en `docs/specs/archief/a.md` samen: check-docs rood.
- **specarchief-en-bouwvorm/AC-6** — `feiten.mjs specs` en `pnpm leespad` tellen geen bestand in het archief, ook niet in
  een geneste map eronder (bewaakt tegen terugval; nu al groen).
- **specarchief-en-bouwvorm/AC-7** — Besluit-PR: gebouwde spec blijft `gebouwd` met een nieuwe AC `(nog niet gebouwd)`
  zonder test: groen. Rood: dezelfde AC zonder markering; de markering in een PR met code; `gebouwd # #<deze PR>` met een
  markering; een markering op een id dat al op main staat; gebouwde spec naar `goedgekeurd`. Groen: een kritieke bouw-PR haalt
  de markering weg, voegt de test toe en zet `gebouwd # #<deze PR>`.
- **specarchief-en-bouwvorm/AC-8** — Spec met eigenaarstatus op main, rood: `<ns>/AC-3` weg; naar `voorstel` of `vervallen`
  zonder `AC-3`; andere namespace; bestand verwijderd; rename binnen `docs/specs/` of naar `docs/template/specs/`. Groen: naar
  `vervallen` met gelijke inhoud; verhuizing (AC-2).
- **specarchief-en-bouwvorm/AC-9** — `docs:status <spec> gebouwd --pr N`, PR N open op de branch met code: schrijft
  `status: gebouwd # #N`, ook als er geen check-runs zijn. Rood en niets geschreven: PR N gesloten of op een andere branch,
  of geen code buiten `docs/` en `CHANGELOG.md`.
- **specarchief-en-bouwvorm/AC-10** — Kernscenario: spec goedgekeurd op main, PR N met code gemerged (squash en merge),
  checks groen op de head. `docs:status` schrijft `status: gebouwd # #N`; de guard op de status-PR (ander of geen `PR_NUMBER`)
  is groen. Rood: een check rood; geen bouwpad; spec in de mergecommit anders; een ander bestand; PR N niet gemerged.
- **specarchief-en-bouwvorm/AC-11** — `gebouwd # #N; gevalideerd: <sha>` in een fixture: de guard toetst zoals nu (groen met
  bewijs, rood zonder); check-docs geeft er in `docs/specs/` de melding uit Hergebruik en UX voor.
- **specarchief-en-bouwvorm/AC-12** — Op main `gebouwd # #N; gevalideerd: <sha>`: de PR maakt er `gebouwd # #N` van → groen
  zonder GitHub-aanroep. Rood: `gebouwd # #M` zonder bewijs voor M; SHA weg en inhoud gewijzigd.
- **specarchief-en-bouwvorm/AC-13** — `changeStatus` schrijft `status: gebouwd # #N` en gooit zonder geldig N; geen spec in
  `docs/specs/` heeft `gevalideerd:` in de statusregel.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Gemarkeerde AC op main, bouw-PR nog niet gemerged | spec blijft `gebouwd`; alleen die AC zonder dekking | n.v.t. |
| App met eigen SHA-regels | check-docs rood; omzetten mag zonder bewijs (Werking 4) | n.v.t. |
| `docs/template/specs/` | blijft herkend (ADR 0063 punt 4), geen archief | n.v.t. |

## Raakt ook

- Code in `rails/hooks/lib/`: `document-state.mjs`, `built-evidence.mjs`, `rolhek.mjs`, `effect.mjs`; in `scripts/kit/`:
  `document-status.mjs`, `check-document-status.mjs`, `check-docs.mjs`, `check-roadmap.mjs`, `gates.mjs` (tekst).
- `scripts/kit/status-git.mjs` (`mergedEvidence`, als de gemergde route zonder SHA dat vraagt).
- Spec `compacte-kennisbasis-rails` AC-5: het deel "verhuizing naar `docs/template/specs/`" vervalt (bijwerken in de bouw-PR).
- Docs: framework R-WERK-07 (levende spec), R-WERK-08 (één vorm; de stap terug naar `voorstel` houdt de AC-id's), R-CI-06
  (`docs/specs/archief/`), R-ROL-08, R-DOC-10 (noemt `docs/template/specs/` als voorbeeld); `docs/dod.md` (twee vormen),
  `docs/specs/_template.md`, `docs/operations/agent-doorloop.md`, `CHANGELOG.md`; de 17 statusregels.
- Herzien-markering (R-CI-05): ADR 0046, 0054, 0062, 0063 (deze PR).
- Verhuis-PR daarna: `agent-merge.md`, `taakmandaat-frameworkwerk.md`, `taakmandaat-vervolg.md`.

## Buiten scope

- Vervolg: specs van agent-merge en rolhek samenvoegen (na de rolhek-krimp, ADR 0071); de SHA-controle voor een open PR weg.

## Testplan

- Unit: AC-1, AC-6, AC-13. Fixture-repo's met de gh-stub van `test/hooks/follow-up-kit.ts`: AC-2, AC-7 t/m AC-12;
  rolhek: AC-3; check-docs: AC-4, AC-5, AC-11.
- Negatief bewijs: tijdelijk geen checkcontrole in de gemergde route, met de rode AC-10 als link.
- **Vangnet**: (1) spec-vóór-code, AC-dekking en bouwbewijs blijven; AC-id-behoud, markering, archief-guard en
  toetsen van een gewijzigde verwijzing komen erbij; (2) bewijs: AC-10, AC-11 en de tests uit OV-1 (i) met gelijke uitkomst; (3) meting vóór en
  na met `pnpm leespad` en `pnpm meting --trend`; vóór (781fcd6): specs 67, 42 boven 10 KB; na de verhuis-PR verwacht 65 en
  40; (4) terugval: ADR 0080 punt 8, revert van de bouw-PR, de eigenaar beslist.

## Open vragen

- **OV-1 ✅ besloten** — Deze tests veranderen in de bouw-PR, elk met reden (R-TEST-02); de merge van deze besluit-PR is het
  eigenaarakkoord voor precies deze lijst (781fcd6). Elke afwijking vraagt vooraf apart akkoord.
  - **(i) Pad of tekst, uitkomst gelijk:** `test/docs/agent-merge-docs.test.ts` (leest `docs/specs/agent-merge.md`: wordt
    het pad dat bestaat, archief of oud); `test/rails/mandate-follow-up-docs.test.ts` (idem `taakmandaat-frameworkwerk.md`,
    en de letterlijke teksten van `_template.md`, `gates.mjs` en `agent-doorloop.md`);
    `test/rails/check-roadmap.test.ts` en `test/rails/check-roadmap-bewijsvorm.test.ts` (melding zonder SHA);
    `test/rails/gebouwd-na-merge-git.test.ts` AC-1, eerste test van AC-8 en AC-9 (verwachte regel `gebouwd # #<n>`).
  - **(ii) Nieuwe uitkomst:** `test/hooks/authority.test.ts` (`changeStatus` zonder SHA; weigeringen om de SHA vervallen); `test/hooks/mandate-follow-up-status.test.ts` ("schrijft alleen statusregel en vinkje":
    regel zonder SHA, guard met `PR_NUMBER=130`; "de verplichte checks ontbreken": docs:status schrijft nu);
    `test/rails/functional-ui-status.test.ts` ("docs:status en de guard aanvaarden": regel zonder SHA, guard met
    `PR_NUMBER`; "ontbrekend CI-bewijs blijft rood": docs:status schrijft nu, ADR 0054 punt 1);
    `test/rails/archief-guard.test.ts` (r. 208, "een spec met status %s verhuist byte-gelijk: groen"): voor goedgekeurd,
    gebouwd en vervallen nu rood, `docs/template/specs/` is geen verhuisdoel meer; voorstel blijft groen.
  - **Blijft ongewijzigd:** `test/hooks/follow-up-kit.ts` en elke andere test met een met de hand geschreven SHA-regel (ook
    de naam van de spec-en-bouw-test voor AC-11), de andere `archief-*`-tests, fixtures, en commentaar met een oud specpad. Wordt een test rood door de AC-id- of verwijderregel, dan is dat een afwijking: eerst apart akkoord.
- **OV-2 ✅ besloten (ADR 0080)** — `docs/specs/archief/`, niet `docs/template/specs/`; omzetten in de bouw-PR (punt 6).
