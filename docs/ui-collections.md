# Collecties en doorzoekbare keuzevelden

Importeer uit `src/web/ui/index.ts`. De admincatalogus toont Combobox, FormComboboxField, Accordion, List/ListItem en
DescriptionList. Iedere rij in de componentenindex heeft een voorbeeldknop; interne popup- en accordiononderdelen zijn
alleen via hun oudercomponent te gebruiken.

## Combobox

Combobox kiest één string uit lokale `options: { value, label, disabled? }[]`. Zoektekst is tijdelijk: alleen kiezen en
wissen veranderen de waarde. Gebruik `value` en `onValueChange`; geef een naam met Field/id of aria-label.
`placeholder` en `emptyText` kunnen door de app worden aangeleverd. Zonder emptyText wordt de bestaande lege melding gebruikt.
`clearable` vereist een toegankelijke `clearLabel`. Labels en waarden blijven van de app; het component kent geen rollen.

Focus opent de keuzelijst, ook bij `autoFocus` of focus tijdens het mounten. Dat kiest of wijzigt nog geen waarde.
ArrowDown/ArrowUp navigeren langs enabled opties, Enter kiest, Escape annuleert en Tab kiest niets stilzwijgend.
DOM-focus blijft op de tekstinput; de actieve optie wordt met aria-activedescendant aangekondigd en in beeld gescrold.
Tekstbewerking en IME blijven native. De popup blijft in dezelfde DOM-compositie en werkt binnen Dialog.
Een gekozen waarde die uit options verdwijnt wordt niet vervangen: de placeholder verschijnt tot de ouder een waarde herstelt.
Optionvalues zijn uniek en niet leeg; programmeerfouten worden expliciet geweigerd.

Voor echte formulieren gebruik je FormComboboxField met form, name, label en options. Het veld accepteert alleen stringpaden
en vereist een stringdefault. De adapter gebruikt dezelfde Field/RHF-structuur voor hulptekst, touched, foutfocus en
serverveldfouten. Hij geeft een resetKey door aan Combobox, zodat form.reset ook een zoekactie wist wanneer de waarde gelijk
blijft. De native input blijft daarbij gemount. In het catalogusvoorbeeld staat Annuleren boven de velden, zodat een geopende keuzelijst de resetbediening niet bedekt. Een losse ouder kan dezelfde optionele resetKey gebruiken voor zo'n reset.
Geen netwerkzoekactie, vrije invoer of multiselect in deze versie.

## Accordion

Geef items met stabiele id, title, content en optioneel disabled. Mode single (standaard) heeft maximaal één open id;
multiple kan meerdere items openhouden. Gebruik defaultValue voor lokale state, of value/onValueChange voor een
controlled instantie. Open ids zijn readonly stringarrays; onbekende ids openen geen ander item.
headingLevel is 2, 3 of 4, standaard 3. Triggers zijn bestaande Buttons. Panelen blijven gemount wanneer ze hidden zijn,
zodat inhoud behouden blijft; gesloten inhoud is niet met Tab bereikbaar. Als de ouder een paneel sluit terwijl focus erin
staat, gaat focus terug naar de trigger. Disabled triggers gebruiken aria-disabled en voeren geen toggle uit; ze blijven focusbaar voor herstel uit een door de ouder gesloten paneel. Er worden geen extra region-landmarks toegevoegd.

## Lijsten en metadata

List/ListItem gebruiken ul/li. ListItem ontvangt title en optioneel description, leading en actions. Leading is decoratief;
plaats interactieve bediening in title of actions. Een hele rij is geen omvattende button. Geef onderscheidbare actienamen
wanneer meerdere rijen dezelfde actie hebben.
DescriptionList gebruikt dl/dt/dd met items { id, term, value }. Op mobiel staan termen boven waarden, vanaf md ernaast.
Beide patronen laten lege inhoud aan de ouder; gebruik zo nodig EmptyState/AsyncView. Geen eigen query- of laadmechanisme.

## Verificatie per criterium

| Criteria | Bewijs |
| --- | --- |
| AC-1 exports en bestaand gebruik | typecheck, check:catalogus en bestaande featuretests |
| AC-2/3/4 keuze, filter, annuleren, IME, disabled, ids | combobox.test.tsx en ui-collections.spec.ts |
| AC-5 stringtype, touched, reset en serverfout | form-combobox-field.test.tsx en ui-collections.spec.ts |
| AC-6 accordionstate en sluitfocus | accordion.test.tsx en ui-collections.spec.ts |
| AC-7 semantiek en zelfstandige acties | collections.test.tsx en ui-collections.spec.ts |
| AC-8 index en echte voorbeelden | check:catalogus en bestaande design-system-coverage.spec.ts |
| AC-9 browser, touch, Dialog, CSP, axe, thema en overflow | ui-collections.spec.ts op 375/1280 px |
| AC-10 alleen lokale data | bestaande design-system.spec.ts controleert API-aanroepen; demo's gebruiken lokale state |

Nieuwe componenttests staan naast de corecomponenten; de echte-stack-browsertest staat onder e2e/. Bestaande tests en
limieten blijven intact. DataTable, Gallery en Carousel zijn vervolgbouw en worden hiermee niet als gebouwd geregistreerd.
