---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd; gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: security
---

# Generieke securitysuite

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Elke route in het register (`routes` in `src/api/app.ts`) en elke tabel in de databasecatalogus krijgt vanzelf securitytests voor sessie,
rechten, MFA, input, foutvorm en eigenaarschap, zodat een app uit deze template geen nieuwe resource kan toevoegen zonder dat die
tests mee gaan lopen (voorbereiding ST-09, `docs/roadmap.md`).

### Uitgangssituatie: de zes dreigingen tegen wat er al is

Peildatum: `main` op `0b348e2`. Alleen gelezen, niet gedraaid (zie "Testplan").

| Dreiging | Status | Wat er is (bestand:regel) | Wat ontbreekt |
|---|---|---|---|
| **H1** A leest, lijst, wijzigt of verwijdert data van B, via de API | **niet gedekt** voor een resource | Alleen het eigen account: sessie van een ander account → 404 (`test/api/eigen-account-deel2.int.test.ts:151`, `:163`); rate limit per gebruiker (`test/api/rate-limit.int.test.ts:118`). | De template heeft geen owner-resource, dus er is niets om tegen te testen; een app krijgt geen A-tegen-B-test via `new:resource` (ADR 0016 OV-1). |
| **H2** A leest, wijzigt of verwijdert data van B, direct op de database onder de app-rol | **deels** | Alleen structuur: `db/tests/invarianten.sql:89-131` (`eigenaartabellen`: geen kolomrecht op `id`/`owner_id`/`created_at`, vier policies, index); gedrag alleen voor `user_roles` (`db/tests/user_roles.sql:25-32`). | Gedrag van de policies van een owner-tabel (B ziet 0 rijen). De structuurcheck leest geen predicaat en kijkt alleen naar `public.*` met een kolom precies `owner_id`; een tabel in `app` of met `user_id` valt erbuiten. |
| **H3** A spooft de owner bij insert of update | **deels** | Kolomrechten sluiten `owner_id` uit (zelfde invariant, `invarianten.sql:94-103`); de `with check` van het sjabloon (`scripts/kit/templates/migratie.sql.tmpl`). | Geen gedragstest: een insert/update met `owner_id = B` is nergens geprobeerd. |
| **V** Rol zonder permissie roept route aan | **deels** | `src/shared/permissions.test.ts:7-44`: elke permissie × rol × sterkte via `check()`, automatisch voor nieuwe permissies (unit). HTTP: een handgeschreven routelijst in `test/api/accounts.int.test.ts:57-64`, `me.int.test.ts:52-56`, `eigen-account.int.test.ts`. | Een nieuwe route staat niet in die lijsten; geen test dat elke route in het register zijn permissie afdwingt. |
| **S** Geen sessie / verlopen sessie op een route | **deels** | Geen sessie: alleen `/api/me` (`me.int.test.ts:46`) en `/api/me` PATCH (`eigen-account.int.test.ts:22`). Verlopen: op Better Auth-niveau (`test/auth/session-policy.int.test.ts:59`, `:70`) en bij de sessielijst (`test/api/review-transactions.int.test.ts:83`). | Geen test per route in het register, geen verlopen sessie (absoluut én idle) op een `defineRoute`-route. |
| **M** Admin zonder MFA op routes die MFA eisen | **deels** | `can()` generiek (`permissions.test.ts:33-44`); HTTP voor `accounts*` (`accounts.int.test.ts:57-64`), `/api/me` (`me.int.test.ts:59`), eigen account (`eigen-account.int.test.ts:28`); RLS-helper voor `user_roles` (`user_roles.sql:31-32`). | Per-route-dekking is handwerk; een nieuwe admin-route zit er niet automatisch in. |
| **I** Onbekende velden en ongeldige payloads; foutvorm `{ code, requestId }` | **deels** | `defineContract` weigert een niet-strict schema bij opstart (`src/core/shared/contract.ts:40`); `createApp`-foutvorm met een nepmodule (`src/core/api/http/hardening.test.ts:12`); `VALIDATION` voor `accounts*` (`accounts.int.test.ts:104`, `:143`) en één eigen-account-route (`eigen-account.int.test.ts:42`, `:116`). | Geen test over alle routes op onbekend veld, verkeerd type, kapotte JSON of arraybody; geen controle dat elke foutresponse precies `{ code, requestId }` is, met een `requestId` gelijk aan `X-Request-Id`. |
| **D1** RLS aan en geforceerd op elke tabel in `public` en `app` | **gedekt** | `db/tests/invarianten.sql:245` (`zonder_rls`), met probe die de invariant bewijst (`:298`). | `better_auth` heeft bewust geen RLS (alleen `auth_service`, `:247`). |
| **D2** Geen brede grants | **deels** | PUBLIC, TRUNCATE/REFERENCES/TRIGGER, `better_auth` dicht, kolomrechten van owner-tabellen (`invarianten.sql:246-249`). | Een tabelbrede `insert`/`update`/`delete`-grant aan `app_authenticated` of `api_user` op een niet-owner-tabel wordt niet gezien; geen allowlist van grants per tabel. |
| **D3** Elke policy heeft een pgTAP-test | **deels** | `test/datapad/policies.int.test.ts:12-20` + `scripts/kit/check-policies.mjs:11-13`: de policynaam komt als `'<naam>: '` voor in een `db/tests/*.sql`. | De check bewijst de naam, niet dat de assert gedrag test. Niets controleert het predicaat: `(select app.current_user_id())` in plaats van kaal of `auth.uid()` (AGENTS.md, nu alleen proza), en geen permissieve `using (true)` voor een API-rol. |

Samengevat: structuur en `can()` zijn goed gedekt; het ontbrekende deel is **gedrag over het hele register en de hele catalogus
heen**, en het eigenaarschap van A tegen B.

## Rollen en wie wat ziet

De suite ziet alleen testgebruikers; ze toont niets aan eindgebruikers.

| Fixture | Betekenis | Hoe gemaakt |
|---|---|---|
| `A` | gebruiker met rol `user`, sessiesterkte `password` | `account('user')` uit `test/api/account-harness.ts` (echte uitnodiging, Better Auth, Mailpit) |
| `B` | tweede gebruiker met rol `user`, ander account | idem |
| `adminMfa` | `admin`, na TOTP-verificatie (`session_strength = mfa`) | `account('admin')` + `enableTotp()` |
| `adminZonderMfa` | `admin`, alleen wachtwoord | `account('admin')` |
| `zonderRol` | ingelogd, geen rij in `user_roles` | `inviteUser` zonder `app.assign_role` |
| `verlopen` | twee varianten: absoluut verlopen (`createdAt` > 7 dagen terug) en idle verlopen (`expiresAt` in het verleden) | absoluut: `ageSession()` uit dezelfde harness; idle: nieuwe helper `expireSession(token)` in `test/security/fixtures.ts` die `expiresAt` in het verleden zet. `ageSession()` verschuift alleen `createdAt`/`updatedAt` (`test/api/account-harness.ts:91-95`), terwijl Better Auth de idle-termijn afdwingt via `expiresAt` (`expiresIn`, `src/core/api/auth/options.ts:156-159`); de harness blijft ongewijzigd |
| `geenSessie` | request zonder cookie | geen cookie |

- Voor databasetests op rijniveau (H2, H3): `asUser('user')` en `asUser('admin')` uit `src/core/api/db/testing.ts`
  (testkit, één transactie die terugdraait). Dat is dezelfde rol- en actorroute als `withUser`, zonder API ertussen.
- Een fixture-gebruiker is per verzoekfamilie vers of blijft onder de rate limit (`RATE_LIMIT_MAX`: `lezen` 300, `schrijven` 60, `duur` 10 per
  minuut, `src/core/shared/limits.ts:30`); ook een geweigerd verzoek telt mee (de telling gaat vóór de validatie, spec `rate-limit`).

## Datawijzigingen (met grants)

Geen migratie en geen nieuwe tabel in `public`, `app` of `better_auth`.

Wel tijdelijk, binnen een testtransactie die terugdraait: een **probe-resource** die de suite zelf opbouwt uit
`scripts/kit/templates/migratie.sql.tmpl` (naam `security_probes`), zodat de suite iets heeft om op te bijten en het generatorpatroon
zelf onder de suite valt. Het sjabloon geeft bewust alleen `select, delete` en stelt de insert/update-grants uit tot de velden uit de
spec (`migratie.sql.tmpl:15-18`). De probe voegt daarom, zoals een vervolgmigratie van een app, één veld toe met kolomgrants:
`label text not null`, `grant insert (label), update (label) on public.security_probes to app_authenticated`. Zo kan `A` legitiem een rij
maken, terwijl `id`, `owner_id` en `created_at` zonder kolomrecht blijven.

Voor de API-laag een **probe-app** in de testcode: `createApp` met routes uit `defineRoute` op de probetabel, echte database en RLS.
De probetabel bestaat alleen binnen de testtransactie die terugdraait, dus een verbinding van Better Auth of van de echte `withUser`-pool
ziet haar niet. De probe-app gebruikt daarom voor de sessie de test-gateway van `asUser(...).auth` (`gatewayFor`,
`src/core/api/db/test-transaction.ts:90-95`): een vaste sessie, geen Better Auth. Dat is het enige deel van de suite zonder Better Auth,
en het is afgebakend: het sessie- en authpad zelf (geen, verlopen, ontbrekende rol of MFA) bewijst AC-2 t/m AC-5 over het echte register
met echte Better Auth-sessies. Heeft een app eigen `eigenaar`-routes in `routes`, dan draait AC-9 daarop met echte accounts en cookies
uit `test/api/account-harness.ts`. Database en RLS worden nergens gemockt; de probe-routes zijn testfixtures, geen app-code.

Nieuw pgTAP-bestand `db/tests/security.sql` (geen wijziging in `invarianten.sql`, zodat geen bestaande test verandert) met extra
catalogusinvarianten, elk met een probe die bewijst dat hij vangt (zoals `invarianten.sql:295-391`):

- **C1 owner-tabel breder gedetecteerd.** Een tabel in `public` of `app` is kandidaat-owner-tabel als ze een kolom heeft die naar
  `better_auth."user"(id)` verwijst, óf een eigenaarvormige kolom (`owner_id`, `user_id`, of een naam op `_user_id`), ook zonder foreign key.
  Elke kandidaat is owner-tabel of staat op een uitzonderingenlijst met reden (`user_roles`, `app.audit_log`, ...). Een eigenaarvormige
  kolom zonder foreign key naar `better_auth."user"(id)` is zelf een overtreding met de naam van tabel en kolom. Zo valt een tabel met
  `user_id`, in `app`, of met een vergeten foreign key er niet buiten.
- **C2 predicaat.** Een policy `to app_authenticated` heeft `app.current_user_id()` alleen als `(select app.current_user_id())`; geen
  `auth.uid()`, geen `using (true)` of `with check (true)` voor een API-rol, tenzij op een uitzonderingenlijst met reden.
- **C3 grants.** Elke grant aan `app_authenticated`, `api_user` of `auth_service` op een tabel in `public` of `app` staat op een allowlist
  per tabel en recht; een tabelbrede `insert`/`update` op een owner-tabel is een overtreding (kolomrechten zijn de regel).

De allowlists staan in `db/tests/security.sql` zelf (testpad), niet in app-code, zodat een developer ze niet kan verruimen zonder
diff-guard (`test/**` en `db/tests/**` zijn gate-paden).

## Routes en foutcodes

Geen nieuwe route, geen nieuwe permissie, geen nieuwe foutcode. De suite gebruikt `UNAUTHENTICATED` (401), `FORBIDDEN` (403),
`MFA_REQUIRED` (403), `VALIDATION` (400), `PAYLOAD_TOO_LARGE` (413), `NOT_FOUND` (404) en `RATE_LIMITED` (429) zoals ze nu zijn.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| n.v.t. | de suite itereert alle routes uit `routes` (`src/api/app.ts`) | per route uit het contract | zie hierboven |

### Hoe de suite routes en tabellen vindt (data-gedreven)

- **Routes:** `routes` uit `src/api/app.ts` (de enige weg, want `createApp` weigert alles buiten `defineRoute`, `create-app.ts`). Per route
  komen `method`, `path`, `input` (zod), `permission` en `rateLimit` uit `route.contract`. De suite telt mee: `iteraties === routes.length`.
- **Tabellen:** `pg_class`/`pg_attribute`/`pg_policy` van de gemigreerde database, zoals `invarianten.sql`.
- **Verwachte uitkomst per route en actor:** uit een eigen, handgeschreven oracle in `test/security/fixtures.ts` (per permissie de
  toegestane rollen, letterlijk uit de specs) plus de MFA-regel uit framework §6 (`admin` ⇒ `mfa`), **niet** door `check()` aan te roepen:
  anders test de suite de implementatie met zichzelf. `Permissions` geeft alleen `names`, `check` en `can` (`src/core/shared/can.ts:25-29`),
  dus de rollen zijn niet uit de implementatie te lezen; de tabel in `permissions.test.ts:7-15` is lokaal en blijft ongewijzigd. De suite
  is rood als de sleutels van de oracle niet gelijk zijn aan `permissions.names`, zodat een nieuwe permissie er niet buiten valt. De
  dubbeling met `permissions.test.ts` is bewust: twee onafhankelijke verwachtingen, beide in testpaden.
- **Alleen weigeringen worden aangeroepen.** Een toegestane aanroep zou de handler uitvoeren (mail, Better Auth); dat is de
  acceptatietest van de resource zelf. Elke generieke aanroep eindigt vóór de handler: 401, 403, 400 of 413.
- **Geldige voorbeeldinput** (nodig, want `VALIDATION` komt vóór `FORBIDDEN`): afgeleid uit het zod-schema (string met `min`, enum eerste waarde,
  uuid, getal binnen grenzen, optionele velden weggelaten). Lukt dat niet, dan is de test rood met de boodschap `voeg sample toe aan test/security/resources.ts` (nooit stil overslaan).

### Wat niet generiek kan, en hoe een resource het declareert

Twee dingen weet alleen de spec: **welke routes bij welke tabel horen, en wie de eigenaar is**. Elke resource declareert dat in
**één bestand** met één regel per resource en per route: `test/security/resources.ts` (testpad, dus beschermd en niet door de developer te verruimen).

```ts
// Alleen gegevens, geen asserties. Eén regel per route in het register; ontbreekt er een, dan is de suite rood.
export const routeClassificatie = {
  'GET /me':            { scope: 'eigen-account' },
  'GET /accounts':      { scope: 'admin' },                  // permissie alleen admin; geen rijen per eigenaar
  'POST /invoices':     { scope: 'eigenaar', resource: 'invoices', actie: 'create' },
  'GET /invoices/:id':  { scope: 'eigenaar', resource: 'invoices', actie: 'read' },
  // ...
} as const;

export const resources = {
  invoices: { tabel: 'public.invoices', sample: { create: { /* geldige velden */ } }, lijst: 'GET /invoices' },
} as const;
```

- `scope` is `eigen-account` (altijd het account uit de sessie), `admin` (alleen admin met MFA) of `eigenaar` (rijen met `owner_id`).
  Een route met `scope: 'eigenaar'` krijgt automatisch de A-tegen-B-tests (AC-9). Een admin- of eigen-account-route krijgt ze niet; de
  classificatie met reden is een reviewpunt.
- De suite is rood als: een route in het register niet geclassificeerd is; een `eigenaar`-route naar een niet-gedeclareerde resource wijst; een
  owner-tabel (C1) geen `resources`-regel heeft.
- `pnpm new:resource` schrijft dit bestand niet (zie "Beslissing"), maar drukt de regels voor beide structuren af naast de andere
  testwijzigingen die hij al afdrukt (`permissions.test.ts`, menutest).

## Hergebruik en UX

n.v.t. — geen scherm, geen component en geen tekst voor gebruikers. Hergebruik elders:

- Bestaande componenten: geen.
- Staten per scherm: n.v.t.
- Alle zichtbare tekst letterlijk: n.v.t. De suite toont alleen testuitvoer; foutboodschappen van de suite (bijv. `voeg sample toe aan test/security/resources.ts`) zijn Nederlands zoals de rest van de testcode.
- Focusvolgorde en toetsenbord: n.v.t.
- Techniek die we hergebruiken: `test/api/account-harness.ts` (fixtures, `ageSession`, `enableTotp`), `test/auth/harness.ts` (`Browser`, CSRF-headers),
  `src/core/api/db/testing.ts` (`beginTestDb`, `asUser`), de catalogusfuncties uit `db/tests/invarianten.sql` (patroon: `pg_temp`-functie die overtredingen teruggeeft, plus probe), `ROLES` uit `src/core/shared/can.ts`.

## Acceptatiecriteria

Bestanden: `test/security/*.int.test.ts` (draaien in `pnpm test:db`, dus in `gate:slow`; `vitest.config.ts` pakt `test/**/*.int.test.ts` al op, geen configwijziging), `db/tests/security.sql`.

- **security/AC-1** — Gegeven het routeregister, wanneer de suite draait, dan wordt elke route uit `routes` geïtereerd en faalt de suite als het aantal iteraties niet gelijk is aan `routes.length`; een nieuwe `defineRoute` in `src/api/app.ts` doet zonder wijziging in de suite mee.
- **security/AC-2** — Gegeven geen sessie (geen cookie), wanneer elke route wordt aangeroepen, dan is het antwoord `401 UNAUTHENTICATED` met precies `{ code, requestId }`.
- **security/AC-3** — Gegeven een sessie die absoluut (> 7 dagen, `ageSession`) of idle (`expiresAt` verstreken, `expireSession`) is verlopen, wanneer elke route wordt aangeroepen, dan is het antwoord `401 UNAUTHENTICATED` en is er niets gewijzigd.
- **security/AC-4** — Gegeven elke route, wanneer een actor wordt gebruikt die volgens de permissietabel niet is toegestaan (`user` voor een admin-permissie, `zonderRol` voor elke route), dan is het antwoord `403 FORBIDDEN` en is de handler niet uitgevoerd.
- **security/AC-5** — Gegeven elke route waarvan de permissie aan `admin` is toegekend, wanneer `adminZonderMfa` haar aanroept, dan is het antwoord `403 MFA_REQUIRED`; met `adminMfa` is dat antwoord het niet (alleen gecontroleerd op routes zonder bijwerking, zie Randgevallen).
- **security/AC-6** — Gegeven elke route met input, wanneer een onbekend veld, een ontbrekend verplicht veld, een verkeerd type per veld, kapotte JSON of een arraybody wordt gestuurd, dan is het antwoord `400 VALIDATION` en is de handler niet uitgevoerd; een body boven `MAX_BODY_BYTES` geeft `413 PAYLOAD_TOO_LARGE`.
- **security/AC-7** — Gegeven elk foutantwoord uit AC-2 t/m AC-6 en elk databasefoutpad uit de probe-app (23505, 23503, 42501 en een onverwachte uitzondering), dan is de body precies `{ code, requestId }`, is `requestId` gelijk aan de `X-Request-Id`-header, is `code` een publieke code, en bevat het antwoord geen stacktrace, SQL, tabel- of constraintnaam.
- **security/AC-8** — Gegeven elke owner-tabel in de catalogus (C1), wanneer `A` een rij maakt en `B` onder dezelfde app-rol `select`, `update` en `delete` probeert, dan raakt `B` 0 rijen, en is de rij van `A` ongewijzigd.
- **security/AC-9** — Gegeven elke route met `scope: 'eigenaar'`, wanneer `B` het id van `A` gebruikt voor lezen, wijzigen en verwijderen, dan is het antwoord `404 NOT_FOUND` (zelfde antwoord als voor een onbekend id, geen enumeratie), bevat de lijst van `B` niets van `A` (ook met paginering via cursor en met `q`), en is de rij van `A` ongewijzigd.
- **security/AC-10** — Gegeven een insert of update met `owner_id` van `B` door `A` (direct op de database en via de API-input), wanneer dat wordt geprobeerd, dan faalt het (`42501` direct; `400 VALIDATION` via de API omdat de input `.strict()` is) en verandert er niets; ook `id` en `created_at` zijn voor `A` niet te kiezen.
- **security/AC-11** — Gegeven een route die niet in `routeClassificatie` staat, een `eigenaar`-route zonder `resources`-regel of een owner-tabel zonder `resources`-regel, wanneer de suite draait, dan is ze rood met de naam van het ontbrekende item (fail-closed, nooit overslaan).
- **security/AC-12** — Gegeven `db/tests/security.sql`, wanneer de catalogus een overtreding van C1, C2 of C3 bevat, dan faalt de test met de naam van tabel of policy; voor elke invariant is bewezen met een probe dat hij een opzettelijke fout vangt en de goede variant doorlaat.
- **security/AC-13** — Gegeven de probe-resource uit de generatorsjabloon, wanneer ze door de volledige suite gaat, dan is ze groen; met een bewust gebroken variant (policy weg, kolomrecht op `owner_id`, `using (true)`, route zonder strict input) is de suite rood op de bijbehorende AC.
- **security/AC-14** — Gegeven `pnpm gate:slow`, wanneer de suite draait, dan draait ze tegen de echte lokale stack (Postgres, Better Auth, Mailpit), zonder gemockte API of database, zonder `skip` of `todo`; de enige afwijking is de sessie van de probe-app via de test-gateway van `asUser` (zie "Datawijzigingen"), en valt ze binnen de bestaande runner (ADR 0009).
- **security/AC-15** — Gegeven de PR, wanneer ze klaar is, dan staan de relevante docs erin bijgewerkt met `bestand:regel` (framework §4 Tests en §8, `docs/gouden-pad.md`, `docs/dod.md` Beveiliging, één regel in `AGENTS.md`, `CHANGELOG.md`).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Route met pad-parameter (`/accounts/:id/block`) | Parameterwaarde komt uit het schema (geldig voorbeeld) of uit `sample`; 401/403 komen vóór het zoeken | n.v.t. |
| `GET`/`DELETE` | input uit de querystring, niet uit een body; ongeldige query is dezelfde `VALIDATION` | `VALIDATION` |
| Rate limit raakt de suite | Fixture-gebruikers worden niet voor alle routes hergebruikt; per routefamilie een verse gebruiker of een telbudget onder `RATE_LIMIT_MAX` | `RATE_LIMITED` (429) alleen als de suite zelf fout rekent: dan rood |
| `duur`-routes (mail) | Alleen weigeringen worden aangeroepen; er gaat geen mail uit | n.v.t. |
| AC-5 met `adminMfa` | Alleen controleren dat het antwoord niet `MFA_REQUIRED` is op routes waar dat zonder bijwerking kan (GET, of weigering door validatie met geldige maar niet-bestaande doelen); de positieve flow is de acceptatietest van de resource | n.v.t. |
| Sample niet af te leiden uit het zod-schema | Suite rood met aanwijzing; geen stille skip | n.v.t. |
| Route die buiten `routes` bestaat (Better Auth `/api/auth/*`, `/api/health`, `/api/ready`, `/api/dev/login-as`) | Buiten deze suite: Better Auth heeft eigen tests (`test/auth/`); de publieke uitzonderingen zijn limitatief (framework §3) | n.v.t. |
| Nieuwe rol (`ROLES`) | De rolmatrix itereert over `ROLES`; de suite dekt de nieuwe rol zonder wijziging | n.v.t. |
| Een tabel zonder eigenaar-kolom (`app.rate_limits`, `app.retention`) | Valt niet onder C1; wel onder C2 en C3 en de bestaande invarianten | n.v.t. |
| Bewuste uitzondering (bijv. `app.audit_log` heeft eigen policies) | Op de uitzonderingenlijst in `db/tests/security.sql` met reden; ontbrekende reden is rood | n.v.t. |

## Raakt ook

- `docs/framework.md` §4 (Tests), §6 (autorisatie, MFA, grants) en §8 (stap 3: de tester declareert in `resources.ts`) — beschermd, eigenaarakkoord.
- `docs/gouden-pad.md` (stap voor de tester), `docs/dod.md` sectie Beveiliging en data, `AGENTS.md` regel onder **Tests** (één regel; geen budgetoverschrijding, framework §9).
- `scripts/kit/new-resource.mjs` en zijn sjablonen: alleen het afdrukken van de declaratieregels (optie a, zie "Beslissing").
- `docs/roadmap.md`: geen nieuw item; de suite hoort bij ST-09 (besluit eigenaar, zie "Open vragen").
- ADR 0016 (OV-1: "geen tests"): blijft staan, want de eigenaar koos optie (a).

## Buiten scope

- Better Auth-routes (`/api/auth/*`), CSRF-matrix (ADR 0007), rate limit-gedrag zelf (spec `rate-limit`), e2e en UI-toegankelijkheid.
- Of de **gekozen** permissie bij een route de juiste is (spec-intentie, review), en het positieve gedrag van een resource (acceptatietests van de tester per spec).
- Het aanscherpen van `check-policies` zodat de assert gedrag moet testen i.p.v. alleen de naam te noemen: gewenst, maar het wijzigt een bestaande check; apart voorleggen.
- De mutatiecheck als herhaalbare job (stap 3 van de opdracht): pas na akkoord.
- Dynamische scans (ZAP, fuzzing), externe pentest, dependency-scanning (bestaat al: osv-scanner, CodeQL).

## Testplan

1. `test/security/fixtures.ts` — de zeven fixtures, bovenop `account-harness.ts` en `testing.ts`.
2. `test/security/routes.int.test.ts` — AC-1 t/m AC-7: één `test.each` per dreiging over het register.
3. `test/security/ownership.int.test.ts` — AC-8 t/m AC-11 tegen de probe-resource en probe-app.
4. `db/tests/security.sql` — AC-12 (C1 t/m C3) met probes.
5. `test/security/self.int.test.ts` — AC-13: groen met de goede probe, rood met de gebroken varianten.
6. Draaien: `pnpm gate:fast` lokaal en `pnpm gate:slow` via `pnpm pr:verify <nr> --watch` (CI-bewijs). De sessie waarin deze spec
   is vastgelegd heeft Node 26.11.1 en `node_modules`, maar geen bereikbare Postgres, Mailpit of API (`feiten`); de spec is dus alleen
   door lezen opgesteld en er is nog geen uitslag.
7. Mutatieverslag (stap 3 van de opdracht): in wegwerpbranches per categorie bewust iets stukmaken — H: een policy droppen of `using (true)` zetten, kolomrecht op `owner_id` geven; V: de permissiecheck in `routeHandler` omzeilen; S: de sessiecontrole uitzetten of de verlooptermijn oprekken; M: de MFA-regel in `can()` uitzetten; I: een contract niet strict maken, een stacktrace in `onError` lekken; D: RLS niet forceren, een brede grant zetten. Per mutatie: welke test rood werd, of niet (dat is een gat).

## Beslissing voor de eigenaar: wie maakt de resource-specifieke tests?

**Besluit eigenaar (2026-10-20): optie (a).** De tester schrijft de resource-specifieke tests; `pnpm new:resource` drukt alleen de
declaratieregels voor `test/security/resources.ts` af en schrijft geen testbestand.

`new:resource` schrijft nu bewust geen tests (ADR 0016 OV-1; framework §8 stap 3 geeft ze aan de tester).

| Optie | Voor | Tegen |
|---|---|---|
| **(a) De tester, plus een door `new:resource` afgedrukte declaratieregel** (gekozen) | Houdt onafhankelijkheid: de bouwer schrijft niet de tests tegen zijn eigen werk (framework §8). `resources.ts` staat in een testpad, dus de developer kan er geen uitzondering in zetten (rolhek, diff-guard). Geen wijziging aan ADR 0016. De generieke tests dekken de standaardlaag; de tester schrijft alleen wat uit de spec komt (domeinregels, ACs, velden). Vergeet de tester de regel, dan is de suite rood (AC-11). | Eén handmatige stap per resource (de regel overnemen en `sample` invullen); gedekt door een rode suite, niet door discipline. |
| (b) `new:resource` schrijft de tests | Geen handwerk; bouwagent hoeft nergens aan te denken. | De generator kent de velden en regels niet (OV-5: geen velden), dus schrijft hij óf lege óf generieke tests; de tester is niet meer onafhankelijk; een testbestand door een script is voor het rolhek onzichtbaar (ADR 0016 context 4, alleen de diff-guard vangt het); ADR 0016 OV-1 moet worden aangepast. |

De "automatisch" zit in de suite zelf (register en catalogus), niet in het schrijven van testbestanden: een nieuwe route
of tabel doet mee zonder iets te doen, en wat niet af te leiden is, laat de suite **rood** worden in plaats van stil over te slaan.

## Beschermde paden, dependencies en PR-indeling

**Beschermde paden (framework §10)**

- Toevoegen mag en raakt geen bestaand bestand: `docs/specs/security-suite.md`, `test/security/**`, `db/tests/security.sql`.
- Raakt wel (eigenaarakkoord, `voorReview` of gate): `docs/framework.md`, `docs/dod.md`, `AGENTS.md` (een regel), `scripts/kit/new-resource.mjs` met sjablonen (`scripts/**`, `voorReview`), eventueel `package.json` alleen als de eigenaar een apart `test:security`-script wil (voorstel: niet nodig; de suite loopt in `pnpm test:db`).
- Geen wijziging in: `src/core/**`, `vitest.config.ts`, `db/migrations/**`, `.github/**`, `.claude/**` (behalve het besluitrecord in `.claude/decisions.json` in PR 1). De permissie-oracle staat in `test/security/fixtures.ts`; `permissions.test.ts` en `test/api/account-harness.ts` blijven ongewijzigd (zie Routes en Rollen).
- Geen bestaande test wordt gewijzigd.

**Nieuwe dependencies:** geen. Bestaand en genoeg: `vitest`, `pg`, `zod` (v4-introspectie zoals `contract.ts:40`), `drizzle-orm` (probe-handlers met `sql`).

**PR's (één onderwerp per PR, in deze volgorde)**

1. `docs(specs): generic security suite (proposal)` — deze spec en het besluitrecord per bouwbranch. Stap 1.
2. `test(security): route-register suite` — fixtures, AC-1 t/m AC-7 (en de probe-app). Alleen testpaden + docs; tester-rol.
3. `test(security): ownership and catalogue invariants` — AC-8 t/m AC-13, `db/tests/security.sql`, `resources.ts`; tester-rol.
4. `feat(generator): print security declaration from new:resource` — `scripts/**`, dus eigenaarakkoord; bevat de bijbehorende docs-wijzigingen (framework, gouden pad, dod, AGENTS.md).
5. Na akkoord, stap 3: mutatieverslag (geen code in `main`) en daarna een voorstel voor een herhaalbare mutatiejob.

Docs gaan per PR mee met de code die ze beschrijft; PR 1 bevat alleen de spec en het besluitrecord.

## Open vragen voor de eigenaar

Beantwoord door de eigenaar op 2026-10-20 (aanbevelingen overgenomen):

1. Optie (a) of (b) voor de resource-specifieke tests? **(a)**, zie "Beslissing".
2. Eigen roadmap-item, of onder ST-09? **Onder ST-09**; geen nieuw roadmap-item (framework §1: aanleiding is ST-09).
3. Mag de suite `scripts/kit/templates/migratie.sql.tmpl` rechtstreeks lezen om de probe-resource te bouwen? **Ja.** Een sjabloonwijziging
   wordt daardoor zichtbaar rood; dat is gewenst.
4. Mag C2/C3 meteen alle bestaande tabellen aan allowlists binden, met als eerste run een lijst uitzonderingen die de eigenaar beoordeelt?
   **Ja.** De uitzonderingen met reden staan in PR 3 ter beoordeling.
