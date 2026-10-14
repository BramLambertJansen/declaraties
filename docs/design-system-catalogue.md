# De UI-catalogus gebruiken

De adminpagina `/design-system` gebruikt dezelfde UI-kit als de app. De componentenindex ontdekt alle componenten uit
`src/core/web/ui` en `src/web/ui`, inclusief interne onderdelen. De zoekparameter `q` bewaart de zoekopdracht bij herladen.

Bij iedere indexrij staat **Toon [component]**. Die knop scrollt naar het voorbeeld en verplaatst de toetsenbordfocus naar
de benoemde sectie. De zoekopdracht blijft behouden. Onderdelen zoals CardHeader en TableCell worden in hun compositie getoond.
De vindplaatstekst legt uit wanneer je een menu moet openen of een knop moet bedienen. Layoutcomponenten werken in de echte
navigatie en topbalk; providers worden via hun zichtbare resultaten gedemonstreerd.

## Voorbeeldtoestanden

- **AsyncView:** kies resultaat, laden, fout of leeg. Laden blijft staan; Opnieuw proberen herstelt de lokale fout.
  Iedere nieuwe keuze voor fout begint weer met een fout. Leeg toont de standaardtekst; het andere EmptyState-voorbeeld
  demonstreert de eigen lege inhoud met beschrijving en actie.
- **Formulier: toestanden:** verstuur leeg voor fouten op Input, Select, FormCheckboxField en FormRadioGroupField.
  Vul Naam, Rol, Meldingen en Voorkeur in om een uitkomst te proberen. Serverfout toont de formuliermelding;
  Serverfout bij Naam koppelt de bestaande ALREADY_EXISTS-code aan Naam en zet daar focus.
  Bij Blijft bezig tot Afronden blijft de verzendknop uitgeschakeld totdat je Afronden kiest.
  Velden uitschakelen demonstreert disabled invoervelden en beide formulieradapters.
- **Input en Select: disabled en invalid:** blijvend inspecteerbare basisvoorbeelden met labels en gekoppelde fouttekst.
- **RouteError en NotFound:** generieke fout, verboden toegang en niet gevonden als previews, zonder extra main/h1 of
  echte sessiefout. Bestaande dialoog-, toast-, busy- en validatievoorbeelden blijven beschikbaar.

Alle nieuwe query- en submituitkomsten zijn lokale voorbeelddata. Ze doen geen API-aanroep en wijzigen geen accounts.
`queries.ts` bevat de lokale queries; Form en de adapters voeren de werkelijke validatie en foutafhandeling uit.

## Uitbreiden en controleren

Bij een nieuw UI-onderdeel blijven bronindex, barrel-export en bereikbaar voorbeeld verplicht (ADR 0028).
Voeg daarnaast in `example-targets.ts` de vindplaats en korte bedieningsinstructie toe. Het doel is het `id` van een
Section; die wordt alleen met een expliciet id programmatisch focusbaar. Nieuwe Section-aanroepen zonder id veranderen niet.

`pnpm check:catalogus` controleert bronbereikbaarheid en eindige stringvarianten. De nieuwe e2e-test
`e2e/design-system-coverage.spec.ts` bedient voor iedere indexrij de voorbeeldknop en controleert het bestaande focusdoel.
Dezelfde test controleert lokale toestanden, formulierfouten, mobiele overflow, CSP en axe in licht/donker.
`catalogue-states.test.tsx` test de query- en formulierinteracties zonder netwerk.

Een groene broncheck bewijst niet dat een lokale server dezelfde versie draait. Controleer eerst de werkdirectory en
commit van de server. Werk nooit een andere developerbranch met lokale wijzigingen stilzwijgend bij: gebruik een actuele
checkout en volg de bestaande dev-werkstraat. De audit van 14 oktober vond een oude server in `/home/bmj/template`;
het bijwerken van GitHub main verandert die server niet vanzelf.
