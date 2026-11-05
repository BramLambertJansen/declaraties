# Bouwvoorstel: volgende uitbreidingen van de UI-kit

Datum: 2026-10-14. Basis: main `1d6dc1a` na merge van PR #146.
Opdracht: onderzoek welke aanvullende UI-elementen zinvol zijn, waaronder tabellen, lijsten, galleries, accordions en carousels.
Dit is een voorstel voor vervolgbouw, geen goedgekeurde spec of actief broncodemandaat. Geen implementatie in dit onderzoek.

## Wat er al is

De feiteninventaris en `pnpm check:catalogus` vinden 47 componenten met bereikbare voorbeelden en eindige varianten.
Alle exports staan in `src/web/ui/index.ts`; ontdekking omvat ook interne onderdelen in beide UI-mappen.

- `src/core/web/ui/table.tsx`: Table, TableHeader, TableBody, TableRow, TableHead en TableCell. Native HTML-tabel,
  focusbare horizontale scrollregio, kolomkoppen en bestaande tokens. Nog geen generieke DataTable met kolomdefinities.
- `src/core/web/ui/list-toolbar.tsx`: zoeken met debounce, filters, sorteren en Filters wissen. Dit is de toolbar,
  geen lijstweergave en geen datalaag.
- `src/web/features/accounts/accounts-page.tsx`: accountspecifieke tabel, rijacties, zoek-/filter-/sorteringstoestand,
  deduplicatie via uniqueById, cursorpaginering via fetchNextPage en een eigen Meer laden-knop.
- `src/web/features/account/sessions-section.tsx`: nog een handmatig samengestelde tabel met eigen rijacties.
- Card en onderdelen, Checkbox, StatusBadge, EmptyState, AsyncView, Button, Dialog en DropdownMenu zijn beschikbaar
  om nieuwe weergaven samen te stellen.
- Geen publieke List/DescriptionList, Accordion, Gallery/MediaTile, Carousel, Tabs of Pagination gevonden in de
  UI-bronnen of barrel. Ook geen algemene implementatie daarvan aangetroffen in de bestaande features.

De roadmap heeft een UI-fundament onder fase 1 / 3c, maar nog geen afzonderlijke bouwtaken voor deze collectieweergaven.
Screenshot-baselines en meerdere toastverbeteringen staan daar nog open. Nieuwe componenten vervangen die taken niet.

## Aanbevolen volgorde

| Volgorde | Onderdeel | Waarom | Beperkte eerste bouwscope |
| --- | --- | --- | --- |
| 1 | Combobox + FormComboboxField | Doorzoekbare keuze uit een lokale optielijst, met bestaande formulierbinding. | Eén stringwaarde, filteren op label, wissen, toetsenbord, disabled/invalid en geen-resultaatmelding; geen vrije invoer of serverzoekactie. |
| 2 | Accordion | Veel hergebruik voor uitleg, instellingen en gegroepeerde inhoud; volledig nieuw gedrag in de kit. | Benoemde items, open/dicht, controlled of defaultwaarde, één of meerdere open, toetsenbord en correcte headingstructuur. |
| 3 | List + ListItem; DescriptionList | De kit kan nu alleen kaarten en tabellen standaardiseren; eenvoudige overzichten en metadata missen een eigen patroon. | Native lijststructuur met titel, beschrijving, optioneel pictogram en acties; aparte term/waarde-weergave voor details. |
| 4 | DataTable + cursorlaadbediening | Twee concrete tabellen geven een basis om duplicatie te verminderen. | Bestaande Table hergebruiken, getypeerde kolommen en stabiele rij-id's, expliciet gecontroleerd sorteren, rijacties en Meer laden. |
| 5 | Gallery + MediaTile | Voor portfolio's, bestanden of producten nuttig, maar de huidige app heeft nog geen mediagebruik als referentie. | Responsief raster, beeldverhouding, alt-tekst, caption en foutfallback; geen upload, selectie of lightbox in v1. |
| 6 | Carousel | Zinvol voor een beperkte reeks media; complexer qua focus, verborgen inhoud en bediening. | Handmatige vorige/volgende, positietekst, begrensde randen; geen autoplay of oneindig rondlopen in v1. |

Dit is een volgorde op verwachte herbruikbaarheid en implementatiecomplexiteit, geen gemeten gebruikersvraag.
Aanvulling eigenaar: ook searchable dropdowns/Combobox opnemen en starten met bouwen. De eerste tranche omvat nu
Accordion, List/DescriptionList en Combobox/FormComboboxField. DataTable volgt op basis van de concrete accounts- en
sessietabellen; Gallery en Carousel krijgen daarna een eigen mediagerichte tranche. De volgorde is hieronder uitgewerkt
in een afzonderlijke bouwspec, met het mandaat dat ADR 0027 voor nieuwe corebestanden vereist.

## Concrete instructies per onderdeel

### Accordion

Voorgestelde bron: `src/core/web/ui/accordion.tsx`, publiek via de bestaande app-barrel. Gebruik bestaande Button en tokens;
geen nieuwe dependency nodig voor deze beperkte scope. Bepaal de API in de spec vóór bouwen: item-id, titel, inhoud,
mode single/multiple, value/defaultValue en onValueChange. Geef items stabiele ids; niet hun arraypositie.

De trigger heeft een toegankelijke naam, aria-expanded en een koppeling naar het paneel. Een gesloten paneel is ook voor
Tab en assistieve technologie verborgen. De heading past onder de catalogussectie; geen extra h1. Laat de focus bij de
trigger na inklappen. Vermijd een region-landmark per paneel wanneer dat veel extra landmarks oplevert.

Test Enter/Space, Tab-volgorde, meerdere instanties zonder dubbele ids, single/multiple, default open en wijziging door de
oudercomponent. Een controlled accordion verandert niet zelfstandig als de ouder de nieuwe waarde niet overneemt.
Een enkel native details/summary-blok kan voor eenvoudige disclosure volstaan; laat dat niet ongemerkt doorgroeien tot
meerdere concurrerende Accordion-API's.

### List en DescriptionList

Voorgestelde bronnen: `src/core/web/ui/list.tsx` en `src/core/web/ui/description-list.tsx`.
Gebruik ul/ol/li voor een collectie en dl/dt/dd voor term/waarde. Een lijst wordt geen ARIA-listbox zonder selectiemodel.
Een item kan titel, beschrijving en trailing acties bevatten; acties blijven zelfstandige knoppen of links.
Maak niet de hele rij een button wanneer er ook knoppen in staan. Tabellen behouden hun eigen betekenis voor vergelijkbare
kolomgegevens; een mobiele weergave hoeft niet automatisch iedere tabel in kaarten om te zetten.

Start met een kleine compositie-API (children/slots) in plaats van een resourcebewuste generieke listengine. Gebruik
EmptyState en AsyncView buiten de lijst; bouw dezelfde laad-/foutafhandeling niet opnieuw in ieder lijstonderdeel.
Leg eventuele compact/default-varianten als eindige tokengebaseerde varianten vast, zodat de bestaande cataloguscheck ze eist.

Test lijstsemantiek, toegankelijke namen van acties, lange tekst en toetsenbordbediening op 375/1280 px.

### DataTable en laadbediening

Bouw op de bestaande Table, geen tweede tabelrecept. Een dunne app-compositie is voldoende als alleen kolommen en data
worden gecombineerd; maak een nieuw coreonderdeel pas bij gedeeld herbruikbaar gedrag. Een voorstel kan
`src/core/web/ui/data-table.tsx` en `src/core/web/ui/load-more.tsx` gebruiken, maar leg exacte paden pas vast bij het mandaat.

API: readonly data, getRowId, getypeerde kolom-id's, kop/renderer en optionele rijacties. Sortering wordt controlled en
blijft eigendom van de feature; geen verborgen client-sortering over slechts één serverpagina. Zet aria-sort alleen op de
actieve sorteerbare kop en maak de sorteerknop bereikbaar zonder van de tabel een spreadsheet te maken.

De huidige API heeft cursorpaginering en Meer laden, geen gegarandeerd totaal of willekeurige pagina-index. Toon daarom
geen verzonnen paginanummers, totaalpagina's, spring-naar-laatste of vorige-pagina-gedrag. LoadMore krijgt labels,
hasMore/busy/onLoadMore en eventueel een bestaand resultaatbericht; doet zelf geen fetch of query.

Laat selectie, bulkacties, kolomverbergen, slepen, inline bewerken en virtualisatie buiten v1. Die vragen echte usecases en
extra interactie-/toegankelijkheidsafspraken. Migreer accounts en sessies pas wanneer de nieuwe compositie hun huidige
koppen, rijacties, querygedrag en focus kan behouden; maak geen onnodige featurewijziging onderdeel van een primitieve UI-PR.

Test rendererbinding en stabiele rij-id's, sorteeractie en aria-sort, geen dubbele load-more tijdens busy,
lege/gevulde/langetekstvoorbeelden en horizontale scrollbaarheid. Native table blijft de basis; role=grid vereist een
apart toetsenbord- en focusmodel en is hier geen kleine stijluitbreiding.

### Combobox en FormComboboxField

Een doorzoekbaar keuzeveld is een Combobox, geen DropdownMenu met een zoekvak. De eerste versie accepteert alleen één
waarde uit een lokale optielijst en zoekt op het zichtbare label. Een losse zoekterm is geen geselecteerde formulierwaarde.
Voeg wissen, geen resultaten, disabled en invalid toe, met ref/focus, blur en reset via de bestaande RHF-formulierconventie.

Volg het editable combobox/listbox-patroon: DOM-focus op het invoerveld, actieve optie via aria-activedescendant,
ArrowUp/ArrowDown, Enter om expliciet te kiezen en Escape om de zoekactie te annuleren. Tab kiest niet stilzwijgend een
suggestie. Bewaar de eerder gekozen waarde als de gebruiker alleen zoekt en weer sluit. Respecteer tekstbewerking en IME.

Test pointer/touch én toetsenbord, een combobox binnen Dialog, meerdere instanties, een lege en volledig disabled optielijst,
onbekende/verwijderde waarden, clear/reset en echte adapterfouten. Demo's en indexdoelen komen tegelijk beschikbaar.
Multiselect, vrije invoer, gegroepeerde opties, virtualisatie en zoeken via API zijn vervolgscope.

### Gallery en MediaTile

Een galerijraster met bestaande Card is aanvankelijk mogelijk in app-code; een centrale MediaTile is pas nuttig wanneer
beeldgedrag, placeholder, foutfallback en beeldverhouding gedeeld worden. Maak dus niet alleen om een naam een tweede Card.
Voorgestelde centrale bron bij gedeeld gedrag: `src/core/web/ui/media-tile.tsx`.

Native afbeeldingen krijgen passende alt-tekst, vaste afmetingen of beeldverhouding tegen verspringen en een fallback
zonder vastgelegde remote afbeeldingsdienst. Decoratief beeld gebruikt een lege alt; een herhaalde caption is niet
vanzelf goede alt-tekst. Demo's gebruiken lokale assets. Lazy loading voor beelden buiten de eerste zichtbare inhoud;
laat een belangrijk eerste beeld desgewenst eager laden.

Maak het raster met bestaande responsieve CSS-layoutafspraken. Een lightbox kan later Dialog hergebruiken met focus terug
op de geopende thumbnail. Upload, opslagprovider, cropper en drag/drop zijn afzonderlijke features, geen impliciete Gallery-eisen.
Test ontbrekend beeld, foutfallback, alt-tekst, captions, verschillende beeldverhoudingen en 1/veel items.

### Carousel

Voorgestelde bron: `src/core/web/ui/carousel.tsx`; dependencyloos beginnen met een beperkte, handmatige variant.
Gebruik bestaande Button, een label voor de verzameling, duidelijke vorige/volgendeknoppen en een begrijpelijke positie.
Geen automatische rotatie. Met één item zijn er geen zinloze bedieningsstappen. Zonder items gebruikt de ouder EmptyState.

Niet-zichtbare slides mogen geen onbereikbare maar nog focusbare bediening bevatten. Vorige/volgende verandert de slide,
terwijl focus op de bedieningsknop blijft. Geen nieuwe globale toetsenbordshortcuts en geen ongedefinieerde interceptie van
pijltjestoetsen in invoervelden. Swipe is een mogelijke aanvulling, nooit de enige bediening.
Reduced motion wordt gerespecteerd; voorgestelde v1 hoeft geen overgangsanimatie te hebben.

Test 0/1/veel slides, randen, herhaalde bediening, verborgen slide-inhoud, positionele aankondiging en reduced motion.
Autoplay, indien later echt nodig, vraagt een expliciet besluit over stop/start en stoppen bij focus/hover.

## Andere gaten om later te beoordelen

- Tabs: voor alternatieve panelen op hetzelfde scherm; geen vervanging voor navigatieroutes. Relevant zodra een feature
  werkelijk panelen heeft. Vereist eigen tab-/focus-/activatiemodel.
- Breadcrumb: pas bij echte hiërarchie in routes; de huidige app is grotendeels vlak.
- Progress en skeleton: bij aantoonbare laad-/taakscenario's; bestaand AsyncView is de standaard en mag niet verdwijnen.
- Tooltip: alleen aanvullende uitleg; nooit de enige naam of de enige manier om belangrijke informatie te lezen.
- Bestandsinvoer, datumkiezer en combobox: waardevol, maar vragen meer functionele scope dan collectieweergaven.

## Repo- en roadmapvoorbereiding voor de uitvoerende AI-agent

1. Begin opnieuw met de actuele feiten; dit rapport bindt alleen aan de genoemde main-commit. Controleer eerst of intussen
   componenten of een goedgekeurde spec zijn toegevoegd. ADR 0029 is op deze basis nog voorgesteld, geen actieve uitzondering.
2. Dit onderzoek geeft geen schrijfrechten op nieuwe corepaden. ADR 0027 vereist een exact mandaat in het register op main,
   gebonden aan documentdigest en bouwbranch. Bestaand ui-kit-basics-mandaat bevat deze nieuwe componentpaden niet.
   Bereid een kleine spec/mandaat-PR per tranche voor; label voorstellen als voorstel, laat de eigenaar beslissen.
3. Stel als eerste tranche Accordion + List/DescriptionList + Combobox/FormComboboxField voor, zonder nieuwe dependency, API-route, permissie of migratie.
   Leg precieze paden, API, varianten, voorbeeldteksten en acceptatiecriteria vast. Vervang de bestaande Table niet.
4. Voeg bij de nieuwe componenten onmiddellijk voorbeelden toe op `/design-system`: publieke barrel-export,
   bronindex, bereikbaar voorbeeld en alle eindige varianten. Werk ook `example-targets.ts` bij met focusbaar sectiedoel en
   bedieningsinstructie; een nieuwe indexrij zonder werkende voorbeeldknop is onvolledig.
5. Per onderdeel: normale toestand, echte interactie, disabled waar ondersteund, leeg waar zinvol, lange inhoud,
   mobiel/desktop, licht/donker en relevante fouten. Bouw geen niet-ondersteunde variant alleen voor de catalogus.
6. Documenteer de uitbreiding. Stel concrete roadmaptaken onder 3c voor met spec-/testverwijzingen, maar vink niets af op
   basis van dit rapport. De roadmap is beschermd; wijzigingen volgen eigenaarakkoord en de bestaande bewijsprocedure.
7. Test de interactie en semantiek inhoudelijk; behoud bestaande tests en drempels. Gebruik de bestaande gates en geïsoleerde
   UI-runner. Geen lokaal CI=true, Docker-aanroepen of overrides. Reviewer vóór push; eigenaar merget.

## Bronnen en verificatie

Repository: feiteninventaris opnieuw uitgevoerd na ophalen van main; `pnpm check:catalogus` PASS met 47 componenten.
Exports, alle componentbronpaden, accountstabel, sessietabel, toolbar, roadmap en relevante ADR's gelezen.
Geen nieuwe code, dependency of roadmapstatus gewijzigd. Voor dit onderzoeksdocument zijn geen browsertests opnieuw gedraaid.

Aanvullende primaire referenties, geraadpleegd op 2026-10-14:

- [WAI-ARIA APG Accordion](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/): headings, triggers, open/dicht en toetsenbord.
- [WAI-ARIA APG Table](https://www.w3.org/WAI/ARIA/apg/patterns/table/): tabelsemantiek; native HTML heeft de voorkeur.
- [WAI-ARIA APG Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/): extra focus-/toetsenbordmodel bij interactieve grids.
- [WAI-ARIA APG Carousel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/): bediening, focus en beperkingen van rotatie.

Bouwspec voor de eerste tranche: [UI-collecties en Combobox](../specs/ui-collections.md).
