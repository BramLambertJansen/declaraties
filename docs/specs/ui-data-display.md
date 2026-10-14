---
status: voorstel
namespace: ui-data-display
---

# DataTable, Tabs, Gallery, filterbalk en Carousel

## Doel

De eigenaar vroeg alle vijf UI-uitbreidingen op te pakken. Dit voorstel concretiseert de bouw op branch
`codex/ui-data-display`, als vervolg op [UI-collecties](ui-collections.md). Geen bouwrechten vóór eigenaarreview en merge
van spec en exact mandaat naar main (ADR 0027). Volgorde: DataTable, Tabs, Gallery, ListToolbar, Carousel, gezamenlijke catalogus.

## Rollen en wie wat ziet

Geen nieuwe rollen/rechten. Componenten kennen geen accounts. Voorbeelden met fictieve lokale data op bestaande
adminroute `/design-system`, achter bestaande guard. Alle bestaande voorbeelden en exports blijven werken.

## Datawijzigingen (met grants)

N.v.t. — geen opslag, migratie, upload, provider of databasewijziging.

## Routes en foutcodes

N.v.t. — geen nieuwe route, API, permissie of foutcode. Queries houden AsyncView voor laden/fout/leeg.

## Hergebruik en UX

Bestaande Table-primitieven, Button, Checkbox, Combobox, Select, Input, Field, EmptyState, Dialog, ListToolbar en tokens
blijven de basis. Geen nieuwe dependency, inline styles of tokens. Featurevoorbeelden importeren uitsluitend de app-barrel.
De filterbalk wordt een compatibele uitbreiding van ListToolbar, geen tweede FilterBar.

### DataTable

- Generieke DataTable<Row>: readonly rows, getRowId, columns, verplichte label, optionele caption/emptyContent/busy.
  Kolommen: unieke niet-lege id, string header, cell(row): ReactNode, optioneel sortable. Dubbele/lege rij-/kolomids assert.
- Native bestaande Table/Header/Body/Row/Head/Cell; geen gridkeyboardengine. Benoemde scrollregio houdt brede inhoud intern.
- Optioneel controlled sort en onSortChange samen: { columnId, direction: asc/desc } of null. Nieuwe kolom start asc,
  daarna asc/desc wisselen; aria-sort uitsluitend op actieve kop. Ouder sorteert data: geen automatische lokale herschikking.
  Onbekende/verwijderde sortkolom krijgt geen actieve kop. Niet-sorteerbare kolom reageert niet.
- Optioneel selection-object: selectedIds, onSelectionChange, selectionLabel(row), selectAllLabel. Native Checkbox;
  select-all raakt alleen zichtbare rijen en behoudt ids van andere pagina's. Zonder zichtbare rijen is select-all unchecked en disabled. Native indeterminate via inputref bij deels
  geselecteerd. Geen selectieconfig: geen selectiekolom. Ouder beheert selectie-reset bij filters/sort.
- Optioneel rowActions(row) plus actionsLabel: zelfstandige controls, geen clickable rij of geneste buttons.
  Busy zet aria-busy en blokkeert sort/select/loadMore; ouder maakt eigen rijacties disabled.
- Lege rijen: één cel met juiste colspan en emptyContent. AsyncView beheert querytoestanden buiten de tabel.
- Optioneel loadMore-object met hasMore/loading/onLoadMore/label/loadingLabel. Alleen tonen bij hasMore; loading/busy
  voorkomt dubbele actie. Geen cursorstaat, paginanummers of veronderstelde totalen. Ouder geeft resultaatstatus apart weer.

### Tabs

- Items met unieke niet-lege id, label, content, optioneel disabled; verplichte tablist-label. Controlled value/onValueChange
  of defaultValue. Zonder expliciete waarde begint eerste enabled tab. Ongeldige expliciete waarde kiest geen vervanger.
- Horizontale tablist; handmatige activatie. Left/Right verplaatst focus met wrapping over enabled tabs; Home/End naar
  eerste/laatste. Enter/Space/pointer activeert. Up/Down blijven native. Roving tabIndex: één bereikbare enabled tab.
- Native Buttons role tab, aria-selected/controls; panelen role tabpanel met aria-labelledby en unieke ids per instantie.
  Inactieve panelen blijven gemount maar hidden, zonder Tab-focus. Paneelcontainer is focusbaar als inhoud geen focuspunt heeft.
- Bij onbekende actieve id blijft eerste enabled trigger bereikbaar; alle disabled/leeg heeft geen actieve tab.
  Verbergt ouder gefocuste inhoud, herstel focus naar nieuwe actieve of eerste enabled tab. Nooit naar disabled tab.
  Mobiele tabstrip scrolt intern; focus blijft zichtbaar. Geen URL/routerkoppeling.
  Verdwijnt of disablet de actieve uncontrolled tab, activeer eerste enabled tab; dit is structureel herstel zonder
  onValueChange-callback. Verwijderde gefocuste trigger herstelt naar enabled trigger, of focusbare tabcontainer als alle
  tabs disabled/leeg zijn. Alleen herstellen wanneer focus uit deze instantie verloren gaat; geen focus van elders stelen.

### Gallery

- Benoemde Gallery met readonly items: unieke niet-lege id, src, alt, optioneel caption/description. Native lijst en
  figure/figcaption. Eén kolom mobiel, twee sm, drie lg; vaste beeldverhouding, object-fit cover, lazy en begrensde breedte.
- Lange captions wrappen. Leeg toont emptyContent. Afbeeldingsfout toont unavailableText zonder fallbackrequest/retryloop;
  nieuwe src probeert opnieuw. Caption blijft zichtbaar. Alt is verantwoordelijkheid aanroeper; decoratieve alt='' mag.
- Optionele preview-config met previewLabel(item) en closeLabel. Afzonderlijke Button opent bestaande Dialog met gehele
  afbeelding/caption/alt. Escape/sluiten herstelt openerfocus. Verwijderd item sluit preview en focust gallerycontainer.
  Geen geneste actiecontrols, zoom, upload of volgende/vorige-lightbox. Dialog-title is caption als niet leeg,
  anders previewLabel(item), ook bij decoratieve alt. Previewinhoud scrolt verticaal binnen de bestaande Dialog-grenzen.
- Voorbeelden gebruiken bestaande lokale assets of kleine nieuwe repo-eigen SVG's; geen externe mediarequests.

### Filterbalk: ListToolbar uitbreiden

- Bestaande props, Select-filters, sortering, 300ms-zoekdebounce en clearfocus blijven compatibel. ListToolbarFilter krijgt
  optioneel searchable: true gebruikt bestaande Combobox. De bestaande lege Select-optie wordt uitgefilterd;
  haar label wordt placeholder. Wissen is beschikbaar via clearable/clearLabel en roept onChange('') aan.
  ListToolbarFilter-options mogen aanvullend disabled bevatten, uitsluitend werkzaam bij searchable; het bestaande
  Select-contract verandert niet. Niet-lege waarden/labels blijven gelijk. Filter-id’s zijn uniek/niet-leeg en krijgen
  een eigen id-prefix zodat ook ids “zoeken” en “sorteren” niet met zoek-/sorteerveld botsen.
- Optioneel showActiveFilters toont benoemde lijst “Actieve filters”: chipbuttons voor committed zoekterm en niet-lege
  filters. Tekst `<label>: <optionlabel>`, onbekende waarde toont zichzelf. Naam `Verwijder <label>: <waarde>`.
  Sortering krijgt geen verwijderchip. Geen nieuwe badgeprimitive.
- Filterchip roept alleen eigen onChange('') aan en focust bijbehorend veld. Zoekchip annuleert pending debounce, leegt
  zoekinput en roept onQueryChange('') éénmaal aan; focus terug naar zoekveld. Geen late callback die zoektekst terugzet.
  Bestaande “Filters wissen” annuleert timer, roept onClear aan en focust zoekveld; ouder reset ook sortering.
- Geen eigen router/querybeheer. Controls en chips wrappen op 375 px. Gecombineerd voorbeeld filtert/sorteert lokale tabel
  en gallery; selectie reset bij filterwijziging zodat voorbeeld geen verborgen selectie toepast.

### Carousel

- Benoemde Carousel met items { id, label, content ReactNode }, unieke niet-lege ids; controlled value/onValueChange of
  defaultValue. Zonder expliciete waarde eerste slide; onbekende expliciete id toont geen willekeurige vervanger en
  biedt navigatie naar eerste slide. Leeg: emptyContent; één slide: geen overbodige navigatie bij geldige actieve waarde;
  bij ongeldige waarde blijft ook met één item de eerste keuzeknop als herstelcontrol bereikbaar.
- Benoemde region met aria-roledescription “carrousel”; slides group/“dia”, naam `<n> van <totaal>: <label>`.
  Eén zichtbaar, overige gemount/hidden zonder Tab-focus. Buttons “Vorige dia”/“Volgende dia”, geen wrapping, grenzen disabled.
  Keuzeknoppen `Toon dia <n>: <label>` met aria-current op actieve slide.
- Touch/pointer-swipe via Pointer Events: alleen niet-interactieve achtergrond; horizontale delta minstens 50 CSS-pixels
  en groter dan verticale delta geeft één stap op pointerup. Pointercancel doet niets; verticale scroll via touch-action
  pan-y blijft werken. Links/buttons/inputs behouden klik/selectie; geen swipe-start vanuit interactieve inhoud.
- Native buttons verzorgen keyboardbediening; geen algemene arrows die tekstvelden onderscheppen. Gebruikerswissel kondigt
  positie via aria-live polite aan, initiële render niet. Programmeert ouder andere slide bij focus in verdwijnende inhoud,
  focus naar actieve keuzeknop of container zonder actieve slide. Navigatieklik behoudt focus waar mogelijk.
- Geen autoplay, timers, animatie, drag-effect, matchMedia of gesturedependency. Reduced motion is standaard gerespecteerd.

### Voorbeelden en teksten

Secties: “DataTable”, “Tabs”, “Gallery”, “ListToolbar”, “Carousel”. Tekstvoorstel: “Voorbeeldgegevens”, “Naam”, “Rol”,
“Status”, “Acties”, “Bekijken”, “Selecteer alle zichtbare rijen”, “Selecteer Anna de Vries”, “Meer laden”, “Bezig met laden…”,
“Geen resultaten.”, “Zoeken”, “Sorteren”, “Alle rollen”, “Gebruiker”, “Beheerder”, “Overzicht”, “Details”, “Uitgeschakeld”,
“Afbeelding niet beschikbaar.”, “Afbeelding bekijken”, “Sluiten”, “Vorige dia”, “Volgende dia”, “Actieve filters”,
“Verwijder”, “carrousel”, “dia”, “van”. Rijen Anna de Vries/Bert Jansen; captions “Landschap”, “Architectuur”, “Detail”.
Core ontvangt teksten als props of gebruikt bovenstaande bedieningslabels; geen bestaand copybestand wijzigen.

Voorbeelden tonen DataTable basic/sort/select/acties/leeg/busy/meer laden, Tabs default/controlled/disabled met bewaarde
invoer, Gallery leeg/fout/lange caption/preview, Toolbar oude Selectmodus plus Combobox/chips en combinatievoorbeeld,
Carousel leeg/één/meerdere met interactieve inhoud. Catalogusinstructies beschrijven deze bediening kort in het Nederlands.
Geen kunstmatige netwerklaag in core; querytoestanden via bestaand AsyncView-patroon.

## Acceptatiecriteria

- **ui-data-display/AC-1** — Publieke componenten/types via app-barrel; bestaande imports/defaultgedrag blijven werken;
  geen nieuwe dependencies, tokens of gates.
- **ui-data-display/AC-2** — DataTable heeft native semantiek, stabiele ids, controlled sort/aria-sort; ouder bepaalt rijvolgorde.
- **ui-data-display/AC-3** — Select-all/indeterminate/behoud andere pagina-id's, onafhankelijke acties, busy en loadMore werken;
  geen dubbele acties of fictieve cursor/totalen, lege cel met juiste colspan.
- **ui-data-display/AC-4** — Tabs keyboard/handmatige activatie, roving focus, disabled, controlled/default en unieke relaties
  werken; verborgen inhoud behoudt staat zonder verborgen focus.
- **ui-data-display/AC-5** — Gallery heeft responsive semantiek, alt/captions, leeg/fout/src-herstel en Dialogpreview met
  Escape/focusherstel, ook bij verwijderd item.
- **ui-data-display/AC-6** — ListToolbar blijft compatibel, ondersteunt Combobox/chips, afzonderlijk/alles wissen met focus;
  gewiste zoekterm keert niet terug door pending debounce.
- **ui-data-display/AC-7** — Carousel buttons/direct kiezen/swipes respecteren grenzen, verticale scroll en interactieve
  inhoud; geen autoplay, verborgen focus of foutieve positiebroadcasts.
- **ui-data-display/AC-8** — Meerdere instanties/dynamisch verwijderde items houden geldige ids/focus; dubbel/lege ids assert;
  onbekende controlled waarden veroorzaken geen vervangende keuze of callback.
- **ui-data-display/AC-9** — Alle bronindexcomponenten en eindige varianten hebben bereikbare werkende voorbeelden;
  check:catalogus en bestaande index-naar-voorbeeldtest blijven groen zonder uitzonderingen.
- **ui-data-display/AC-10** — Voorbeelden werken op 375/1280 px, touch, licht/donker, CSP, reduced motion en axe zonder
  pagina-overflow; interne scrolling bereikbaar. Gebruiksdocumentatie koppelt AC's aan inhoudelijke tests.

## Randgevallen

| Situatie | Gedrag | Foutcode |
| --- | --- | --- |
| Lege data, alle tabs disabled | Geen fictieve keuze; lege inhoud of geen actief paneel | n.v.t. |
| Selectie van andere pagina | Behouden bij select-all van zichtbare rijen | n.v.t. |
| Onbekende controlled id | Geen automatische keuze; herstelcontrol blijft bereikbaar | n.v.t. |
| Actieve inhoud verwijderd | Geen verborgen focus, herstel naar control/container | n.v.t. |
| Afbeelding fout, src gewijzigd | Placeholder, nieuwe bron opnieuw proberen zonder loop | n.v.t. |
| Zoekchip wissen tijdens debounce | Timer gestopt; oude term keert niet terug | n.v.t. |
| Swipe op control/verticaal/cancel | Gewone interactie/scroll, geen slidewissel | n.v.t. |
| Busy/loading | Geen dubbele sort/select/laadactie | n.v.t. |

## Raakt ook

Exact voorgesteld beschermd broncodemandaat voor `codex/ui-data-display`:

- `src/core/web/ui/data-table.tsx`
- `src/core/web/ui/tabs.tsx`
- `src/core/web/ui/gallery.tsx`
- `src/core/web/ui/list-toolbar.tsx`
- `src/core/web/ui/carousel.tsx`

Verder: app-barrel `src/web/ui/index.ts`, voorbeelden/targets onder `src/web/features/design-system/`, eventueel lokale
SVG's onder public/, `docs/ui-data-display.md`, nieuwe componenttests en `e2e/ui-data-display.spec.ts`.
ListToolbar-regressies in nieuw testbestand; geen bestaande tests wijzigen of skippen. Geen mandaat voor overige corepaden,
copy, tokens, fixtures, configuratie, dependencies, scripts, gegenereerde bestanden of roadmapstatussen.
Ontbreekt een gedeeld uitbreidingspunt, meld dat concreet vóór scopewijziging; geen omweg via app-code.

## Buiten scope

Serverquerybeheer, paginanummers, virtualisatie, kolomresize/reorder, bulkmutaties, accountpagina ombouwen, upload,
externe media, zoom/lightboxnavigatie, autoplay/animatie, verticale tabs, routerintegratie, nieuwe themes/API/DB.
Geen roadmap-item wordt met deze afgebakende UI-tranche afgerond of afgevinkt.

## Testplan

- Nieuwe componenttests per AC: generieke types, controlled/default, sort/select/loadMore, id-fouten, focus/hidden content,
  Tabs-keyboard, galleryfout/srcwissel/preview, toolbarcompatibiliteit/chips/debounce en carouselgrenzen/swipes.
- Nieuwe echte-stack-e2e 375/1280: filters/sort/select/meer laden, Tabs keyboard, preview/Escape, carousel touch met
  interactieve inhoud, axe licht/donker, CSP, reduced motion, pagina-overflow. Bestaande indexcontrole blijft actief.
- Bestaande Toolbar/Table/Dialogtests ongewijzigd groen. Format/lint/typecheck/ratchet met docscontrole/check:catalogus en
  Test ook lege select-all, ids zoals “__proto__”/“constructor” en filter-id-botsingen, verwijderde/disabled tabfocus,
  preview zonder caption/alt, hoge preview op mobiel en focusherstel na swipe uit interactieve slideinhoud.
  Overige gate:fast-checks; volledige gate:slow inclusief ui:check/snapshot en verplichte CI op juiste SHA.
- Specstatus alleen via bewijsgebonden helper na voltooiing, niet als inhoudelijke zelfgoedkeuring.
