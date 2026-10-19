# Gegevensweergave en navigatie

Deze componenten horen bij [de spec](specs/ui-data-display.md) en staan met werkende voorbeelden op de bestaande
adminpagina `/design-system`. Importeer componenten en types uit de app-barrel `src/web/ui/index.ts`.
Geen nieuwe dependency, netwerklaag, token of autorisatie is nodig.
De lokale voorbeeldafbeeldingen staan in `src/web/public/`, onder de Vite-root (`vite.config.ts:95`). Ze laden daardoor
via dezelfde origin in development en de productiebuild, zonder aanvullende configuratie.

## ID's en invoer

Gebruik niet-lege, unieke ID's voor de rijen en kolommen van `DataTable` en voor de items van `Tabs` en `Gallery`.
De rij-ID komt uit `getRowId`; kolommen en items hebben een eigen `id`. Een `DataTable` heeft minstens één kolom nodig.
De componenten weigeren invoer die hier niet aan voldoet; een lege lijst met rijen of items is wel toegestaan.

## DataTable

Geef rows, getRowId, columns en een label. Een kolom heeft id, header en cell(row); sortable maakt de header bedienbaar
wanneer ook sort/onSortChange zijn opgegeven. DataTable sorteert zelf geen data: de ouder verwerkt sortering lokaal of
in de query. Zonder sortprops blijft de tabel statisch. Gebruik AsyncView buiten de tabel voor laden/fout/leeg bij queries.

`selection` is optioneel en wordt door de ouder beheerd. Geef daarin `selectedIds`, `onSelectionChange`,
`selectionLabel` en `selectAllLabel` mee: de laatste twee benoemen de selectievakjes voor schermlezers.
`selectedIds` bevat stabiele ids, ook van andere pagina's. Select-all raakt uitsluitend de aangeleverde rijen;
bij geen rijen is het disabled en bij deels geselecteerd native indeterminate. De ouder beslist wanneer selectie reset
bij filteren. `rowActions` met `actionsLabel` blijft een aparte kolom; geef eigen acties disabled wanneer `busy`.
`busy` blokkeert sorteren, selecteren en meer laden en zet aria-busy. Het tabelvoorbeeld gebruikt lokale data.

`loadMore` ontvangt hasMore/loading/onLoadMore/label/loadingLabel; de ouder beheert cursor/data en laadstatus.
Geen paginanummers of totaal worden verzonnen. Zet loading zodra laden start om herhaalde acties te blokkeren.
De bestaande benoemde Table-regio scrolt intern op mobiel en blijft met het toetsenbord bereikbaar.

De exacte props en hun samenhang staan in [DataTableProps](../src/core/web/ui/data-table.tsx).

## Tabs

Tabs ontvangt label en items met id/label/content/disabled. Gebruik value/onValueChange voor controlled gedrag of
optioneel defaultValue. Left/Right/Home/End verplaatsen focus; Enter/Space activeert. Inactieve panelen blijven gemount
maar hidden, zodat invoer bewaard blijft. Een paneel met eigen focusbare inhoud krijgt geen extra Tab-stop.
Onbekende expliciete waarden worden niet vervangen; de eerste enabled tab blijft bereikbaar. Verdwijnt een actieve
uncontrolled tab, dan herstelt de eerste enabled tab zonder wijzigingscallback. Focusherstel steelt geen externe focus.
Ook als tabs later geladen worden of na een lege/volledig uitgeschakelde tussenstand terugkomen, wordt de eerste enabled
tab actief. Die keuze blijft daarna bij herschikken behouden. Een onbekende expliciete waarde wordt ook dan niet vervangen
(`src/core/web/ui/tabs-empty-recovery.test.tsx`).
Na bewust verlaten van een zichtbaar, bereikbaar veld wordt ook een blur zonder volgend focusdoel gerespecteerd
(`src/core/web/ui/tabs.tsx:87`); een latere ouderwissel trekt focus dan niet terug.

## Gallery

Gallery-items bevatten id/src/alt en optioneel caption/description. Benoem de lijst met label en geef unavailableText.
Afbeeldingen laden lazy. Een fout toont een placeholder; een andere src wordt opnieuw geprobeerd. Voor decoratieve beelden
mag alt leeg zijn. Geef voor de preview `preview.previewLabel` en `preview.closeLabel` mee; beide horen bij het
optionele `preview`-object ([GalleryProps](../src/core/web/ui/gallery.tsx)). Een caption wordt de
Dialogtitel, anders de previewlabel. De bestaande Dialog bewaakt focus/Escape; verwijderen van de geopende kaart sluit
preview en focust de gallerycontainer. De previewinhoud heeft interne verticale scrolling. Geen remote voorbeeldmedia.
Previewknoppen breken lange labels binnen de kaart af (`src/core/web/ui/gallery.tsx:87`), zodat ze de pagina niet verbreden.

## ListToolbar

Bestaande Select-filters en props blijven bruikbaar. `searchable` op een filter gebruikt Combobox; een lege Select-optie
wordt de placeholder en wordt niet aan Combobox doorgegeven. De wisactie kiest de lege waarde. Disabled opties zijn
alleen actief in searchable-modus; het Select-contract verandert niet.

`showActiveFilters` toont verwijderbare chips voor committed zoekterm en filterwaarden. Filterchip wissen verandert één
filter en focust dat veld; zoekchip/alles wissen annuleert de pending zoekdebounce. De ouder beheert URL/query/sortering.
Filter-id's krijgen een eigen prefix, ook wanneer hun waarde zoeken of sorteren is. Geen chips voor sortering.

## Carousel

Vervallen uit deze tranche op verzoek van de eigenaar (2026-10-15): de touchregressie (tik op een dia-actie na een swipe)
bleef in `gate:slow` falen. Component, voorbeeld en tests zijn verwijderd; een latere tranche kan het opnieuw voorstellen.

## Acceptatiebewijs

| Criterium | Tests |
| --- | --- |
| AC-1 exports/types/defaultcompatibiliteit | typecheck, check:catalogus, list-toolbar-filters.test.tsx |
| AC-2 tabel/sortering/ids | data-table.test.tsx, e2e/ui-data-display.spec.ts |
| AC-3 selectie/busy/leeg/meer laden | data-table.test.tsx, e2e/ui-data-display.spec.ts |
| AC-4 tabs/keyboard/staat/focus | tabs.test.tsx, tabs-blur.test.tsx, tabs-empty-recovery.test.tsx, e2e/ui-data-display.spec.ts |
| AC-5 gallery/fout/preview | gallery.test.tsx, e2e/ui-data-display.spec.ts |
| AC-6 toolbar/adaptatie/chips/debounce | list-toolbar-filters.test.tsx, bestaande list-toolbar.test.tsx, e2e/ui-data-display.spec.ts |
| AC-7 carousel/controlled/swipe | vervallen (Carousel uit deze tranche gehaald) |
| AC-8 structurele wijzigingen/id-fouten | nieuwe componenttests per onderdeel |
| AC-9 bronindex en voorbeelden | check:catalogus, bestaande e2e/design-system.spec.ts |
| AC-10 responsive/axe/CSP/thema | e2e/ui-data-display.spec.ts, bestaande design-systemtests |

Testbestanden staan naast corecomponenten; de browserflows gebruiken echte login/API op 375 en 1280 px. Geen bestaande
test, gate, timeout of runnerinstelling wordt aangepast. De tabel-/filter-/gallerycombinatie heeft uitsluitend lokale data.
