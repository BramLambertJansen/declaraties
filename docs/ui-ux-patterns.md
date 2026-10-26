# Formulieren, verversen, detailweergave en bulkacties

Vijf herbruikbare patronen voor formulieren, gegevensweergave en collecties, beschikbaar via `src/web/ui/index.ts`
en met werkende voorbeelden op `/design-system`. Geen nieuwe API-route, permissie, migratie of dependency.

## Gedrag en hergebruik

- `Form` krijgt optioneel `errorSummary`: een titel en geordende veldnamen/labels. `FormErrorSummary` gebruikt dezelfde
  RHF-veldfouten als FormField, FormCheckboxField, FormRadioGroupField en FormComboboxField. Pas na een verzendpoging
  verschijnt het overzicht; elke foutknop focust het geregistreerde veld. Een nieuwe mislukte verzendpoging focust het
  overzicht; typen en blur stelen geen focus. Zonder deze optie blijft het bestaande formuliergedrag intact.
  De overzichtfocus volgt de uitgestelde veldfocus van RHF; een unmount of gewijzigde foutselectie annuleert de timer.
  Bij pointerbediening van de verzendknop houdt het veld tot de klik zijn focus: blurvalidatie mag de knop niet tussen
  indrukken en loslaten verplaatsen. Pointerdown alleen verzendt niets; toetsenbordbediening blijft native.
- `FormChanges` toont bij gewijzigde invoer een status en een wisactie die RHF terugzet naar de opgeslagen defaultValues.
  Na wissen gaat focus naar het geregistreerde veld `focusOnDiscard`; tijdens verzenden is wissen uitgeschakeld.
  De ouder roept na werkelijk opslagsucces `form.reset(savedValues)` aan;
  de kit doet dat niet op basis van alleen een geslaagde klik. Geen autosave of opslag in de browser.
- `UnsavedChangesGuard` koppelt een expliciete `when` aan TanStack Router en de bestaande ConfirmDialog. Bij intern
  navigeren kan de gebruiker blijven of wijzigingen verwerpen en de oorspronkelijke navigatie voortzetten. Herladen/
  sluiten gebruikt de native browserwaarschuwing. Bij `busy` mag de bevestiging geen lopende opslag onderbreken.
  Mount de guard zolang het formulier bestaat; lokale annulering wordt in het detailrecept expliciet bevestigd.
- `AsyncView` krijgt optioneel `refresh`: labels voor verversen en verouderde inhoud. Eerste laden/fout/leeg blijven
  dezelfde takken. Achtergrondverversing behoudt dezelfde gemounte inhoud en toont een status. Na een netwerk-/serverfout
  blijven gegevens met een waarschuwing en retry staan; ApiError met een 4xx-status verbergt de gegevens. Zonder optie
  blijft de bestaande foutafhandeling gelden. Skeletons vragen een concrete layout en vallen buiten deze eerste bouw.
- `EditableSection` is een controlled detail-/bewerksectie: bestaande DescriptionList als samenvatting, bestaande Form
  als editor. Openen focust de sectiekop; sluiten herstelt focus naar Bewerken als de editorfocus verloren is of op de
  eigen kop staat, ook als een bevestigingsdialoog in dezelfde render sluit (dan na het sluiten). Een bewuste
  focusverplaatsing naar een ander veld of control blijft behouden, ook vóór de uitgestelde focustimer afloopt.
  De ouder beheert data, annuleren en opslaan. Het
  catalogusrecept bewaart dezelfde route/searchparameters en demonstreert wissen, bevestigen en opslagsucces.
  De bestaande teruglink gaat naar `/admin/accounts`; bij gewijzigde invoer blijft eerst de verlaatbevestiging gelden.
- `BulkActions` bouwt voort op bestaande DataTable-selectie. De ouder levert aantal, samenvatting, acties en uitkomst.
  Bij nul selectie en bij busy zijn wissen en acties uitgeschakeld; de status blijft gemount. De voorbeeldflow verwerkt
  uitsluitend geselecteerde ids, behoudt mislukte ids voor opnieuw proberen en meldt succes/fouten apart. Select-all blijft
  uitsluitend gelden voor geladen rijen; er is geen fictieve selectie van alle serverresultaten.

Alle labels worden doorgegeven door de aanroeper. Voorbeeldteksten staan bij de voorbeelden; voorbeelden bevatten uitsluitend
lokale data. Nieuwe componenten worden via de bestaande app-barrel geëxporteerd en krijgen bereikbare catalogusdoelen.
Multiselect, stappenformulieren en bestanden horen bij een latere concrete app-behoefte.

## Validatie

Nieuwe unit-tests naast de code behandelen foutfocus/veldlinks/reset, dirty-state/busy, router annuleren/doorgaan,
refetch met succes/fout/toegangsverlies, controlled detailfocus en nul/busy/gedeeltelijke bulkuitkomsten. Echte-stack-e2e
in `e2e/ui-ux-patterns.spec.ts` behandelt de gecombineerde catalogusflows, keyboard/focus, mobiel/desktop, CSP en axe.
Bestaande tests blijven ongewijzigd. Uitgevoerde checks en beperkingen worden in de oplevering vermeld; testbestanden
alleen zijn geen bouwbewijs.
