# 0048 — UI-catalogus in de app en één bronindex

Status: geaccepteerd

Vervangt [0015](0015-design-system-in-de-app.md) en [0028](0028-volledige-ui-catalogus.md).
Drempel: A4. Consolidatie zonder inhoudelijke wijziging (eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen).

## Context

De componentcatalogus `/design-system` bestond alleen in dev. De eigenaar wil haar als echte pagina in de app, ook in
productie, zodat wie de app beheert de componenten in de echte omgeving ziet (keuzes OV-1 t/m OV-9 in de spec
[design-system](../specs/design-system.md), 2026-10-10). Daarna bleek dat de oude `check:catalogus` alleen barrel-exports las
en een sectietitel als voorbeeld accepteerde; uitzonderingen maskeerden ontbrekende voorbeelden. De eigenaar vroeg (2026-10-13)
alle UI-elementen te herkennen, te indexeren voor hergebruik en in de catalogus te tonen, zonder uitzonderingen.

## Besluit

**De pagina**

1. **In productie, achter een guard** (was 0015 punt 1). `/design-system` is een kindroute van `_app` met
   `guard('design-system:read')`. Die permissie geldt alleen voor `admin`, dus alleen met MFA (via core). Geen uitzondering op
   de `can()`-guard.
2. **Alleen voorbeelddata** (was 0015 punt 2 en Gevolgen). Geen API-aanroep en geen echte data; de guard verbergt de pagina,
   maar beschermt geen geheim, want de statische bundel is te downloaden. Echte data of API-aanroepen vragen een nieuw ADR.
3. **Lazy chunk** (was 0015 punt 3). De pagina laadt pas bij openen, een test bewijst dat ze niet in de entry-chunk zit, het
   bundelbudget blijft gelijk.
4. **Plek** (was 0015 punt 4). `src/web/features/design-system/`.
5. **In de echte AppShell, zonder uitzonderingen** (was 0015 punt 5, vervangen door 0028 punt 5). Geen demo-AppShell. AppShell
   en de providers worden bewezen via de bestaande compositie. `CenteredCard`, `RouteError`, `NotFound` en `PageTitle` hebben
   een `preview`-optie voor hun voorbeeld, zonder tweede main, extra h1 of wijziging van de documenttitel.
6. **Wat dev-only blijft** (was 0015 punt 6). `/design` (prototypes) en de dev-rolwisselaar
   ([0014](0014-dev-login-en-accounts-view.md)); `devOnlyModules()` blijft daarvoor.

**De bronindex en de dekking**

7. **Ontdekken uit de bron** (was 0028 punt 1). Componenten uit `src/core/web/ui` en `src/web/ui` worden met de bestaande
   TypeScript-compiler ontdekt, onafhankelijk van de barrel, ook interne renderonderdelen. Publieke componenten zijn te
   importeren via `src/web/ui/index.ts`.
8. **Eén bron** (was 0028 punt 2). `scripts/kit/catalogus-source.ts` voedt de CLI-index en de zoekbare index in de catalogus.
   De browser krijgt alleen compacte metadata, als Vite-transformatie (`scripts/kit/catalogus-index.ts`) van
   `src/web/ui/component-metadata.ts`: geen virtuele import, geen uitzondering op dependency-cruiser, geen compiler of
   scriptcode in de productiebundel. In dev wordt de index opnieuw opgebouwd bij toevoegen, wijzigen en verwijderen.
9. **Zoeken** (was 0028 punt 3). Via de bestaande `useListSearch()` en de gevalideerde zoekparameter `q`; geen eigen
   state-conventie.
10. **Renderbewijs** (was 0028 punt 4). `scripts/kit/catalogus-graph.ts` volgt lokale JSX, importaliassen, doorgegeven JSX en
    samengestelde componenten vanuit de catalogus en haar compositie-roots. Een titel, import, commentaar of ongebruikt
    voorbeeld bewijst niets. Elke eindige stringvariant van eigen componentprops en publieke UI-hookmethoden vraagt een
    bereikbaar voorbeeld; dynamische waarden bewijzen niets. Interactie en toegankelijkheid blijven in unit- en e2e-tests.
11. **Afdwingen** (was 0028 punt 6). `check:catalogus` blijft in `gate:fast`, met negatieve fixtures voor de oude gaten en de
    nieuwe grens.

## Alternatieven

- **Alleen in dev laten** (was 0015): geen nieuw risico, maar buiten de lokale omgeving niet te zien.
- **Bestaande permissie** (`accounts:read` of `app.use`, was 0015): beweegt mee met accountbeheer, of iedere gebruiker ziet
  een ontwikkelaarspagina.
- **Demo-AppShell in een iframe, `preview`-variant van AppShell, of een route buiten `_app`** (was 0015): vraagt een
  CSP-wijziging, wijzigt core voor een demo, of geeft een scherm zonder navigatie.
- **Handmatige registratielijst, titels of imports controleren, of een uitzonderingenlijst** (was 0028): mist nieuwe
  componenten, bewijst geen voorbeeld, of groeit tot een tweede waarheid.
- **Een losse check naast de bestaande gate** (was 0028): versnippert de werkstraat.

## Gevolgen

- `design-system:read` staat in `src/shared/permissions.ts`; de tabeltest dekt elke verboden rol en de admin zonder MFA.
- Elke nieuwe of gewijzigde sectie van de catalogus komt in productie (was 0015).
- Een nieuw component of een nieuwe eindige variant blokkeert CI tot export en voorbeeld compleet zijn;
  `feiten.mjs componenten --json` en `/design-system` tonen dezelfde metadata (was 0028).
- Er komt geen API-route, migratie, dependency of baseline-uitzondering bij (was 0028). Het gebruik en uitbreiden staat in
  [de UI-catalogus gebruiken](../design-system-catalogue.md).
