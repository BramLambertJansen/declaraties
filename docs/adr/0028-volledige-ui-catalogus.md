# 0028 — Eén bronindex voor alle UI en verplichte catalogusdekking

Status: geaccepteerd (2026-10-13) — besluit eigenaar in de opdracht: alle UI-elementen herkennen, indexeren voor hergebruik en tonen in het design system; afdwingen met de bestaande rails, zonder uitzonderingen.

## Context

De oude `check:catalogus` las alleen barrel-exports en accepteerde een sectietitel als voorbeeld. Een component buiten de barrel,
ontbrekende varianten en een verwijderde Toast-sectie konden groen blijven. De uitzonderingen voor schermcomponenten maskeerden ontbrekende
voorbeelden. De eigenaar heeft gevraagd dit voor de hele UI-kit af te dwingen en één bruikbare index voor agents en developers te leveren.

## Besluit

- Ontdek componenten uit `src/core/web/ui` en `src/web/ui` met de bestaande TypeScript-compiler (geen dependency erbij), onafhankelijk
  van de barrel. Publieke componenten moeten daaruit via `src/web/ui/index.ts` te importeren zijn; interne renderonderdelen worden ook ontdekt.
- `scripts/kit/catalogus-source.ts` is de bron voor de CLI-index en de zoekbare index in de catalogus. Vite levert alleen de compacte
  metadata aan de browser via `scripts/kit/catalogus-index.ts`, als transformatie van de bestaande module `src/web/ui/component-metadata.ts`;
  geen virtuele import of uitzondering op dependency-cruiser, geen compiler of scriptcode in de productiebundel. De index wordt ook bij
  toevoegen, wijzigen en verwijderen van UI-bestanden in dev opnieuw opgebouwd.
- Zoeken in de index gebruikt de bestaande `useListSearch()` en gevalideerde zoekparameter `q`; herladen en een gedeelde URL houden
  dezelfde selectie. Geen aparte state-conventie voor het design system.
- `scripts/kit/catalogus-graph.ts` volgt lokale JSX, importaliassen, doorgegeven JSX en samengestelde componenten vanuit catalogus en haar
  compositie-roots. Een titel, import, commentaar of ongebruikt voorbeeld is geen renderbewijs. Alle eindige stringvarianten van de eigen
  componentprops en publieke UI-hookmethoden vereisen een bereikbaar voorbeeld. Dynamische variantwaarden leveren geen bewijs: schrijf
  expliciete voorbeelden. De daadwerkelijke interacties en toegankelijkheid blijven onderdeel van unit en echte-stack-e2e.
- Geen uitzonderingenlijst. AppShell en de providers worden bewezen via de bestaande compositie. `CenteredCard`, `RouteError`, `NotFound`
  en `PageTitle` krijgen een `preview`-optie voor hun catalogusvoorbeeld, zonder tweede main, extra h1 of wijziging van de documenttitel.
  Dit vervangt de uitzondering voor AppShell in ADR 0015 punt 5; de pagina blijft in de echte AppShell.
- De bestaande `check:catalogus` blijft in `gate:fast`; negatieve fixtures bewijzen de oude gaten en de nieuwe grens (ADR 0011).
  Bestaande catalogusrailtests veranderen omdat de opdracht de geteste eis vervangt: geen uitzonderingen en echte broncode in fixtures.

## Alternatieven

Een handmatige registratielijst kan een nieuw component blijven missen. Titels of imports controleren bewijst geen voorbeeld.
Een uitzonderingenlijst groeit tot een tweede waarheid. Een losse check naast de bestaande gate zou de werkstraat versnipperen.

## Gevolgen

Een nieuw component wordt onmiddellijk zichtbaar in de bronindex en blokkeert CI tot export en voorbeeld compleet zijn. Een nieuwe eindige
variant blokkeert tot het voorbeeld erbij staat. `feiten.mjs componenten --json` en `/design-system` tonen dezelfde metadata.
Routes en features blijven composities van de UI-kit; de bestaande lint- en lagenrails blijven gelden. Er komt geen API-route, permissie,
migratie, dependency, baseline-uitzondering of alternatief pad bij.
