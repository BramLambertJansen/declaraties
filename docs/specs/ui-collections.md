---
status: voorstel
namespace: ui-collections
---

# UI-collecties en doorzoekbare keuzevelden

## Doel

De template uitbreiden met Accordion, List/ListItem, DescriptionList en Combobox/FormComboboxField, als eerste tranche
van het [UI-bouwvoorstel](../reviews/2026-10-14-ui-expansion-review.md). De eigenaar vroeg op 2026-10-14 Combobox toe te
voegen en te starten met bouwen. Onderstaande keuzes vormen het concrete voorstel; de status en het mandaat worden pas
actief via de bewijsprocedure van ADR 0027. Bouwbranch: `codex/ui-collections`.

DataTable, Gallery en Carousel blijven expliciete vervolgstappen uit hetzelfde bouwvoorstel. Deze tranche levert
werkende, geteste controls en catalogusvoorbeelden; geen nieuwe UI- of formulierdependency.

## Rollen en wie wat ziet

Geen nieuwe rol of autorisatie. Componenten zijn presentatie en kennen geen accounts, rollen of permissies van de app.
Voorbeelden staan op de bestaande adminroute `/design-system`, onder de bestaande guard en met uitsluitend lokale data.
De pagina en providers houden hun huidige compositie. De statische cataloguschunk bevat geen echte gebruikersdata.

## Datawijzigingen (met grants)

N.v.t. — geen migratie, opslag, provider, databaseverbinding of datamodelwijziging.

## Routes en foutcodes

N.v.t. — geen nieuwe route, permissie of API-foutcode. Formulierfouten blijven Zod/RHF en bestaande serverfoutkoppeling.

## Hergebruik en UX

De bestaande Button, Input/inputBase, Field, Form/useZodForm, tokens, cn, Dialog en catalogus blijven de basis.
Geen tweede Select of DropdownMenu; Combobox is voor een waarde kiezen, DropdownMenu blijft voor acties.

### Bouwvolgorde en API

1. **Combobox + FormComboboxField**: eerst het door de eigenaar toegevoegde zoekbare keuzeveld, direct met formulierpad.
2. **Accordion**: secties in- en uitklappen met expliciete single/multiple-keuze.
3. **List/ListItem en DescriptionList**: compositie voor overzichten en metadata.
4. Alle onderdelen krijgen in dezelfde tranche een volledig bereikbaar voorbeeld en bedieningsinstructie in de index.

De props hieronder vormen het contract; de uitvoerder mag types intern opsplitsen zonder de scope of semantiek te veranderen.
Alleen bestaande tokens en recepten; geen nieuwe kleur, breakpoint, arbitrary value in features of inline styles.

### Combobox

De semantiek volgt het [editable Combobox/listbox-patroon van WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
De keuzes voor lokale opties, expliciete commit en annuleren staan hieronder vast.

- Controlled stringwaarde: `value`, `onValueChange`, `options` met unieke niet-lege `value`, `label` en optionele `disabled`.
  Lege string betekent geen keuze. Dubbelen en lege optionwaarden zijn programmeerfouten en worden met bestaande assert
  geweigerd; labels hoeven niet uniek te zijn. Geen onbekende waarde stilzwijgend vervangen door de eerste optie.
- Eén native tekstinput met combobox-semantiek; `id`, `name`, `ref`, `onBlur`, `disabled`, `aria-invalid` en
  `aria-describedby` worden doorgelaten. Een optionele `clearable` met verplichte `clearLabel` wanneer actief.
  `placeholder` en `emptyText` zijn tekstprops. Een naam/label wordt door de compositie via Field of de formulieradapter gegeven.
- Typen filtert hoofdletterongevoelig op label (Nederlandse locale, substring, witruimte aan de randen genegeerd).
  Zoektekst en gekozen waarde zijn afzonderlijk: alleen expliciet kiezen of wissen roept onValueChange aan.
  Openen zonder nieuwe zoektekst laat alle opties zien; de gekozen optie blijft herkenbaar. Geen automatische selectie.
- Focus of ArrowDown opent. ArrowDown/ArrowUp verplaatst de actieve optie en slaat disabled opties over; bij randen
  blijft de actieve optie staan. DOM-focus blijft op de input, `aria-activedescendant` wijst alleen naar een bestaande,
  zichtbare optie. Elke instantie krijgt eigen ids. De popup is een benoemde listbox met opties en geselecteerde toestand.
- Enter met een actieve enabled optie kiest en sluit, zonder het formulier te submitten. Enter zonder zo'n optie
  selecteert niets. IME-compositie krijgt geen selecteeractie. Left/Right/Home/End en gewone tekstbewerking blijven native.
- Escape sluit en herstelt het label van de vorige keuze. Tab en een klik buiten de control sluiten ook, zonder een
  suggestie te kiezen; de zoektekst wordt bij sluiten verworpen. Pointer/touch op een optie kiest die optie zonder
  dat een voorafgaande blur de keuze verliest. De control mag een ouder-Dialog niet onbedoeld sluiten met dezelfde Escape.
- Wissen kiest expliciet de lege string en zet focus terug op de input. Disabled maakt de hele control onbedienbaar,
  inclusief popup en wissen. Invalid gebruikt hetzelfde invoerrecept en dezelfde ARIA-koppeling als bestaande velden.
- De popup blijft in dezelfde DOM-compositie (geen nieuwe portal/floating dependency), met begrensde hoogte en eigen
  scrolling. De actieve optie blijft zichtbaar. Binnen Dialog werken focusbegrenzing, openen, kiezen en Escape.
- Geen opties of geen matches: toon emptyText als niet-selecteerbare melding. Alle opties disabled: geen actieve,
  selecteerbare optie. Wanneer de ouder een gekozen optie verwijdert, wordt geen andere waarde uitgestuurd; toon de
  placeholder zolang het label ontbreekt. Een nieuwe value of form.reset herstelt het zichtbare label en wist de zoekactie.

### FormComboboxField

Volgt FormCheckboxField/FormRadioGroupField met `useController`, `FieldPathByValue<Input, string>` en assert op stringdefault.
Props: form, name, label, options, description, disabled, placeholder, emptyText en eventueel clearable/clearLabel.
Gekozen value en onValueChange lopen door RHF; ref focust de echte input, onBlur markeert touched, reset en serverfouten
blijven intact. Field toont label/hulp/fout; aria-invalid en aria-describedby koppelen die aan de input.
Geen wijzigingen aan het bestaande FormField- of Form-contract en geen selectieverlies bij een validatiefout.

### Accordion

Props: stabiele item-id's met title/content en optioneel disabled; mode single/multiple; value/onValueChange of
ongecontroleerde defaultValue. Representatie is een readonly array open item-id's, ook bij single (maximaal één).
Alle items mogen dicht. Bij single sluit een nieuw item het vorige; bij multiple blijven andere items gelijk.
Een controlled instantie wacht op de ouderwaarde en houdt geen concurrerende open-state bij.

Iedere trigger is een Button in een passende heading; headingLevel is 2, 3 of 4, standaard 3. Geen h1 in een accordion.
Triggers krijgen aria-expanded en aria-controls; panelen eigen ids en aria-labelledby. Geen region-landmark per paneel
om een groot aantal extra regio's te vermijden. Gesloten inhoud blijft gemount maar hidden en niet met Tab bereikbaar.
Enter/Space bedient de trigger; Tab volgt de native volgorde. Inklappen laat focus op de trigger; disabled kan niet
worden getoggled. Wanneer de ouder de actieve inhoud sluit terwijl focus erin staat, gaat focus terug naar die trigger.
Geen aparte pijltjestoetsengine. IDs blijven uniek tussen instanties; onbekende/verwijderde open ids openen geen ander item.

### List en DescriptionList

List en ListItem zijn native ul/li met readonly ReactNode-children. List krijgt optioneel een naam via aria-label;
ListItem biedt compositieslots title, description, leading en actions. Titels en acties zijn aparte inhoud: geen
omvattende clickable rij met geneste buttons. Bestaande NavLink/Button mogen in de passende slots.
Eén standaardpresentatie, geen extra compact-variant in deze tranche. Responsive wrapping voorkomt pagina-overflow.

DescriptionList toont native dl/dt/dd uit een readonly items-array met stabiele id, term en ReactNode-value.
Termen staan op mobiel boven hun waarde en vanaf het bestaande md-breakpoint ernaast. Lege children/items produceren
lege semantische containers; de ouder gebruikt desgewenst EmptyState. Geen lokale queries of eigen async-state.
Lange termen/waarden mogen afbreken. Decoratieve leading-icons krijgen geen extra toegankelijke naam.

### Voorbeeldteksten en toestanden

Alle zichtbare voorbeeldtekst hieronder is voorstel en wordt met deze spec ter review aangeboden. Core ontvangt labels
als props; geen nieuw beschermd copybestand nodig. Domeinkopie van echte features verandert niet.

- Secties: “Combobox”, “FormComboboxField”, “Accordion”, “List” en “DescriptionList”.
- Labels: “Rol”, “Voorkeur”, “Naam”, “Meldingen”. Opties: “Gebruiker”, “Beheerder”, “Uitgeschakeld”.
- Placeholder “Kies een optie”; lege lijst/geen matches “Geen resultaten.”; wissen “Keuze wissen”.
- Formulier: “Versturen”, “Annuleren”, “Vul een naam in.”, “Kies een rol.”, “Kies een voorkeur.”.
- Accordiontitels: “Algemeen”, “Meldingen”, “Uitgeschakeld”; inhoud: “Voorbeeldinhoud.”.
- List: “Anna de Vries”, “Bert Jansen”; beschrijving “Gebruiker”; actie “Bekijken”.
- DescriptionList: termen “Naam” en “Rol”, waarden “Anna de Vries” en “Beheerder”.
- Catalogusinstructies mogen bovengenoemde bediening in korte Nederlandse zinnen toelichten; geen nieuwe productclaims.

Toon Combobox leeg/gekozen, geopend, gezocht, zonder matches, geheel disabled en invalid met hulp/fout, met disabled optie,
plus pointer/touch, wissen en reset. Toon de adapter met echte required-validatie en serverveldfout via het bestaande
Form-patroon. Toon Accordion single/multiple, default open, controlled en disabled met interactieve inhoud.
Toon lijsten/metadatablokken met acties, lege inhoud en lange tekst. Geen API-aanroep of kunstmatige serverzoekactie.
De bestaande AsyncView-, busy-, toast- en tabelvoorbeelden blijven behouden.

## Acceptatiecriteria

- **ui-collections/AC-1** — Alle nieuwe publieke componenten en hun publieke types zijn via de app-barrel beschikbaar;
  bestaande componenten en importnamen blijven werken. Geen dependency of gate verandert.
- **ui-collections/AC-2** — Een Combobox filtert lokale labels volgens de beschreven regels, met gekozen waarde los van
  zoektekst; typen en sluiten veranderen geen formulierwaarde, expliciet kiezen en wissen wel.
- **ui-collections/AC-3** — Pointer/touch en toetsenbord kiezen dezelfde optionvalue. Disabled opties worden nooit gekozen;
  Enter tijdens IME selecteert niet, Enter bij kiezen submit niet, Escape annuleert en Tab behoudt de vorige keuze.
- **ui-collections/AC-4** — ARIA-label, popup, actieve/geselecteerde optie en ids zijn correct, ook met twee instanties,
  geen opties/matches en na optionwijziging. Geen dangling active-descendant naar verborgen/verwijderde opties.
- **ui-collections/AC-5** — FormComboboxField bewaart stringwaarden, touched, ref/foutfocus, reset, hulp/foutkoppeling en
  serverveldfout. Ongeschikte veldtypes falen bij typecheck; een ontbrekende stringdefault wordt niet stil leeg gemaakt.
- **ui-collections/AC-6** — Accordion single/multiple, controlled/default, disabled en sluiten werken zoals gespecificeerd;
  verborgen inhoud ontvangt geen Tab-focus en programmatisch sluiten herstelt zo nodig triggerfocus.
- **ui-collections/AC-7** — List/ListItem en DescriptionList hebben native lijst-/termsemantiek, afzonderlijke acties,
  stabiele keys en bruikbare wrapping zonder geneste interactieve controls.
- **ui-collections/AC-8** — Alle onderdelen hebben echte, bedienbare catalogusvoorbeelden en een werkende voorbeeldknop
  vanuit de bronindex. Check:catalogus blijft zonder uitzonderingen groen, met alle nieuwe eindige varianten.
- **ui-collections/AC-9** — De voorbeelden werken op 375/1280 px, in licht/donker, met CSP, axe, reduced motion en
  zonder horizontale pagina-overflow; Combobox werkt ook binnen bestaande Dialog met correcte Escape/focus.
- **ui-collections/AC-10** — Alle nieuwe voorbeelden gebruiken uitsluitend lokale data; geen nieuwe API-aanroep,
  queryconventie, rol of accountmutatie. Documentatie bevat gebruik en een AC-naar-testoverzicht.

## Randgevallen

| Situatie | Gedrag | Foutcode |
| --- | --- | --- |
| Geen opties of geen filtermatches | EmptyText, geen fictieve selecteerbare optie | n.v.t. |
| Alle opties disabled | Geen selectie of actieve enabled optie | n.v.t. |
| Gekozen waarde ontbreekt in opties | Placeholder, geen vervangende onValueChange | n.v.t. |
| Dubbele/lege optionvalues | Bestaande assert meldt programmeerfout | n.v.t. |
| Zoektekst zonder selectie, daarna Tab/Escape/buitenklik | Vorige keuze herstelt | n.v.t. |
| Formulier reset terwijl popup open is | Label/waarde hersteld, zoekactie gewist | n.v.t. |
| Accordion met onbekende open id | Geen ander item opent; geen ongeldig panelverband | n.v.t. |
| Lange titels, veel opties, meerdere instanties | Wrap/scroll binnen component, unieke ids en zichtbare focus | n.v.t. |

## Raakt ook

Exact voorgesteld beschermd broncodemandaat voor `codex/ui-collections`:

- `src/core/web/ui/combobox.tsx`
- `src/core/web/ui/form-combobox-field.tsx`
- `src/core/web/ui/accordion.tsx`
- `src/core/web/ui/list.tsx`
- `src/core/web/ui/description-list.tsx`

App-code: exports in `src/web/ui/index.ts`; voorbeelden en targets onder `src/web/features/design-system/`;
gebruikersdocumentatie onder docs/. Nieuwe tests naast componenten en in e2e/. Geen toestemming voor andere corepaden,
copybestanden, scripts, tokens, bestaande tests, dependencies, fixtures, gegenereerde bestanden of roadmapstatussen.
Een ontbrekend gedeeld uitbreidingspunt wordt eerst concreet gemeld; niet verplaatst naar app-code om corebescherming te omzeilen.

## Buiten scope

DataTable/LoadMore, Gallery/MediaTile en Carousel blijven de volgende tranches uit de review. Verder: multiselect,
vrije invoer, serverzoeken, virtualisatie, groepen, autocomplete met automatische commit, drag/drop, nieuwe popup-library,
API/datawijzigingen, auth, bulkacties, nieuwe themes, bestaande featureformulieren ombouwen en gate-/roadmapwijzigingen.
Geen herimplementatie van bestaande Select, DropdownMenu, Dialog, Form of foutafhandeling.

## Testplan

- Nieuwe componenttests: filtering/commit/annuleren, pointer en toetsenbord, IME, disabled/invalid, ids, optionwijziging,
  clear/reset en foutfocus. Typechecks voor RHF-veldtype. Geen snapshots als vervanging van interactieasserties.
- Accordiontests voor controlled/default en single/multiple, verborgen content, disabled en programmatische sluitfocus.
- List/DescriptionList-tests voor semantiek, inhoud en zelfstandige acties.
- Nieuwe echte-stack-e2e op 375/1280 px voor alle catalogusvoorbeelden, Combobox binnen Dialog, toetsenbord/pointer,
  axe licht/donker, CSP, reduced motion en overflow. De index-naar-voorbeeldtest moet nieuwe componenten meenemen.
- Bestaande format, lint, types, ratchet/check-docs, check:catalogus en overige gate:fast-checks; volledige gate:slow en
  verplichte CI op de juiste SHA. Geen bestaande test wijzigen zonder veranderde eis en expliciete reden in de bouw-PR.
