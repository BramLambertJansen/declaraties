---
status: gebouwd
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

- **Gedeeld schema** in core: `defineListSearch({ sorts, filters })` (`src/core/shared/list-search.ts`) maakt één zod-object met `q`
  (`trim`, 1..`MAX_SEARCH_LENGTH`, leeg = weg), de filters (elk een `z.enum` uit het contract) en `sort` (enum, met standaard). De contracten
  gebruiken het `.strict()` als input (ongeldig → `VALIDATION`); de webroute gebruikt het met `.catch()` per veld in `validateSearch` (ongeldig →
  standaardwaarde, geen foutpagina) en schrijft standaardwaarden niet in de URL.
- **Accounts:** `accountsSearch = defineListSearch({ sorts: ['nieuwste', 'oudste', 'naam-az', 'naam-za'], filters: { rol: ROLLEN, status: STATUSSEN } })`,
  standaard `nieuwste`. `q` zoekt hoofdletterongevoelig in naam en e-mailadres (`ilike`, `%`, `_` en `\` ge-escaped). Sortering `naam-*` op
  `(lower(naam), id)`, `nieuwste`/`oudste` op `(aangemaakt, id)`.
- **Cursor aan de sortering gebonden:** de cursor is `encodeCursor([sort, …sleutel])`; `decodeCursor` met een tuple per sortering. Een cursor van een
  andere sortering of met een ander sleuteltype geeft `VALIDATION`. Zoek- en filterwaarden zitten in de query key van TanStack Query: elke wijziging
  begint bij de eerste pagina. De paginagrootte blijft `ACCOUNTS_PAGE_SIZE`.
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

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `q` met `%`, `_` of `\` | letterlijk gezocht, geen wildcard | — |
| `q` alleen spaties | als leeg behandeld; weg uit de URL | — |
| `q` langer dan `MAX_SEARCH_LENGTH` (100) | web: afgekapt in het veld (`maxLength`); API: geweigerd | `VALIDATION` |
| Onbekende sleutel in de search params | web: genegeerd; API: geweigerd (`.strict()`) | `VALIDATION` |
| Gemanipuleerde of vreemde cursor | geweigerd, geen SQL-fout | `VALIDATION` |
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
- `src/core/shared/cursor.ts`: het commentaar zegt "cursor in de URL"; dat wordt "cursor alleen in de query van TanStack Query" (OV-1).

## Buiten scope

Totaal aantal resultaten, paginanummers, kolomkoppen als sorteerknop, opgeslagen weergaven, full-text search of `pg_trgm`, filters op datum,
meerdere waarden per filter, zoeken op `/design-system`-voorbeelddata.

## Testplan

- **Unit:** `defineListSearch`: strict voor de API, `.catch()` voor de web, `q` trim en leeg, grenzen gelijk aan `limits.ts`; cursor per sortering
  (goed, andere sortering, verkeerd type); escapen van `%`, `_`, `\`; `useListSearch` (debounce, `replace` bij zoeken, push bij filter);
  `ListToolbar` (labels, "Filters wissen" alleen bij actieve filters, sortering blijft, focus na wissen); samenvoegen van pagina's met een dubbele
  `id` (één rij); copy-woordenlijst.
- **pgTAP:** n.v.t. (geen migratie); de bestaande test "`app.accounts` alleen voor admin met MFA" blijft groen, nu ook met een zoekfilter.
- **Integratie (`pnpm test:db`):** `GET /api/accounts` per filter, per sortering en met zoeken; paginering over 3 pagina's zonder dubbele of ontbrekende
  rijen per sortering; ongeldige `sort`, `rol`, `status`, `q` en cursor → `VALIDATION`; `user` → `FORBIDDEN`, admin zonder MFA → `MFA_REQUIRED`.
  Volgorde op naam: exacte asserts alleen op ASCII-namen; namen met accenten of hoofdletters alleen op aanwezigheid en zonder dubbele rij, want de
  collatie verschilt per database (OV-3) en lokaal is niet gelijk aan de provider.
- **Generator:** `check:new-resource` maakt een resource uit de nieuwe sjablonen en draait typecheck, lint en unit (AC-8).
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
