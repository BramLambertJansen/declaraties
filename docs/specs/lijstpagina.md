---
status: gebouwd # #514
namespace: lijstpagina
---

# Lijstpagina: zoeken, filteren en sorteren in de URL

> Goedgekeurd door de agent onder mandaat van de eigenaar (2026-10-11). Elke open vraag is besloten volgens de aanbeveling
> erbij; zie `docs/reviews/2026-10-11-keuzes-agent.md`. De eigenaar kan dit herzien.

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Eén patroon voor lijstpagina's: zoeken, filteren en sorteren staan in de search params (TanStack Router `validateSearch`), werken op het
cursor-contract (`src/core/shared/cursor.ts`) en `Table`; eerst op `/admin/accounts`, daarna in de sjablonen van `pnpm new:resource` (roadmap stuk 3f).

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| `admin` (MFA) | `/admin/accounts` met zoekveld, filters "Rol" en "Status" en "Sorteren" | zoeken, filteren, sorteren, de URL delen of als bladwijzer bewaren |
| `user` | ongewijzigd: geen toegang tot `/admin/accounts` (`FORBIDDEN`) | — |
| app met `new:resource` | een lijst met zoekveld en sorteren (filters per spec van de resource) | — |

- De search params zijn UI-state, geen autorisatie: de API valideert dezelfde waarden opnieuw, RLS bepaalt welke rijen er zijn.
- Een gedeelde URL toont de ontvanger alleen wat zijn eigen rechten toelaten.

## Datawijzigingen (met grants)

- **Geen migratie** voor het patroon. Zoeken en sorteren op `app.accounts` lopen over de bestaande view (`security_barrier`: het filter
  `app.is_mfa_admin()` gaat altijd vóór het zoekfilter).
- Geen index in deze spec: een accountlijst is klein, en een index op `better_auth."user"` (bijv. `pg_trgm`) vraagt een extensie en een ADR (OV-4).
- Spec [accountbeheer-uitbreiding](accountbeheer-uitbreiding.md) voegt status `geblokkeerd` toe; het statusfilter neemt de waarden uit het contract over.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| GET | `/api/accounts?q=&rol=&status=&sort=&cursor=` → `{ items, nextCursor }` | `accounts:read` (ongewijzigd) | `VALIDATION`, `FORBIDDEN`, `MFA_REQUIRED` |

- **Gedeeld schema** in core: `defineListSearch({ sorts, filters, cursorKeys })` (`src/core/shared/list-search.ts`) maakt één zod-object met `q`
  (`trim`, 1..`MAX_SEARCH_LENGTH`, leeg = weg), de filters (elk een `z.enum` uit het contract) en `sort` (enum, met standaard). De contracten
  gebruiken het `.strict()` als input (ongeldig → `VALIDATION`); de webroute gebruikt het met `.catch()` per veld in `validateSearch` (ongeldig →
  standaardwaarde, geen foutpagina) en schrijft standaardwaarden niet in de URL.
- **Accounts:** `accountsSearch = defineListSearch({ sorts: ['nieuwste', 'oudste', 'naam-az', 'naam-za'], filters: { rol: ROLLEN, status: STATUSSEN },
  cursorKeys })`, standaard `nieuwste`. `q` zoekt hoofdletterongevoelig in naam en e-mailadres (`ilike`, `%`, `_` en `\` ge-escaped). Sortering `naam-*` op
  `(lower(naam), id)`, `nieuwste`/`oudste` op `(aangemaakt, id)`.
- **Cursor aan de sortering gebonden:** de cursor is `encodeCursor([sort, …sleutel])`; `decodeCursor` met een tuple per sortering. Een cursor van een
  andere sortering of met een ander sleuteltype geeft `VALIDATION`. Zoek- en filterwaarden zitten in de query key van TanStack Query: elke wijziging
  begint bij de eerste pagina. De paginagrootte blijft `ACCOUNTS_PAGE_SIZE`.
- **Cursorbudget** (leerpunt #411): een cursor is nooit langer dan `MAX_CURSOR_LENGTH` (4096, `src/core/shared/limits.ts`). `pageQuery` en
  `defineListSearch` weigeren een langere (`VALIDATION`); `encodeCursor` eist met `assert()` dat hij erbinnen valt (anders `INTERNAL_ERROR`, gelogd).
  Zo geeft de server nooit stil een `nextCursor` terug die zijn eigen invoer weigert. `maxCursorLength(maxLengths)` rekent de langst mogelijke cursor
  uit de maximale UTF-16-lengte per sleuteldeel: elke eenheid wordt in JSON hooguit 6 bytes (`\u0001`, losse surrogaat), base64url maakt het ×4/3.
  Waarom 4096: ruim boven elke sleutel uit de template en ver onder de headergrens van Node (16 KiB); de grens blijft dus begrensd, en een losse
  waarde per lijst (zoals de eerdere 500) kan niet meer afwijken van de sleutel.
- **Sleutelbudget afgedwongen** (leerpunt #444): `cursorKeys` is verplicht en geeft per sortering een niet-lege tuple met de maximale UTF-16-lengte
  van elk sleuteldeel na de sorteernaam, bv. `{ nieuwste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH] }`. Het type eist precies één entry per sortering
  (ontbrekend of extra = typefout). Bij definitie gooit `defineListSearch` een `Error` als `maxCursorLength([sort.length, ...lengtes])` groter is dan
  `MAX_CURSOR_LENGTH` (melding noemt sortering en uitgerekende lengte; precies op de grens mag); ook zonder type (JS) gooit hij bij een ontbrekende
  of extra entry en bij een lengte die geen geheel getal ≥ 0 is. Het resultaat krijgt `encodeCursor(sort, parts)`: `assert()` op het aantal delen
  uit de declaratie (anders `AssertionError` → `INTERNAL_ERROR`), daarna de core-`encodeCursor([sort, ...parts])`. Routes gebruiken die in plaats van
  de losse `encodeCursor`; de assert op `MAX_CURSOR_LENGTH` in core blijft het vangnet.
- **Grens `MAX_TIMESTAMP_LENGTH` = 48** (`src/core/shared/limits.ts`): de ISO-tekst van een `timestamptz` uit Postgres (`to_json(...) #>> '{}'`) is in
  het slechtste geval ~40 tekens (6-cijferig jaar, microseconden, offset met seconden, " BC"); 48 met marge.
- **Accounts `cursorKeys`:** `nieuwste`/`oudste` `[MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH]`; `naam-az`/`naam-za` `[2 * MAX_NAME_LENGTH, MAX_ID_LENGTH]`,
  omdat de sleutel `lower(naam)` is en lowercase een teken kan verlengen (İ → i + U+0307). Budget hooguit 3270 tekens (`maxCursorLength([7, 200, 200])`).
  `src/api/routes/accounts.ts` gebruikt `accountsSearch.encodeCursor(sort, [...])`. Generator: `cursorKeys` voor `nieuwste` en `oudste` met
  `[MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH]`; de route gebruikt `__naamCamel__Search.encodeCursor`.
- **Ontdubbelen:** keyset-paginering garandeert niets als een rij tussen twee pagina's van sorteersleutel verandert (bijv. hernoemd): hij kan
  dan op een volgende pagina terugkomen of worden overgeslagen. `useInfiniteQuery` voegt de pagina's daarom samen met ontdubbelen op `id`
  (eerste voorkomen wint); een overgeslagen rij verschijnt pas na herladen. Geldt ook voor de generator.
- **Cursor niet in de URL** (OV-1): "Meer laden" blijft (`useInfiniteQuery`); de URL bewaart zoeken, filters en sortering. Framework §5 ("cursor in de
  URL") wordt daarop aangepast.

## Hergebruik en UX

- **Bestaande componenten:** `Table`, `AsyncView`, `PageHeader`, `Field`, `Input` (`type="search"`), `Select`, `Button`, `Notice`.
  **Nieuw in de kit (OV-2):** `ListToolbar` in `src/core/web/ui` — layoutblok met zoekveld, nul of meer `Select`-filters, sorteren en "Filters wissen";
  stapelt onder elkaar op 375 px; op `/design-system` en in `check:catalogus`. Plus `useListSearch(route)` in `src/core/web/lib` (lezen en bijwerken
  van de search params; zoekveld met 300 ms debounce en `replace: true`, filters en sorteren als nieuwe history-stap).
- **Staten per scherm:** laden (eerste keer, via `AsyncView`); leeg zonder zoeken of filters ("Nog geen accounts."); leeg mét zoeken of filters
  (eigen tekst plus knop "Filters wissen"); fout via `AsyncView`; verouderd: bij een nieuwe zoekopdracht blijven de vorige rijen staan
  (`placeholderData`), de tabel krijgt `aria-busy="true"` en de statusregel toont "Bezig met laden…"; "Meer laden" bezig: knop uit.
- **Alle zichtbare tekst letterlijk:**

| Plek | Tekst |
|---|---|
| Zoekveld (accounts) | label "Zoeken"; hulptekst "Zoek op naam of e-mailadres." |
| Filter Rol | label "Rol"; opties "Alle rollen", "Gebruiker", "Beheerder" |
| Filter Status | label "Status"; opties "Alle statussen", "Actief", "Uitgenodigd" (en "Geblokkeerd" na spec accountbeheer-uitbreiding) |
| Sorteren | label "Sorteren"; opties "Nieuwste eerst", "Oudste eerst", "Naam A–Z", "Naam Z–A" |
| Wissen | knop "Filters wissen" (alleen zichtbaar als `q` of een filter actief is; wist `q` en filters, de sortering blijft staan) |
| Leeg met filters | "Geen accounts gevonden. Pas je zoekopdracht of filters aan." |
| Statusregel (`aria-live="polite"`) | "{n} accounts getoond." / bij meer pagina's "{n} accounts getoond. Er zijn er meer." / tijdens laden "Bezig met laden…" |
| Generator (sjabloon) | label "Zoeken"; sorteren "Nieuwste eerst", "Oudste eerst"; leeg met filters "Niets gevonden. Pas je zoekopdracht aan." |

- **Focusvolgorde en toetsenbord:** zoekveld → filters → sorteren → "Filters wissen" → tabel → "Meer laden". Typen verplaatst de focus nooit;
  Esc in het zoekveld wist het (native `type="search"`); na "Filters wissen" gaat de focus naar het zoekveld; na "Meer laden" blijft de focus op de knop.

## Acceptatiecriteria

- **lijstpagina/AC-1** — Gegeven een admin op `/admin/accounts`, wanneer hij "gebruiker" typt, dan staat na 300 ms `?q=gebruiker` in de URL (zonder
  nieuwe history-stap) en toont de tabel alleen accounts met "gebruiker" in naam of e-mailadres.
- **lijstpagina/AC-2** — Gegeven filter Rol "Beheerder" en Status "Actief", wanneer de pagina herlaadt of de URL in een nieuw tabblad opent, dan zijn
  dezelfde filters gekozen en dezelfde rijen zichtbaar.
- **lijstpagina/AC-3** — Gegeven sortering "Naam A–Z" en meer dan 25 accounts, wanneer hij "Meer laden" kiest, dan volgen de rijen de sortering zonder
  dubbele of ontbrekende rijen.
- **lijstpagina/AC-4** — Gegeven een gefilterde lijst, wanneer hij de Terug-knop van de browser gebruikt, dan staat het vorige filter of de vorige sortering terug.
- **lijstpagina/AC-5** — Gegeven een zoekopdracht zonder treffers en sortering "Naam A–Z", dan ziet hij "Geen accounts gevonden. …" en "Filters
  wissen"; na een klik bevat de URL alleen nog `sort=naam-az` en staat de volledige lijst er in die sortering.
- **lijstpagina/AC-6** — Gegeven een URL met `?sort=onzin&rol=koning`, wanneer hij hem opent, dan ziet hij de lijst met de standaardwaarden en zonder foutmelding;
  dezelfde waarden rechtstreeks naar `/api/accounts` geven `VALIDATION`.
- **lijstpagina/AC-7** — Gegeven een cursor die bij "nieuwste" hoort, wanneer iemand hem met `sort=naam-az` naar de API stuurt, dan `VALIDATION`.
- **lijstpagina/AC-8** — Gegeven `pnpm new:resource notities`, dan heeft de gemaakte lijst zoeken en sorteren in de search params, compileert alles en slaagt `check:new-resource`.
- **lijstpagina/AC-9** — Gegeven een naam van `MAX_NAME_LENGTH` tekens uit de slechtste tekens (U+0001, `"`, `\`, een teken van 3 UTF-8-bytes, een
  surrogaatpaar, een losse surrogaat) en een id van `MAX_ID_LENGTH` tekens, wanneer de lijst er een cursor van maakt voor `naam-az` of `naam-za`, dan
  accepteert `accountsSearch.api` die cursor weer (de reproductie uit #411 geeft dan `true`).
- **lijstpagina/AC-10** — Gegeven een cursor van `MAX_CURSOR_LENGTH + 1` tekens, wanneer hij naar de API gaat (`defineListSearch` of `pageQuery`),
  dan `VALIDATION`; een cursor van precies `MAX_CURSOR_LENGTH` tekens wordt op lengte niet geweigerd.
- **lijstpagina/AC-11** — Gegeven een sleutel waarvan de cursor langer dan `MAX_CURSOR_LENGTH` wordt, wanneer de server `encodeCursor` aanroept, dan
  gooit die een `AssertionError` in plaats van de cursor terug te geven.
- **lijstpagina/AC-12** — Gegeven per sleuteldeel een maximale lengte, dan is de echte lengte van `encodeCursor` voor elk slechtste teken hooguit
  `maxCursorLength`, en bij uitsluitend U+0001 precies gelijk.
- **lijstpagina/AC-13** — Gegeven een `cursorKeys`-declaratie waarvan `maxCursorLength([sort.length, ...lengtes])` groter is dan `MAX_CURSOR_LENGTH`,
  dan gooit `defineListSearch` bij definitie een `Error` die de sortering noemt; een declaratie van precies `MAX_CURSOR_LENGTH` gooit niet.
- **lijstpagina/AC-14** — Gegeven `cursorKeys` met een ontbrekende of extra sortering, dan is dat een typefout en gooit `defineListSearch` ook runtime
  een `Error`; een lengte die geen geheel getal ≥ 0 is, geeft ook een `Error`.
- **lijstpagina/AC-15** — Gegeven `search.encodeCursor(sort, parts)` met een ander aantal delen dan gedeclareerd, dan een `AssertionError`; met het
  juiste aantal is de uitkomst gelijk aan `encodeCursor([sort, ...parts])`.
- **lijstpagina/AC-16** — Gegeven `pnpm new:resource notities`, dan declareert het contract `cursorKeys` voor elke sortering en slaagt `check:new-resource`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `q` met `%`, `_` of `\` | letterlijk gezocht, geen wildcard | — |
| `q` alleen spaties | als leeg behandeld; weg uit de URL | — |
| `q` langer dan `MAX_SEARCH_LENGTH` (100) | web: afgekapt in het veld (`maxLength`); API: geweigerd | `VALIDATION` |
| Onbekende sleutel in de search params | web: genegeerd; API: geweigerd (`.strict()`) | `VALIDATION` |
| Gemanipuleerde of vreemde cursor | geweigerd, geen SQL-fout | `VALIDATION` |
| Cursor langer dan `MAX_CURSOR_LENGTH` | geweigerd | `VALIDATION` |
| Naam van 100 tekens met stuurtekens of aanhalingstekens als sorteersleutel | de cursor past in het budget; "Meer laden" werkt (AC-9) | — |
| Sleutel die buiten de contracten om te lang is opgeslagen (bijv. `pnpm admin:create --name`; de naamkolom heeft geen lengte-CHECK) | zichtbare fout op die sortering in plaats van een stil vastgelopen "Meer laden" (AC-11) | `INTERNAL_ERROR` |
| Sortering toegevoegd op een lang tekstveld zonder passend budget in `cursorKeys` | de app start en de tests draaien niet: fout bij het laden van het contract, geen `INTERNAL_ERROR` in productie (AC-13) | — |
| Account wijzigt tussen twee pagina's (bijv. hernoemd) | kan op een volgende pagina terugkomen (ontdubbeld op `id`, dus één keer zichtbaar) of overgeslagen worden (zichtbaar na herladen) | — |
| Snel typen | één request per 300 ms stilte; een oud antwoord overschrijft geen nieuw (query key) | — |
| `user` opent `/admin/accounts?q=x` | geen toegang, zoals nu | `FORBIDDEN` |
| Naam met hoofdletters en accenten | sortering op `lower(naam)` in de collatie van de database (OV-3) | — |

## Raakt ook

- `src/core/shared/list-search.ts`, `src/core/web/lib/list-search.ts`, `src/core/web/ui/list-toolbar.tsx` (core, gate-pad), `MAX_SEARCH_LENGTH` in
  `src/core/shared/limits.ts`; `src/shared/contracts/accounts.ts`, `src/api/routes/accounts.ts`, `src/web/features/accounts/*`, route `/_app/admin/accounts` (`validateSearch`).
- Generator: `scripts/kit/templates/` (`contract.ts.tmpl`, `route.ts.tmpl`, `queries.ts.tmpl`, `page.tsx.tmpl`, `web-route.tsx.tmpl`, `spec.md.tmpl`) en
  `scripts/kit/check-new-resource.mjs`: gate-paden (ADR 0016), dus een gate-wijziging door de eigenaar.
- Framework §5 (Paginering, Routing) en `docs/gouden-pad.md` wijzen naar dit patroon; `/design-system` krijgt een voorbeeld van `ListToolbar`.
- Cursorbudget (#411): `src/core/shared/cursor.ts` (`maxCursorLength`, assert in `encodeCursor`), `src/core/shared/limits.ts` (`MAX_CURSOR_LENGTH`,
  `MAX_ID_LENGTH`), `src/core/shared/ids.ts`, `src/core/shared/list-search.ts` (core, gate-pad); `src/shared/contracts/accounts.ts` (test op het budget).
- Sleutelbudget (#444): `src/core/shared/list-search.ts` (`cursorKeys`, `encodeCursor`), `src/core/shared/limits.ts` (`MAX_TIMESTAMP_LENGTH`; core,
  gate-pad); `src/shared/contracts/accounts.ts`, `src/api/routes/accounts.ts`; generator `contract.ts.tmpl`, `route.ts.tmpl`, `spec.md.tmpl` (gate-paden)
  met `check:new-resource`; `docs/gouden-pad.md`, `CHANGELOG.md`. Geen migratie, route of permissie.
- `src/core/shared/cursor.ts`: het commentaar zegt "cursor in de URL"; dat wordt "cursor alleen in de query van TanStack Query" (OV-1).

## Buiten scope

Totaal aantal resultaten, paginanummers, kolomkoppen als sorteerknop, opgeslagen weergaven, full-text search of `pg_trgm`, filters op datum,
meerdere waarden per filter, zoeken op `/design-system`-voorbeelddata. Bij het cursorbudget (#411): een lengte-CHECK op de naam in de database
(`better_auth."user"` is auth, dus eerst een besluit-PR) en stuurtekens in namen weigeren (een aparte keuze, met bestaande gegevens). Bij het sleutelbudget (#444): een lintregel die de losse `encodeCursor` in
app-routes verbiedt, en een lengte-CHECK in de database.

## Testplan

- **Unit:** `defineListSearch`: strict voor de API, `.catch()` voor de web, `q` trim en leeg, grenzen gelijk aan `limits.ts`; cursor per sortering
  (goed, andere sortering, verkeerd type); escapen van `%`, `_`, `\`; `useListSearch` (debounce, `replace` bij zoeken, push bij filter);
  `ListToolbar` (labels, "Filters wissen" alleen bij actieve filters, sortering blijft, focus na wissen); samenvoegen van pagina's met een dubbele
  `id` (één rij); copy-woordenlijst. Cursorbudget: `maxCursorLength` als bovengrens per slechtste teken (AC-12), lengtegrens op de invoer (AC-10),
  assert bij emissie (AC-11), roundtrip van de accountsleutel op maximale lengte per naamsortering (AC-9). Sleutelbudget: `defineListSearch` gooit
  boven de grens en niet precies erop (AC-13); ontbrekende/extra entry als typefout (`@ts-expect-error`) en runtime-`Error`, lengte -1, 1.5, `NaN`
  (AC-14); `search.encodeCursor` met te weinig/te veel delen en gelijk aan core bij het juiste aantal (AC-15); accounts-declaratie ≤ 3270.
- **pgTAP:** n.v.t. (geen migratie); de bestaande test "`app.accounts` alleen voor admin met MFA" blijft groen, nu ook met een zoekfilter.
- **Integratie (`pnpm test:db`):** `GET /api/accounts` per filter, per sortering en met zoeken; paginering over 3 pagina's zonder dubbele of ontbrekende
  rijen per sortering; ongeldige `sort`, `rol`, `status`, `q` en cursor → `VALIDATION`; `user` → `FORBIDDEN`, admin zonder MFA → `MFA_REQUIRED`.
  Volgorde op naam: exacte asserts alleen op ASCII-namen; namen met accenten of hoofdletters alleen op aanwezigheid en zonder dubbele rij, want de
  collatie verschilt per database (OV-3) en lokaal is niet gelijk aan de provider.
- **Generator:** `check:new-resource` maakt een resource uit de nieuwe sjablonen en draait typecheck, lint en unit (AC-8, AC-16).
- **E2E (`pnpm ui:check`, echte stack, CSP aan):** AC-1 t/m AC-6 op `/admin/accounts` met seed-accounts; axe op 375 en 1280 px met lege lijst,
  gefilterde lijst en "verouderd"; op 375 px geen horizontale scroll buiten de tabel.

## Open vragen voor de eigenaar

- **OV-1** — "Meer laden" met de cursor alleen in de query (zoals nu) of vorige/volgende pagina's met de cursor in de URL (framework §5)? Aanbeveling:
  "Meer laden"; een cursor in de URL laat na herladen alleen een middenstuk zien. Framework §5 aanpassen (beschermd pad).
- **OV-2** — Nieuw kitcomponent `ListToolbar` in core, of elke lijst zet `Field`, `Input` en `Select` zelf in een flex-rij? Aanbeveling: `ListToolbar`;
  het patroon komt in elke lijst en in de generator terug, en 375 px en focus zijn dan één keer goed.
- **OV-3** — Sorteren op naam met `lower()` in de standaardcollatie van de database, of een ICU-collatie (`nl-NL`)? Aanbeveling: standaardcollatie nu;
  een ICU-collatie hangt af van de beheerde database van de app (ADR per app).
- **OV-4** — Index voor zoeken (`pg_trgm`) nu al? Aanbeveling: nee; pas bij een lijst die aantoonbaar traag is, met ADR voor de extensie.
- **OV-5** — Welke sorteringen krijgt de generator standaard? Aanbeveling: alleen "Nieuwste eerst" en "Oudste eerst" op `aangemaakt` plus zoeken;
  filters per resource vanuit de spec.
