---
status: voorstel
namespace: ui-kit-basics
---

# Aanvulling van de UI-basiskit

## Doel

De bestaande kit uitbreiden met gewone invoer-, status- en feedbackelementen, zodat nieuwe schermen geen eigen
controls, formulierbinding of presentatiepatronen buiten de kit hoeven te bouwen.

De eigenaar vroeg op 2026-10-13 een branch om de voorgestelde UI-elementen te maken. Bouwbranch:
`codex/ui-kit-basics`. De eigenaar gaf op 2026-10-13 in de chat akkoord op het bouwvoorstel en de aanbevelingen.
Onderstaande ontwerpkeuzes concretiseren die aanbevelingen. De status blijft voorstel totdat de bewijsgebonden
administratie van ADR 0027 mogelijk is; het exacte broncodemandaat wordt pas actief vanuit main.

Aanleiding: de UI-inventarisatie en aanbevelingen uit de review van 2026-10-13. Die review blijft een afzonderlijke
overdracht. Deze spec is zelfstandig en implementeert de shortlist, niet alle daarin genoemde optionele componenten.
De bestaande werking staat in [ADR 0028](../adr/0028-volledige-ui-catalogus.md) en [het gouden pad](../gouden-pad.md).
Geen nieuwe dependency.

## Rollen en wie wat ziet

Geen nieuwe rol, permissie of route. Componenten zijn herbruikbare presentatie; zij bepalen geen autorisatie.
De bestaande design-systemroute en haar guard blijven gelden. Catalogusvoorbeelden gebruiken uitsluitend
fictieve data en voeren geen nieuwe API-aanroep uit.

Een eventueel vervolgactie-element in EmptyState komt van de compositie van de app en behoudt de bestaande
rechtencontrole. Een statusbadge bevat tekst van de app en kent geen accountstatussen of databasecodes.

## Datawijzigingen (met grants)

N.v.t. — geen migratie, databaseverbinding, opslag of datamodelwijziging.

## Routes en foutcodes

N.v.t. — bestaande componentcatalogus uitbreiden; geen API-route, permissie of foutcode toevoegen.

## Hergebruik en UX

De bestaande UI-kit, het Form/RHF-pad en de beveiligde catalogus blijven de basis voor deze uitbreiding.

### Voorgestelde scope

| Deel | Werk | Behoud |
|---|---|---|
| A — formulierbinding en invoer | Textarea, Checkbox, RadioGroup en uitbreiding van FormField | Bestaande stringvelden, native Input/Select, RHF/Zod en foutfocus |
| B — status en leegte | StatusBadge, EmptyState en aansluiting op AsyncView | App-teksten, huidige emptyText-fallback en gecentraliseerde async-state |
| C — bezig-zijn | Busy-variant voor Button en menuacties | Bestaande Button-varianten, ConfirmDialog en formuliergedrag |

Eerst deel A werkend en bewezen; daarna B en C in afzonderlijk reviewbare wijzigingen. Dialog heeft al een
sheetvariant. Geen nieuwe Sheet, Drawer, AlertDialog, formulierenlibrary of tweede query-/feedbackmechanisme.

### Ontwerpvoorstel voor deel A

- Textarea gebruikt bestaande inputtokens, focusring, invalid/disabled-presentatie en native textarea-semantiek.
  Lengtelimieten blijven props uit het schema/limits van de app; het component verzint geen domeinlimiet.
- Checkbox gebruikt een native checkbox en een klikbaar label; de formulierwaarde blijft boolean.
  Geen arrayselectie of indeterminate-toestand in deze eerste scope.
- RadioGroup gebruikt native radios met een gedeelde groepsnaam en een group-label; één stringwaarde uit de
  opties. Geen vrije invoer, multi-select of custom pijltjestoets-engine.
- Bestaand FormField blijft bruikbaar voor stringvelden, waaronder Textarea. Voeg een typed booleanbinding
  binnen hetzelfde formulierpad toe; maak een ongeschikt schema-/veldtype niet stil leeg.
- Ref, touched-validatie, reset en serverveldfout blijven via RHF/Zod lopen. Bestaande consumer-code mag niet
  door een brede typewijziging verplicht worden herschreven.

De booleanbinding heet FormCheckboxField, de groepsbinding FormRadioGroupField. Zij gebruiken het bestaande
useZodForm/Form-pad. FormField houdt zijn string-interface; de toegestane name wordt begrensd tot stringvelden.
FormCheckboxField accepteert uitsluitend booleanvelden; FormRadioGroupField uitsluitend stringvelden.
Gebruik geen any, type-assertions of alternatief useForm-pad om nieuwe velden passend te maken.

### Ontwerpvoorstel voor deel B

- StatusBadge is een tekstlabel met semantische presentatie. Voorstel voor eindige tonen: neutral, accent en
  destructive, uitsluitend uit bestaande tokens. Geen nieuwe success-/warningkleuren zonder apart besluit.
- EmptyState heeft titel, optionele uitleg en een optionele actiecompositie. Het component roept geen hook/API
  aan en regelt geen rechten. Gebruik bestaande Button/NavLink waar passend.
- AsyncView kan voor een door isEmpty vastgestelde lege uitkomst een samengestelde lege weergave tonen.
  Bestaande emptyText blijft de standaardfallback; geen extra isLoading/isError-logica in features.

De badge-tonen zijn neutral/accent/destructive. EmptyState gebruikt title, description en action.
AsyncView krijgt emptyContent als optionele samengestelde lege weergave en behoudt emptyText als fallback.

### Ontwerpvoorstel voor deel C

- Voorstel: Button krijgt een expliciete busy-prop en een aangeleverd busy-label. Een pending actie is
  herkenbaar en kan niet opnieuw worden geactiveerd; voorkom dat een extra spinner de naam dubbel laat voorlezen.
- Beoordeel focusbehoud samen met het bestaande aria-disabled-patroon van ConfirmDialog. Vervang dit niet
  automatisch door native disabled als daardoor de focus tijdens de actie verloren gaat.
- Menuacties krijgen een expliciete busy-/disabled-toestand. Een nieuwe destructive menuvariant valt buiten
  deze scope; bestaande menu-items blijven compatibel. Een busy/disabled item selecteert en sluit niet.
- Geen nieuwe automatische toast, timeout, retry of bevestigingsdialoog in een basiscontrol.

Button en menu-item gebruiken busy en busyLabel. Een busy element behoudt focus en presenteert aria-disabled;
het activeringspad weigert zowel muis- als toetsenactivering. Busy heeft geen eigen timeout of automatische retry.
De caller beëindigt de toestand. Bestaand disabled behoudt zijn bestaande gedrag.

### Staten, teksten en toetsenbord

Toon in de catalogus default, gevuld/gekozen, disabled, invalid met hulp/fout, reset en pending waar toepasselijk.
Toon nieuwe eindige toonvarianten expliciet voor de bestaande cataloguscheck. Behoud focusring, tokens, reduced
motion en de repo-eisen voor aanraakdoelen/contrast. Test licht/donker en 375/1280 px via de bestaande UI-checks.

Productteksten zijn props of komen uit de app-copy. Er komen geen nieuwe vaste coreteksten.
De catalogus hergebruikt deze bestaande teksten: Naam, Rol, Meldingen, Gebruiker, Beheerder, Versturen,
Vul een naam in., Actief, Uitgenodigd, Geblokkeerd en Bezig… . De lege toestand gebruikt de bestaande tekst
uit uiTexts.empty: Er is nog niets om te tonen. Voorbeelden van fouten hergebruiken de bestaande foutteksten.

Focusvolgorde volgt de DOM. Labelklik bereikt de juiste control; groep en veldfout hebben een begrijpelijke
naam/koppeling. Reset zet defaultwaarden terug. Een serverveldfout focust het juiste control of het afgesproken
groepsanker. Afgewezen submit houdt invoer beschikbaar.

## Acceptatiecriteria

- **ui-kit-basics/AC-1** — Bestaande Input-/Select-formulieren behouden waarde, touched-validatie, submitpayload,
  reset en serverveldfoutgedrag; bestaande acceptatietests blijven inhoudelijk ongewijzigd.
- **ui-kit-basics/AC-2** — Textarea is gekoppeld aan label/hulp/fout, ondersteunt tekst en reset via FormField
  en focust correct na een serverveldfout.
- **ui-kit-basics/AC-3** — Checkbox toggelt met labelklik en toetsenbord; submit/reset gebruiken booleanwaarden,
  een disabled control verandert niet, en schema-/serverfouten volgen de bestaande formulierwerkwijze.
- **ui-kit-basics/AC-4** — RadioGroup heeft één geselecteerde optie, passende native toetsenbediening, een
  groepsnaam en foutkoppeling; default/reset en submitwaarde zijn inhoudelijk getest.
- **ui-kit-basics/AC-5** — Ongeschikte veldtypen worden niet stil naar een lege string omgezet. Een typecheck
  bewijst het afgesproken string-/booleancontract zonder any, casts of nieuwe wrapperuitzondering.
- **ui-kit-basics/AC-6** — StatusBadge toont begrijpelijke tekst in alle afgesproken tonen, in licht/donker met
  bestaande tokens en toepasselijk contrast; appstatussen worden niet in core vastgelegd.
- **ui-kit-basics/AC-7** — AsyncView behoudt de bestaande lege tekstfallback en kan de afgesproken EmptyState
  renderen. Loading/error/retry blijven op het bestaande pad; de actie volgt de autorisatie van de app.
- **ui-kit-basics/AC-8** — Busy Button/menuactie toont de afgesproken naam/toestand, voorkomt dubbele activering
  en heeft aantoonbaar focus-/herstelgedrag. Na een fout kan dezelfde actie opnieuw worden geprobeerd.
- **ui-kit-basics/AC-9** — Alle publieke onderdelen zijn via de app-barrel herbruikbaar en alle eigen eindige
  varianten/toepasselijke states hebben bereikbare catalogusvoorbeelden; geen baseline-/catalogusuitzondering.
- **ui-kit-basics/AC-10** — De formuliercontrols en samengestelde voorbeelden werken met de echte lokale stack,
  CSP aan, axe zonder uitzonderingen op 375/1280 px en de bestaande licht/donker-dekking.

## Randgevallen

| Situatie | Voorstel voor gedrag | Foutcode |
|---|---|---|
| Checkbox-default is false | Blijft een boolean; labelklik wijzigt hem naar true; reset herstelt false | N.v.t. |
| Radio zonder keuze of ongeldige optie | Schema bepaalt geldig/default; geen impliciete eerste optie door UI | Bestaande validatie |
| Lange textarea-inhoud | Componentlayout blijft bruikbaar; schema/limiet van app bepaalt acceptatie | Bestaande validatie |
| Busy actie faalt | Geen automatische retry; afgesproken presentatie herstelt zodat opnieuw proberen kan | Bestaande foutafhandeling |
| Custom EmptyState zonder actie | Informatieve lege weergave; geen ontbrekende/verzonnen permissie | N.v.t. |
| Bestaand stringveld | Compatibel volgens AC-1; migratie van consumers uitsluitend bij expliciete noodzaak | N.v.t. |

## Raakt ook

Exacte voorgestelde bronpaden voor het taakmandaat:

- Nieuwe coreonderdelen: `src/core/web/ui/textarea.tsx`, `src/core/web/ui/checkbox.tsx`,
  `src/core/web/ui/radio-group.tsx`, `src/core/web/ui/status-badge.tsx`, `src/core/web/ui/empty-state.tsx`,
  `src/core/web/ui/form-checkbox-field.tsx`, `src/core/web/ui/form-radio-group-field.tsx`.
- Bestaande coreonderdelen: `src/core/web/ui/form.tsx`, `async-view.tsx`, `button.tsx`, `dropdown-menu.tsx`.
- App-exports: `src/web/ui/index.ts`.
- Catalogus: `src/web/features/design-system/design-system-page.tsx` en een nieuw voorbeeldbestand
  `src/web/features/design-system/ui-basics-examples.tsx`.

Dit is de exacte voorgestelde lijst voor het besluitrecord, geen actief mandaat.
Testpaden, eventuele contrastdekking en documentatie houden hun eigen bescherming.
Geen toestemming voor scripts, gatewijzigingen, tokens, dependencywijzigingen of gegenereerde bestanden.

## Buiten scope

Switch, tabs, accordion, breadcrumb, tooltip, popover, combobox, multi-select, kalender/datepicker, uploads,
money-input, rich text, charts, tree/grid, bulkacties en paginanummers. Ook toastreparaties, lazy-route-focus,
extra rollen en roadmapherstructurering vallen buiten deze eerste UI-opdracht.

## Testplan

- Additieve unit-/componenttests per nieuw control en per nieuwe binding; payload, reset, foutfocus,
  toetsenbediening en pending/herstel zijn inhoudelijke assertions. Geen bestaande test wijzigen om rood te verbergen.
- Voeg een apart testbestand toe voor uitbreiding van FormField in plaats van bestaande tests te herschrijven.
  Voeg typegerichte checks toe voor het afgesproken veldcontract; geef ongeschikte types geen runtime-fallback.
- Catalogus toont alle publieke onderdelen/varianten; check:catalogus en de bestaande contrast-/bundlechecks
  blijven gelden. Nieuwe kleurparen moeten door de passende bestaande controle worden bewezen.
- E2e oefent de voorbeelden via de bestaande echte design-systemroute; geen gemockte API/database en geen
  nieuwe productroute alleen om een UI-test te laten draaien.
- Bij bouw: toepasselijke gate:fast, build en ui:check/gate:slow volgens DoD en agentdoorloop. Meld ontbrekend
  toolchain- of runnerbewijs concreet; een lokaal voorbeeld zonder checkuitvoer is niet gebouwd.

## Vastgelegde keuzes bij het eigenaarakkoord

- **OV-1 — Formulierinterface:** string-FormField behouden; expliciete FormCheckboxField voor boolean en
  FormRadioGroupField voor stringkeuze. Groepsnaam/foutfocus worden met native radio-semantiek bewezen.
- **OV-2 — Badgetonen:** neutral/accent/destructive uit bestaande tokens; geen nieuwe palette.
- **OV-3 — EmptyState:** title, optionele description/action; AsyncView behoudt emptyText en krijgt emptyContent.
- **OV-4 — Busy:** busy/busyLabel; focusbehoud met aria-disabled en geweigerde activering; een menu-item sluit
  tijdens busy/disabled niet. Geen destructive menuvariant, retry of timingbeleid toevoegen.
- **OV-5 — Voorbeeldteksten:** productteksten blijven aangeleverd; de catalogus hergebruikt de hierboven
  opgesomde bestaande teksten. Geen nieuwe vaste core-copy of domeinregel.

Herkomst: de aanbevelingen uit het voorstel, inhoudelijk geaccordeerd door de eigenaar met "akkoord" op 2026-10-13;
de prop-/componentnamen en de keuze om optionele varianten uit te stellen zijn concretisering binnen die scope.
Het besluitrecord en de merge door de eigenaar blijven het technische bewijs uit main.

## Startstatus

Branch aangemaakt vanaf `24edbba` op 2026-10-13. Broncode is nog niet gewijzigd. De lokale feitencheck faalt
door TypeScript-resolutie; de beschikbare Node is 24.15.0 terwijl Node 26 vereist is. Voor implementatie moeten
inhoudelijke keuzes en het exacte broncodemandaat volgens ADR 0027 op main staan. De reviewoverdracht staat
nog als afzonderlijk lokaal bestand in de werkmap.
