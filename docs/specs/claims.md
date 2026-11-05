---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — de architect zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: # #<PR>, de eigen PR met de implementatie (ADR 0062) of daarna de gemergde bouw-PR (pnpm docs:status, ADR 0080)
namespace: claims
model: opus
modelreden: geld (bedragen in centen, idempotente aanmaak volgens R-CODE-11 met bonnetabel, payload-hash en advisory lock) en gelijktijdigheid (racetests op aanmaken en behandelen), plus een nieuw RLS-model met een guard-trigger voor statusovergangen (ADR 0046 punt 18)
---

# Declaraties: indienen, behandelen en uitbetaald markeren (Claimly, eerste verticale flow)

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

Eerste verticale flow van de proef-app (ST-09, `docs/roadmap.md`): één owner-scoped resource (`public.claims`) en één
adminactie (behandelen). Referentieontwerp: het Claimly-concept (dashboard met de metrics "In behandeling", "Goedgekeurd",
"Uitbetaald", tabel "Recente declaraties", formulier "Nieuwe declaratie"). Het uiterlijk (tokens, varianten) is een aparte stap
met de skill `ontwerp-overnemen`; de mapping staat in `docs/ontwerp/claimly.md` (wordt in die stap geschreven, niet hier). Deze
spec legt gedrag, data, routes en teksten vast, geen kleuren of maten.

Besluiten van de eigenaar (niet herzien): rollen medewerker en admin; medewerker maakt en beheert eigen declaraties, admin keurt
goed of af en markeert uitbetaald; statussen concept, ingediend (in behandeling), goedgekeurd, afgewezen, uitbetaald; schermen
Overzicht en Declaraties; geen bonupload; Claimly-uiterlijk via tokens en kitcomponenten. Na de spec-review: maximumbedrag
€ 5.000 (OV-1), OV-2 t/m OV-19 volgens de aanbeveling, idempotente aanmaak volgens R-CODE-11, de admin ook in RLS geweerd van
aanmaken en wijzigen, en eerst een besluit-PR.

## Doel

Een medewerker maakt een declaratie (omschrijving, bedrag, categorie), bewaart haar als concept of dient haar in, en een admin
met MFA keurt een ingediende declaratie goed of af en markeert een goedgekeurde als uitbetaald, elke statusovergang met een
auditregel in dezelfde transactie en elke aanmaak idempotent.

## Rollen en wie wat ziet

"Medewerker" is de bestaande rol `user` (`ROLES` in `src/core/shared/can.ts`; core is in de app dicht, R-ARCH-07, dus geen
nieuwe rol). Alleen het label wijzigt, overal (OV-2). Admin is de bestaande rol `admin`; elke admin-permissie eist een MFA-sessie (core).

| Rol | Ziet | Mag |
|---|---|---|
| `user` (medewerker) | alleen eigen declaraties, in elke status | aanmaken, concept wijzigen, concept indienen, concept verwijderen |
| `admin` met MFA | alle declaraties behalve concepten (van iedereen), met de naam van de medewerker | goedkeuren en afwijzen (ingediend), markeren als uitbetaald (goedgekeurd); niet zelf declareren (OV-3) |
| `admin` zonder MFA | niets (`MFA_REQUIRED` op `claims:read` en `claims:review`; `FORBIDDEN` op `claims:write`) | niets |
| anoniem | niets (`UNAUTHENTICATED`) | niets |

Permissies (nieuw in `src/shared/permissions.ts`):

| Permissie | Rollen | Verboden rol (test per verboden rol) |
|---|---|---|
| `claims:read` | `user`, `admin` | — (admin zonder MFA: `MFA_REQUIRED`) |
| `claims:write` | `user` | `admin` → `FORBIDDEN` (ook zonder MFA: de rolcontrole gaat vóór MFA, `check` in `src/core/shared/can.ts`) |
| `claims:review` | `admin` | `user` → `FORBIDDEN`; admin zonder MFA → `MFA_REQUIRED` |

**Twee lagen (R-DB-06).** `can()` is de eerste laag. RLS is de tweede: de policies `claims_insert_own`, `claims_update_own`,
`claims_delete_own` en `claim_requests_insert_own` bevatten `and not (select app.is_mfa_admin())`, zodat een admin met MFA ook
buiten de API om geen declaratie aanmaakt, wijzigt of verwijdert. Een admin met een `password`-sessie houdt `app.is_mfa_admin()` false en wordt in RLS niet geweerd;
hij wordt alleen door `can()` tegengehouden (bekend restant, OV-16).

### Statussen en overgangen

Waarden in database en contract (Engels, zoals `role` en de accountstatus): `draft`, `submitted`, `approved`, `rejected`,
`paid`, als tuple `CLAIM_STATUSES` in `src/shared/claims.ts` (bron voor `z.enum`, het filter en de CHECK-gelijkheidstest). Labels
in de UI: "Concept", "In behandeling", "Goedgekeurd", "Afgewezen", "Uitbetaald".

| Van | Naar | Wie | Route | Auditactie |
|---|---|---|---|---|
| (nieuw) | `draft` | eigenaar (`user`) | `POST /api/claims` met `indienen: false` | — |
| (nieuw) | `submitted` | eigenaar (`user`) | `POST /api/claims` met `indienen: true` | `claim.submit` |
| `draft` | `draft` (velden wijzigen) | eigenaar | `PATCH /api/claims/:id` met `indienen: false` | — |
| `draft` | `submitted` | eigenaar | `PATCH /api/claims/:id` met `indienen: true` | `claim.submit` |
| `draft` | (verwijderd) | eigenaar | `DELETE /api/claims/:id` | — |
| `submitted` | `approved` | admin met MFA, niet de eigenaar | `POST /api/claims/:id/approve` | `claim.approve` |
| `submitted` | `rejected` | admin met MFA, niet de eigenaar | `POST /api/claims/:id/reject` | `claim.reject` |
| `approved` | `paid` | admin met MFA, niet de eigenaar | `POST /api/claims/:id/mark-paid` | `claim.mark_paid` |

Elke andere overgang is verboden (`CLAIM_STATUS_INVALID`), ook terugtrekken (`submitted` → `draft`, OV-5) en heropenen van
`rejected` (OV-6). `rejected` en `paid` zijn eindstatussen. Omschrijving, bedrag en categorie wijzigen alleen in `draft`.

## Datawijzigingen (met grants)

Twee migraties, volgens het gouden pad: `db/migrations/<tijdstempel>_claims.sql` uit `pnpm new:resource claims` (tabelpatroon,
`scripts/kit/templates/migratie.sql.tmpl`, met de rij in `app.retention`) en een tweede `db/migrations/<tijdstempel>_claims_fields.sql`
met de velden, kolomgrants, CHECKs, aangepaste policies, de guard-trigger en de bonnetabel `app.claim_requests`.

### Tabel `public.claims`

RLS `enable` en `force`.

| Kolom | Type | Regel |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | brand `ClaimId` in `src/shared/ids.ts` en `db/ids.json` |
| `owner_id` | `text not null default app.current_user_id()` | `references better_auth."user"(id) on delete cascade` (OV-8); index |
| `created_at` | `timestamptz not null default now()` | |
| `description` | `text not null` | CHECK `char_length(description) between 1 and 200 and description ~ '[^[:space:]]'` (`MAX_CLAIM_DESCRIPTION_LENGTH` = 200, OV-9) |
| `amount_cents` | `integer not null` | CHECK `amount_cents between 1 and 500000` (`MAX_CLAIM_AMOUNT_CENTS` = 500000, € 5.000, OV-1) |
| `category` | `text not null` | CHECK `category in ('travel', 'food_drink', 'lodging', 'other')` (`CLAIM_CATEGORIES`, OV-4) |
| `status` | `text not null default 'draft'` | CHECK `status in ('draft', 'submitted', 'approved', 'rejected', 'paid')` (`CLAIM_STATUSES`) |
| `submitted_at` | `timestamptz` | gezet door de trigger; CHECK `(status = 'draft') = (submitted_at is null)` |
| `decided_at` | `timestamptz` | gezet door de trigger; CHECK `(status in ('approved', 'rejected', 'paid')) = (decided_at is not null)` |
| `paid_at` | `timestamptz` | gezet door de trigger; CHECK `(status = 'paid') = (paid_at is not null)` |

Index ook op `(status, created_at)` voor de adminlijst en het overzicht. Elke grens en elke set in een CHECK staat ook in
`src/shared/limits.ts` of `src/shared/claims.ts`, met een gelijkheidstest (R-CODE-07).

**Lengte: zod tegen Postgres.** zod `.max(200)` telt UTF-16-code-eenheden, `char_length` telt codepunten. Een teken buiten het
BMP (bijv. een emoji) telt in zod als 2 en in Postgres als 1. zod is dus nooit ruimer dan de CHECK: wat het contract doorlaat,
past altijd in de kolom; een omschrijving met emoji kan in de API eerder vol zijn dan de CHECK zegt. Bewust zo gelaten (geen
eigen telfunctie); de grenstest gebruikt ASCII, en een tweede test bewijst dat 100 emoji (200 code-eenheden) slagen en 101 niet.
zod `.trim()` haalt alle JS-witruimte weg vóór opslag; de CHECK `description ~ '[^[:space:]]'` weigert in de database een
omschrijving van alleen witruimte (`btrim` zonder argument haalt alleen spaties weg, daarom geen `btrim`).

**Grants** (alleen deze; niets aan `api_user`, `auth_service`, `PUBLIC`):
- `app_authenticated`: `select`, `delete`; `insert (description, amount_cents, category, status)`;
  `update (description, amount_cents, category, status)`. Nooit `id`, `owner_id`, `created_at`, `submitted_at`, `decided_at`,
  `paid_at` (review tabelpatroon, A1/A2).

**Policies** (namen van de generator; de tweede migratie past de vier `_own`-policies aan met `alter policy` en voegt twee toe):
- `claims_select_own` — `for select to app_authenticated using (owner_id = (select app.current_user_id()))`;
- `claims_select_admin` — `for select to app_authenticated using ((select app.is_mfa_admin()) and status <> 'draft')`;
- `claims_insert_own` — `for insert to app_authenticated with check (owner_id = (select app.current_user_id()) and status in ('draft', 'submitted') and not (select app.is_mfa_admin()))`;
- `claims_update_own` — `for update to app_authenticated using (owner_id = (select app.current_user_id()) and status = 'draft' and not (select app.is_mfa_admin()))`
  `with check (owner_id = (select app.current_user_id()) and status in ('draft', 'submitted') and not (select app.is_mfa_admin()))`;
- `claims_update_admin` — `for update to app_authenticated using ((select app.is_mfa_admin()) and owner_id <> (select app.current_user_id()) and status in ('submitted', 'approved'))`
  `with check ((select app.is_mfa_admin()) and owner_id <> (select app.current_user_id()) and status in ('approved', 'rejected', 'paid'))`;
- `claims_delete_own` — `for delete to app_authenticated using (owner_id = (select app.current_user_id()) and status = 'draft' and not (select app.is_mfa_admin()))`.

Geen policy met `using (true)` (review tabelpatroon, B2). `claims_delete_own` weert de admin met MFA net als `claims_insert_own` en
`claims_update_own`: een admin kan in een `password`-sessie wel een eigen concept aanmaken (RLS laat dat toe, OV-16), en zonder deze
voorwaarde zou hij dat concept daarna met MFA via SQL kunnen verwijderen. Een concept van een ander ziet hij niet.

**Guard-trigger** `claims_guard` (`before insert or update … for each row`) met triggerfunctie `app.claims_guard() returns trigger`:
eigenaar `app_definer`, geen security definer, `set search_path = ''`, volledig gekwalificeerd (patroon `app.audit_log_guard()`).
De trigger is de bron van waarheid voor de overgangstabel; de policies begrenzen de rijen. In deze volgorde:
1. insert: `status` niet in (`draft`, `submitted`) → `raise exception 'CLAIM_STATUS_INVALID'` (P0001); zet `submitted_at = now()`
   bij `submitted`, anders null; `decided_at` en `paid_at` null;
2. update met `old.status <> 'draft'` en een gewijzigde `description`, `amount_cents` of `category` → `CLAIM_STATUS_INVALID`;
3. update waarvan (`old.status`, `new.status`) niet in de overgangstabel staat (`draft`→`draft`, `draft`→`submitted`,
   `submitted`→`approved`, `submitted`→`rejected`, `approved`→`paid`) → `CLAIM_STATUS_INVALID`;
4. `draft`→`submitted` alleen als `owner_id = app.current_user_id()`; de drie adminovergangen alleen als `app.is_mfa_admin()` en
   `owner_id <> app.current_user_id()`; anders → `raise exception … using errcode = '42501'` (→ `FORBIDDEN`);
5. zet `submitted_at`, `decided_at` of `paid_at` op `now()` bij de bijbehorende overgang; laat ze anders gelijk aan `old`.

`P0001 'CLAIM_STATUS_INVALID'` wordt via de bestaande vertaling (`src/core/api/errors.ts`, app-code → 409) de foutcode.
Functiecatalogus (`db/tests/functies.sql`): `app.claims_guard()` klasse `intern`, reden "triggerfunctie van public.claims".

### Bonnetabel `app.claim_requests` (idempotentie, R-CODE-11)

In schema `app`, niet `public`: de securitysuite behandelt elke tabel in `public` met `owner_id` als resource met routes
(`eigenaarTabellen` in `test/security/controles.ts`), en deze tabel heeft geen eigen routes. Isolatie bewijst pgTAP (OV-14).
RLS `enable` en `force`.

| Kolom | Type | Regel |
|---|---|---|
| `owner_id` | `text not null default app.current_user_id()` | `references better_auth."user"(id) on delete cascade` |
| `request_id` | `uuid not null` | de `verzoekId` van de client |
| `payload_hash` | `text not null` | CHECK `payload_hash ~ '^[0-9a-f]{64}$'` (sha256, hex) |
| `claim_id` | `uuid not null` | geen foreign key: de bon blijft staan als tombstone wanneer het concept wordt verwijderd |
| `created_at` | `timestamptz not null default now()` | |

Primaire sleutel `(owner_id, request_id)`: dezelfde `verzoekId` van twee gebruikers botst niet en lekt niets.

- **Grants:** `app_authenticated`: `select`, `insert (request_id, payload_hash, claim_id)`. Geen `update`, geen `delete`.
- **Policies:** `claim_requests_select_own` — `for select to app_authenticated using (owner_id = (select app.current_user_id()))`;
  `claim_requests_insert_own` — `for insert to app_authenticated with check (owner_id = (select app.current_user_id()) and not (select app.is_mfa_admin()))`.
- **Bewaarcatalogus:** rij in `app.retention` ("verdwijnt met het account (owner_id, on delete cascade)"), in dezelfde migratie,
  met `no force`/`force` zoals het sjabloon (R-DB-17). Geen opruimen in deze ronde (geen runner, ST-03); één rij per aanmaak.
- **`db/ids.json`:** `app.claim_requests.claim_id` → `ClaimId`; `app.claim_requests.request_id` → `null` (UUID van de client, geen
  entiteit; zoals `app.audit_log.request_id`).

**Werkwijze in de handler van `POST /api/claims`**, binnen de ene routetransactie:
1. `select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(<actor-id> || ':' || <verzoekId>, 0))` — serialiseert
   gelijktijdige requests met dezelfde sleutel van dezelfde gebruiker; vrijgegeven bij commit of rollback.
2. `payload_hash` = `encode(pg_catalog.sha256(convert_to(jsonb_build_object('omschrijving', …, 'bedrag', …, 'categorie', …, 'indienen', …)::text, 'UTF8')), 'hex')`
   over de geparste (getrimde) invoer zonder `verzoekId`, in SQL berekend (jsonb normaliseert de sleutelvolgorde).
3. Bon met `(actor, verzoekId)` gevonden:
   - gelijke hash → geef `{ id: claim_id }` terug; geen nieuwe rij, geen nieuwe auditregel (herhaling);
   - andere hash → `REQUEST_ID_CONFLICT` (409).
   Dit geldt ook als het concept intussen is verwijderd: de bon is de tombstone, dus een late herhaling maakt geen nieuwe
   declaratie maar geeft het oude `id` terug; `GET` op dat id geeft dan `NOT_FOUND` (OV-15).
4. Geen bon → insert in `public.claims`, insert van de bon met het nieuwe `id`, en bij `indienen: true` `ctx.audit('claim.submit', id, {})`.

Geen core-mechanisme voor idempotentie bestaat (geen helper in `src/core`); de app bouwt dit in de handler (leerpunt, OV-17).
De overgangen (`PATCH`, `approve`, `reject`, `mark-paid`) krijgen geen bon: ze zijn voorwaardelijk op de status, dus een
herhaling wijzigt niets en geeft `CLAIM_STATUS_INVALID` (of bij een ongewijzigd concept dezelfde waarden); er wordt in deze app
geen geld overgemaakt (OV-18).

### Audit

Vier app-acties in `src/shared/audit.ts` via `defineAuditActions`: `claim.submit`, `claim.approve`, `claim.reject`,
`claim.mark_paid`, elk `target: 'claim'`, `details: z.object({}).strict()` (R-DB-15: details alleen ID's en enums; de actie zegt
de overgang). De route roept `ctx.audit(actie, id, {})` aan in dezelfde `tx`, ná de geslaagde update; faalt iets daarna, dan
draait de regel mee terug.

## Routes en foutcodes

Alle routes via `defineRoute` met contract in `src/shared/contracts/claims.ts` (input `.strict()`), handlers in
`src/api/routes/claims.ts`, geregistreerd in `src/api/app.ts`. Rate limit: standaard per methode (GET `lezen`, anders
`schrijven`). Nieuwe app-foutcodes in `src/shared/errors.ts` (app-code → 409), tekst in `src/web/copy/errors.ts`:
`CLAIM_STATUS_INVALID` en `REQUEST_ID_CONFLICT`. `REQUEST_ID_CONFLICT` staat in R-CODE-11 (framework §4) maar niet in de
foutcodes van core (`node scripts/kit/feiten.mjs foutcodes`); de app registreert hem zelf, zonder core-wijziging (OV-17).

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| GET | `/api/claims?q=&sort=&status=&cursor=` | `claims:read` | `UNAUTHENTICATED`, `RATE_LIMITED`, `VALIDATION`, `MFA_REQUIRED` |
| GET | `/api/claims/summary` | `claims:read` | `UNAUTHENTICATED`, `RATE_LIMITED`, `MFA_REQUIRED` |
| GET | `/api/claims/:id` | `claims:read` | `UNAUTHENTICATED`, `RATE_LIMITED`, `VALIDATION`, `MFA_REQUIRED`, `NOT_FOUND` |
| POST | `/api/claims` `{ verzoekId, omschrijving, bedrag, categorie, indienen }` | `claims:write` | `UNAUTHENTICATED`, `RATE_LIMITED`, `VALIDATION`, `FORBIDDEN`, `REQUEST_ID_CONFLICT` |
| PATCH | `/api/claims/:id` `{ id, omschrijving, bedrag, categorie, indienen }` | `claims:write` | `UNAUTHENTICATED`, `RATE_LIMITED`, `VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `CLAIM_STATUS_INVALID` |
| DELETE | `/api/claims/:id` | `claims:write` | `UNAUTHENTICATED`, `RATE_LIMITED`, `VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `CLAIM_STATUS_INVALID` |
| POST | `/api/claims/:id/approve` | `claims:review` | `UNAUTHENTICATED`, `RATE_LIMITED`, `VALIDATION`, `FORBIDDEN`, `MFA_REQUIRED`, `NOT_FOUND`, `CLAIM_STATUS_INVALID` |
| POST | `/api/claims/:id/reject` | `claims:review` | idem |
| POST | `/api/claims/:id/mark-paid` | `claims:review` | idem |

Plus `CSRF_REJECTED` en `PAYLOAD_TOO_LARGE` uit de algemene middleware voor de schrijvende routes, `NOT_FOUND` voor een pad dat
geen route is (bijv. `GET /api/claims/`: Hono routeert strikt, de `notFound`-handler in `src/core/api/http/create-app.ts` geeft
`NOT_FOUND`), en `INTERNAL_ERROR` bij een onverwachte fout.

**Contracten:**
- Item (lijst en detail): `{ id: ClaimId, omschrijving: string, bedrag: Cents, categorie: ClaimCategory, status: ClaimStatus,
  aangemaakt: string, ingediendOp: string | null, beslistOp: string | null, uitbetaaldOp: string | null, medewerker: string | null }`
  (tijden ISO 8601). `medewerker` = `name` uit `app.accounts` via left join; die view toont alleen rijen aan een admin met MFA, dus
  voor een `user` is het altijd null (de kolom staat dan ook niet op zijn scherm).
- `ClaimCategory` = `z.enum(CLAIM_CATEGORIES)` met `CLAIM_CATEGORIES = ['travel', 'food_drink', 'lodging', 'other'] as const`;
  `ClaimStatus` = `z.enum(CLAIM_STATUSES)`; beide tuples in `src/shared/claims.ts`.
- Create/update-velden: `omschrijving` `z.string().trim().min(1).max(MAX_CLAIM_DESCRIPTION_LENGTH)`; `bedrag` `Cents` met
  `min(1)` en `max(MAX_CLAIM_AMOUNT_CENTS)`; `categorie` `ClaimCategory`; `indienen` `z.boolean()` (verplicht). Alleen create:
  `verzoekId` `z.uuid()` (verplicht).
- Lijst: `claimsSearch = defineListSearch({ sorts: ['nieuwste', 'oudste'], filters: { status: CLAIM_STATUSES }, cursorKeys: … })`
  op `(created_at, id)` (de tuple, niet een zod-enum: `filters` in `src/core/shared/list-search.ts` neemt opties), paginagrootte
  `CLAIMS_PAGE_SIZE = 25`; `q` zoekt in `description` met `ilike`, `%`, `_` en `\` ge-escaped (spec lijstpagina).
- Summary: `{ inBehandeling: { aantal: number, bedrag: Cents }, goedgekeurd: { bedrag: Cents }, uitbetaald: { bedrag: Cents } }`,
  over de rijen die RLS de actor laat zien. `inBehandeling` = status `submitted` (alle tijd); `goedgekeurd` = status `approved` of
  `paid` met `decided_at >= $maandbegin`; `uitbetaald` = `paid_at >= $maandbegin`. Een som zonder rijen is 0.
  **Maandbegin:** de handler berekent het met `claimsMonthStart(now: Date): Date` (`src/api/domain/claims-month.ts`, pure logica zonder I/O, R-WERK-09):
  middernacht op de eerste dag van de kalendermaand van `now` in `Europe/Amsterdam` (OV-7), en geeft het als SQL-parameter mee; de SQL rekent
  zelf geen tijdzone. De functie gebruikt `Intl.DateTimeFormat` (geen dependency).
- Output van PATCH, DELETE en de drie adminroutes: `z.null()`; van POST: `{ id: ClaimId }` (ook bij een herhaling).

**Padparameter `:id`** (GET, PATCH, DELETE, approve, reject, mark-paid): vorm UUID. Schema in het contract:
`claimIdParam = z.uuid().pipe(ClaimId)` — `z.uuid()` controleert de vorm, `ClaimId` (`brandedId`) alleen de lengte en het type.
Alle zes contracten gebruiken hetzelfde `claimIdParam`. Validatiemoment: contractvalidatie in `routeHandler`, vóór rol, permissie,
MFA en handler; een ongeldige vorm (ook `..%2F..%2Fx`, `summary` op een `:id`-route, een UUID met een extra teken) geeft
`VALIDATION`, en er gaat geen query op de rij naar de database (de transactie van de route kan wel al open zijn). Een lege waarde
bereikt de route niet (`/api/claims/` is geen route → `NOT_FOUND`); het schema weigert haar wel (unittest). Er is geen externe aanroep.

**Volgorde van registratie:** `GET /claims/summary` staat vóór `GET /claims/:id` in `src/api/app.ts`, zodat `summary` niet als
`:id` wordt gelezen (AC-23).

**Foutvolgorde** (bestaande kit, `routeHandler` in `src/core/api/http/create-app.ts`, `check` in `src/core/shared/can.ts`):
sessie → rate limit → contractvalidatie → rol/permissie (`FORBIDDEN`) → MFA → handler (`NOT_FOUND`, `CLAIM_STATUS_INVALID`,
`REQUEST_ID_CONFLICT`) → outputvalidatie. Geen nieuwe voor-stap.

**Handler: bestaan en status onderscheiden.** De handler voert een overgang uit met een voorwaardelijke update
(`update … where id = $1 and status = <verwacht> returning id`). Raakt die 0 rijen, dan leest hij de rij in dezelfde `tx`:
niet zichtbaar → `NOT_FOUND`; zichtbaar met een andere status → `CLAIM_STATUS_INVALID`. Een rij van een ander (voor een `user`)
of een concept van een ander (voor een admin) is niet zichtbaar en geeft dus `NOT_FOUND`, gelijk aan een onbekend ID (geen
enumeratie). Twee gelijktijdige overgangen op dezelfde rij: de tweede wacht op de rijvergrendeling, ziet de nieuwe status en
krijgt `CLAIM_STATUS_INVALID`.

**Transactiegrens:** alles in de ene `withUser`-transactie van de route; geen `afterCommit`, geen externe aanroep.

## Koppeling

n.v.t. — geen externe dienst; bonupload (en dus bestandsopslag) valt buiten deze ronde.

## Kopieer de vorm van

- `src/shared/contracts/accounts.ts` — contract met `defineContract`, `.strict()` input, `defineListSearch` met `cursorKeys` en `encodeCursor`.
- `src/api/routes/accounts.ts` — `defineRoute` met `tx`, statusafhankelijke fout (`ALREADY_ACTIVE` → hier `CLAIM_STATUS_INVALID`), lijstquery met cursor en ge-escapete `q`.
- `scripts/kit/templates/migratie.sql.tmpl` — tabelpatroon met eigenaar, RLS, grants, policies en `app.retention`.
- `db/tests/user_roles.sql` — pgTAP-assert per policy op naam.
- `db/tests/audit_log.sql` — trigger- en weigeringstests (42501, P0001), een trigger uitzetten in een teruggedraaide transactie, en "geen regel na rollback".
- `test/api/accounts.int.test.ts` — integratietests per verboden rol, admin zonder MFA, ongeldige input.
- `test/api/accounts-audit.int.test.ts` — auditregel met `request_id` van de response, geen regel bij een geweigerde actie.
- `test/api/account-audit-race.int.test.ts` — racetest met gelijktijdige requests tegen de echte database.
- `src/web/features/accounts/queries.ts` — key-factory met search in de key, mutaties die invalideren.
- `src/web/features/accounts/accounts-page.tsx` — lijstpagina met `ListToolbar`, `AsyncView`, `Table`, statusfilter.
- `src/web/features/accounts/invite-dialog.tsx` — `<Form>` met gedeeld zod-schema en serverfouten via `setError`.
- `src/web/routes/_app/admin/accounts.tsx` — bestandsroute met `guard('<permissie>')` en ErrorBoundary.
- `e2e/accounts.spec.ts` — e2e per AC met axe op 375 en 1280 px.

## Hergebruik en UX

- **Bestaande componenten** (`feiten.mjs componenten`): `PageHeader`, `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`
  (metric en paneel), `Table` (`TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`), `ListToolbar`, `AsyncView`,
  `EmptyState`, `StatusBadge` (tone per status: `draft` `neutral`, `submitted` `warning`, `approved` `success`, `rejected`
  `destructive`, `paid` `accent`), `DescriptionList`, `Form`/`FormField`, `Input`, `Select`, `Button` (`primary`, `secondary`,
  `outline`, `destructive`), `ConfirmDialog`, `UnsavedChangesGuard`, `FormErrorSummary`, `NotFound`, `Stack`/`Inline`, `Text`,
  `Heading`; toasts via `useToast().success/error`; bedragen en datums via `format.cents` en `format.date`
  (`src/core/web/lib/format.ts`). Geen nieuw component nodig; past het Claimly-uiterlijk niet in een bestaande variant, dan stelt de
  stap `ontwerp-overnemen` een variant voor (R-UI-03). Bedraginvoer: `Input` met `inputMode="decimal"`; het omzetten van "12,50"
  naar `Cents` gebeurt in een gedeeld schema in `src/shared/schemas/claims.ts` (geen core-wijziging).
- **`verzoekId` in de web:** het nieuw-formulier maakt bij openen één `crypto.randomUUID()` en stuurt die bij elke verzendpoging
  van dat formulier mee (ook na een netwerkfout of dubbelklik); na een geslaagde aanmaak navigeert het weg, dus een volgende
  declaratie krijgt een nieuwe sleutel. `REQUEST_ID_CONFLICT` kan alleen ontstaan als de invoer tussen twee pogingen wijzigt terwijl
  de eerste al slaagde: het formulier toont de fouttekst en maakt een nieuwe sleutel.
- **Schermen en routes** (web): de generator maakt `src/web/routes/_app/claims.tsx` (URL `/claims`) en het menu-item `/claims`;
  de spec wil Nederlandse URL's. De bouw-PR verplaatst de route naar `src/web/routes/_app/declaraties/` (`index.tsx`, `nieuw.tsx`,
  `$id.tsx`, `$id.bewerken.tsx`), zet `href` in `src/web/lib/nav.ts` op `/declaraties` en genereert `src/web/routeTree.gen.ts`
  opnieuw (nooit met de hand, R-REPO-03). De code-map blijft `src/web/features/claims/` (code Engels, R-CODE-10).
  - `/` — Overzicht (vervangt de lege Home, OV-10); guard `claims:read`.
  - `/declaraties` — lijst; guard `claims:read`.
  - `/declaraties/nieuw` — formulier; guard `claims:write`.
  - `/declaraties/$id` — detail met acties; guard `claims:read`.
  - `/declaraties/$id/bewerken` — formulier; guard `claims:write`.
  - Menu (`src/web/lib/nav.ts`): "Overzicht" (`/`, `claims:read`), "Declaraties" (`/declaraties`, `claims:read`); "Dashboard"
    voor de admin blijft.
- **Staten per scherm:**
  - Overzicht: laden (`AsyncView`), fout (`AsyncView`), leeg (metrics op € 0,00 en lege-tabeltekst), gelukt. Verouderd: n.v.t.
  - Lijst: laden, leeg, leeg na filter, fout, "Meer laden" bezig. Verouderd: n.v.t. (`placeholderData` houdt de vorige pagina zichtbaar).
  - Detail: laden, fout, niet gevonden (`NotFound`), actie bezig (knop `busy`), gelukt (toast), `CLAIM_STATUS_INVALID` (fouttoast,
    data opnieuw laden).
  - Formulier: leeg/gevuld, veldfouten, bezig (beide verzendknoppen uit), gelukt (toast en naar het detail), serverfout
    (`setError`/`FormErrorSummary`), `REQUEST_ID_CONFLICT` (fouttekst boven het formulier), niet gevonden of geen concept meer
    (bewerken: `NOT_FOUND` → `NotFound`, `CLAIM_STATUS_INVALID` → fouttoast en naar het detail).
- **Alle zichtbare tekst letterlijk** (in `src/web/copy/ui.ts`, foutteksten in `src/web/copy/errors.ts`):

| Plek | Tekst |
|---|---|
| Menu | "Overzicht", "Declaraties" |
| Rollabel `user` | "Medewerker" (OV-2, overal) |
| Statussen | "Concept", "In behandeling", "Goedgekeurd", "Afgewezen", "Uitbetaald" |
| Categorieën | `travel` "Reiskosten", `food_drink` "Eten & drinken", `lodging` "Verblijf", `other` "Overig" (OV-4) |
| Overzicht | titel "Overzicht"; beschrijving `user` "Je declaraties en vergoedingen op één plek.", admin "Ingediende declaraties van het team op één plek."; knop "Nieuwe declaratie" (alleen met `claims:write`) |
| Metrics | "In behandeling" met onderregel "{n} declaratie in behandeling" (n = 1) of "{n} declaraties in behandeling"; "Goedgekeurd" met onderregel "Deze maand"; "Uitbetaald" met onderregel "Deze maand" |
| Recente declaraties | titel "Recente declaraties"; beschrijving `user` "Je laatste declaraties", admin "Laatst ingediende declaraties"; link "Alle declaraties"; de eerste 5 van de lijst, sortering `nieuwste` (`OVERVIEW_RECENT_COUNT = 5`) |
| Tabel (overzicht en lijst) | kolommen "Omschrijving" (met de categorie eronder), "Bedrag", "Datum" (= aangemaakt, `format.date`), "Status"; voor de admin ook "Medewerker" (bij `medewerker` null: "Onbekend account"; met `on delete cascade` niet bereikbaar, alleen een terugval voor het type) |
| Lijst | titel "Declaraties"; knop "Nieuwe declaratie" (alleen met `claims:write`); zoeken "Zoeken", hint "Zoek op omschrijving."; filter "Alle statussen"; sorteren "Sorteren", "Nieuwste eerst", "Oudste eerst"; leeg "Nog geen declaraties."; leeg na filter "Geen declaraties gevonden. Pas je zoekopdracht of filters aan."; "Meer laden"; "Bezig met laden…"; telling "{n} declaraties getoond." met " Er zijn er meer." |
| Detail | titel = omschrijving; velden "Bedrag", "Categorie", "Status", "Aangemaakt", "Ingediend", "Beslist", "Uitbetaald" (de laatste drie alleen als gezet), admin ook "Medewerker"; terug-link "Alle declaraties" |
| Detail, eigenaar bij concept | knoppen "Bewerken", "Indienen", "Verwijderen" |
| Detail, admin bij `submitted` | knoppen "Goedkeuren", "Afwijzen" |
| Detail, admin bij `approved` | knop "Markeren als uitbetaald" |
| Bevestigen indienen | titel "Declaratie indienen?"; tekst "Na indienen kun je de declaratie niet meer wijzigen."; knoppen "Indienen", "Annuleren" |
| Bevestigen verwijderen | titel "Concept verwijderen?"; tekst "Dit concept wordt definitief verwijderd."; knoppen "Verwijderen", "Annuleren" |
| Bevestigen goedkeuren | titel "Declaratie goedkeuren?"; tekst "{bedrag} voor {omschrijving}. Dit kun je niet terugdraaien."; knoppen "Goedkeuren", "Annuleren" |
| Bevestigen afwijzen | titel "Declaratie afwijzen?"; tekst "De medewerker kan deze declaratie daarna niet meer wijzigen of opnieuw indienen."; knoppen "Afwijzen", "Annuleren" |
| Bevestigen uitbetaald | titel "Markeren als uitbetaald?"; tekst "Doe dit pas nadat het bedrag is overgemaakt."; knoppen "Markeren als uitbetaald", "Annuleren" |
| Formulier | titel "Nieuwe declaratie" resp. "Declaratie bewerken"; velden "Omschrijving" (placeholder "Bijv. Treinreis Amsterdam"), "Bedrag (€)" (placeholder "0,00"), "Categorie" (eerste optie "Kies een categorie"); knoppen "Opslaan als concept", "Indienen", "Annuleren" |
| Validatie | "Vul een omschrijving in."; "De omschrijving is te lang (maximaal {max} tekens)."; "Vul een bedrag in."; "Vul een bedrag in euro's in, bijvoorbeeld 12,50."; "Het bedrag moet groter zijn dan € 0,00."; "Het bedrag mag hoogstens {max} zijn." (`format.cents`, dus "€ 5.000,00"); "Kies een categorie." |
| Toasts | "Declaratie opgeslagen als concept."; "Declaratie ingediend."; "Concept verwijderd."; "Declaratie goedgekeurd."; "Declaratie afgewezen."; "Declaratie gemarkeerd als uitbetaald." |
| Fout `CLAIM_STATUS_INVALID` | "De status van deze declaratie is intussen gewijzigd. Vernieuw de pagina." |
| Fout `REQUEST_ID_CONFLICT` | "Deze declaratie is al verstuurd met andere gegevens. Controleer je declaraties en probeer het opnieuw." |

- **Focusvolgorde en toetsenbord:** Overzicht: knop "Nieuwe declaratie", metrics (niet focusbaar), tabelrijen (omschrijving is een
  link naar het detail), "Alle declaraties". Formulier: focus start op "Omschrijving"; Enter in een veld = "Opslaan als concept"
  (de veilige keuze, OV-11); "Indienen" vraagt eerst de bevestiging; na een fout gaat de focus naar `FormErrorSummary`;
  `UnsavedChangesGuard` bij weggaan met wijzigingen. Detail: actieknoppen in de volgorde van de tabel hierboven; `ConfirmDialog`
  vangt de focus, Esc annuleert, focus terug op de knop. Na verwijderen gaat de focus naar de h1 van `/declaraties`.

## Acceptatiecriteria

Medewerker = seed-account met rol `user`; admin = seed-admin met MFA-sessie, tenzij anders vermeld.

- **claims/AC-1** — Gegeven een medewerker, wanneer hij "Treinreis Amsterdam", "48,50", "Reiskosten" opslaat als concept, dan
  bestaat er één rij met `amount_cents` 4850, `category` `travel`, `status` `draft`, `submitted_at` null, één bon in
  `app.claim_requests` met dat `claim_id`, toont het detail "Concept", en staat er geen auditregel `claim.submit`.
- **claims/AC-2** — Gegeven een concept van de medewerker, wanneer hij het indient en bevestigt, dan is de status `submitted`,
  `submitted_at` gezet, toont het detail "In behandeling" zonder knoppen "Bewerken", "Indienen" of "Verwijderen", en staat er precies
  één auditregel `claim.submit` met `target_type` `claim`, `target_id` = het id, `actor_id` = de medewerker en `request_id` = de
  `X-Request-Id` van de response.
- **claims/AC-3** — Gegeven het formulier, wanneer de medewerker direct "Indienen" kiest en bevestigt, dan is de nieuwe rij
  `submitted` met één auditregel `claim.submit`.
- **claims/AC-4** — Gegeven een concept, wanneer de medewerker omschrijving, bedrag en categorie wijzigt (`PATCH`, `indienen: false`),
  dan zijn de nieuwe waarden opgeslagen en is de status `draft`.
- **claims/AC-5** — Gegeven een declaratie met status `submitted`, `approved`, `rejected` of `paid` van de medewerker, wanneer hij
  `PATCH` of `DELETE` aanroept, dan krijgt hij 409 `CLAIM_STATUS_INVALID` en is de rij ongewijzigd.
- **claims/AC-6** — Gegeven een concept, wanneer de medewerker het verwijdert en bevestigt, dan is de rij weg, staat de bon er nog
  (tombstone), komt hij op `/declaraties` en ziet hij "Concept verwijderd.".
- **claims/AC-7** — Gegeven een ingediende declaratie van medewerker M, wanneer een admin met MFA "Goedkeuren" bevestigt, dan is de
  status `approved`, `decided_at` gezet, en staat er één auditregel `claim.approve` met `actor_id` = de admin.
- **claims/AC-8** — Gegeven een ingediende declaratie, wanneer de admin "Afwijzen" bevestigt, dan is de status `rejected`,
  `decided_at` gezet, één auditregel `claim.reject`, en ziet de medewerker "Afgewezen" zonder actieknoppen.
- **claims/AC-9** — Gegeven een goedgekeurde declaratie, wanneer de admin "Markeren als uitbetaald" bevestigt, dan is de status
  `paid`, `paid_at` gezet en staat er één auditregel `claim.mark_paid`.
- **claims/AC-10** — Gegeven een declaratie in `draft`, `approved`, `rejected` of `paid`, wanneer de admin `approve` of `reject`
  aanroept, dan krijgt hij `NOT_FOUND` (voor `draft`, onzichtbaar) of `CLAIM_STATUS_INVALID` (overige), zonder auditregel; idem
  `mark-paid` op `submitted`, `rejected` of `paid` → `CLAIM_STATUS_INVALID`.
- **claims/AC-11** — Gegeven medewerkers A en B met elk twee declaraties, wanneer B `GET`, `PATCH` of `DELETE` op een id van A doet,
  dan krijgt B `NOT_FOUND`, gelijk aan een onbekend UUID, en toont `GET /api/claims` voor B alleen eigen rijen (securitysuite,
  `test/security/resources.ts`).
- **claims/AC-12** — Gegeven een concept van medewerker M, wanneer de admin `GET /api/claims/:id` of `approve` op dat id doet of de
  lijst opvraagt, dan krijgt hij `NOT_FOUND` resp. staat het concept niet in de lijst.
- **claims/AC-13** — Gegeven een admin met MFA, wanneer hij `POST /api/claims`, `PATCH` of `DELETE` aanroept, dan krijgt hij
  `FORBIDDEN`; een admin zonder MFA krijgt op dezelfde routes ook `FORBIDDEN`.
- **claims/AC-14** — Gegeven een medewerker, wanneer hij `approve`, `reject` of `mark-paid` aanroept (ook op zijn eigen ingediende
  declaratie), dan krijgt hij `FORBIDDEN`, is de rij ongewijzigd en staat er geen auditregel.
- **claims/AC-15** — Gegeven een admin zonder MFA (sessie `password`), wanneer hij `GET /api/claims`, `GET /api/claims/summary`,
  `GET /api/claims/:id` of een `claims:review`-route aanroept, dan krijgt hij `MFA_REQUIRED`.
- **claims/AC-16** — Gegeven een anonieme bezoeker, wanneer hij een van de negen routes aanroept, dan krijgt hij `UNAUTHENTICATED`;
  en `/`, `/declaraties` en subroutes sturen hem naar `/login`.
- **claims/AC-17** — Maandgrens, in twee delen:
  (a) unit: `claimsMonthStart` geeft voor `2026-12-31T23:30:00Z` `2026-12-31T23:00:00Z` (1 januari 2027, 00:00 CET), voor
  `2026-10-31T22:30:00Z` `2026-09-30T22:00:00Z` (1 oktober, 00:00 CEST, de wintertijd begon op 25 oktober), voor
  `2026-03-31T22:30:00Z` `2026-03-31T22:00:00Z` (1 april, 00:00 CEST) en voor `2026-11-05T12:00:00Z` `2026-10-31T23:00:00Z`;
  (b) integratie: de test berekent `M = claimsMonthStart(new Date())` en maakt voor een medewerker: 2 × `submitted` (€ 10,00 en
  € 5,50), `approved` met `decided_at = M` (€ 20,00), `approved` met `decided_at = M − 1 s` (€ 99,00), `paid` met `decided_at` en
  `paid_at = M + 1 s` (€ 7,00; niet later, zodat het tijdstip ook op de eerste dag van de maand niet in de toekomst ligt), `paid`
  met `decided_at` en `paid_at = M − 1 s` (€ 50,00), en 1 × `draft`. De historische tijdstempels zet de test als eigenaar
  (`app_migrator`), binnen de terugdraaiende transactie van de testkit, in deze volgorde: `alter table public.claims no force row
  level security` (onder FORCE RLS kan ook de eigenaar niet schrijven; patroon "FORCE uit als eigenaar, alleen in deze transactie"
  in `db/tests/retention.sql`), dan `alter table public.claims disable trigger claims_guard`, de directe `insert`s met
  `owner_id` = de medewerker, en daarna `enable trigger claims_guard` en `force row level security`; de rollback draait alles
  terug en de CHECKs blijven gelden. Dan geeft `GET /api/claims/summary` voor de medewerker `inBehandeling` { aantal 2, bedrag 1550 },
  `goedgekeurd` 2700 en `uitbetaald` 700. (Geen UI-deel: dat is AC-36.)
- **claims/AC-18** — Gegeven declaraties van twee medewerkers, wanneer de admin `/` opent, dan tellen de metrics de rijen van beiden
  zonder concepten, en toont de tabel de kolom "Medewerker" met hun namen.
- **claims/AC-19** — Gegeven een medewerker zonder declaraties, wanneer hij `/` opent, dan tonen de drie metrics € 0,00,
  "0 declaraties in behandeling" en de tabel "Nog geen declaraties.".
- **claims/AC-20** — Gegeven de lijst, wanneer de medewerker filtert op "Goedgekeurd", zoekt op "trein" of sorteert "Oudste eerst",
  dan staan filter, zoekterm en sortering in de URL, kloppen de rijen, en geeft een herlaad dezelfde weergave; meer dan 25 rijen
  geeft "Meer laden" zonder dubbele rij.
- **claims/AC-21** — Gegeven `POST /api/claims`, wanneer `bedrag` 0, negatief, een breuk (`12.5`), een string of 500001 is, of
  `omschrijving` leeg, alleen witruimte of 201 ASCII-tekens lang is, of `categorie` buiten de vier, of `indienen` of `verzoekId`
  ontbreekt, of `verzoekId` geen UUID is, of er een onbekend veld (`status`, `ownerId`) in staat, dan krijgt hij `VALIDATION` en
  bestaat er geen nieuwe rij en geen bon; 500000 cent en precies 200 ASCII-tekens slagen; 100 emoji slagen en 101 emoji geven
  `VALIDATION`.
- **claims/AC-22** — Gegeven het formulier, wanneer de medewerker "12,5", "12,50", "1.234,56" of "€ 3" invult, dan wordt het bedrag
  1250, 1250, 123456 resp. 300 cent; "12,505", "abc" en "-1" geven de validatietekst van de tabel en geen request. Daarnaast geldt
  voor elke `c` in 1..`MAX_CLAIM_AMOUNT_CENTS` uit de deterministische steekproef (alle waarden 1..10000, elke 997e daarboven en de
  grens) dat parsen van de weergave van `c` (met en zonder "€ " en duizendtalpunt) weer `c` geeft.
- **claims/AC-23** — Padparameter:
  (a) `GET /api/claims/summary` geeft de summary, geen `VALIDATION`;
  (b) `PATCH /api/claims/summary`, `DELETE /api/claims/summary` en `POST /api/claims/summary/approve` geven `VALIDATION`;
  (c) `GET`, `PATCH`, `DELETE` en `approve` met `:id` = `not-a-uuid`, `..%2F..%2Fx` of een geldig UUID met één extra teken geven
  `VALIDATION`, ook voor een medewerker op `approve` (contract vóór permissie) en nooit `NOT_FOUND`: de handler draait niet, dus er
  gaat geen query op de rij;
  (d) `GET /api/claims/` en `PATCH /api/claims/` geven `NOT_FOUND` (strikte routering);
  (e) unit: `claimIdParam` weigert de lege string, `summary` en een UUID met een extra teken, en accepteert een geldig UUID.
- **claims/AC-24** — Gecombineerde foutgevallen (één test per regel):

| Samen optredende situaties | Verwachte uitkomst |
|---|---|
| Geen sessie en ongeldige `:id` op `approve` | `UNAUTHENTICATED` |
| Geldige sessie, rate limit `schrijven` overschreden en ongeldige `:id` op `PATCH` | `RATE_LIMITED` |
| Medewerker, ongeldige `:id` op `approve` | `VALIDATION` (contract vóór permissie) |
| Medewerker, geldig maar onbekend UUID op `approve` | `FORBIDDEN` (niet `NOT_FOUND`) |
| Admin zonder MFA, geldig UUID van een concept op `approve` | `MFA_REQUIRED` |
| Admin zonder MFA, ongeldige `:id` op `approve` | `VALIDATION` |
| Admin met MFA, id van een concept van een ander op `reject` | `NOT_FOUND` |
| Admin met MFA, id van een `paid` declaratie op `approve` | `CLAIM_STATUS_INVALID` |
| Admin met MFA of zonder MFA, geldige input op `POST /api/claims` | `FORBIDDEN` |
| Medewerker B, id van een `submitted` declaratie van A op `PATCH` | `NOT_FOUND` (niet `CLAIM_STATUS_INVALID`) |
| Medewerker, bestaande `verzoekId` met andere invoer én `bedrag` 0 | `VALIDATION` (contract vóór de bon) |
| Admin met MFA, `verzoekId` van een bon van een medewerker | `FORBIDDEN` (geen bon gelezen) |

- **claims/AC-25** — Gegeven twee gelijktijdige `approve`-requests op dezelfde ingediende declaratie, dan slaagt er precies één, krijgt
  de ander `CLAIM_STATUS_INVALID`, en staat er precies één auditregel `claim.approve`.
- **claims/AC-26** — Overgang en auditregel vallen in één transactie. Het mechanisme (`ctx.audit` schrijft in de `tx` van de route;
  een fout daarna draait beide terug) bewijst core al in `test/audit/ctx-audit.int.test.ts` (spec audit-log, AC-31). Voor claims:
  in een testkit-transactie als de medewerker voert de test dezelfde statements uit als de handler van indienen (de update naar
  `submitted` en `select app.audit('claim.submit', 'claim', <id>, '{}')`), gooit daarna een fout en rolt terug; daarna is de status
  `draft` en staat er geen regel `claim.submit` voor dat id.
- **claims/AC-27** — Database (pgTAP), los van de API. Volgorde in Postgres: kolomgrant, dan `using` (welke rijen een update of
  delete raakt), dan de BEFORE-trigger `claims_guard` per geraakte rij, dan `with check`. Een verboden overgang op een rij die de
  `using` doorlaat, faalt dus met P0001 `CLAIM_STATUS_INVALID` uit de trigger, vóór de `with check`.
  - als medewerker:
    - P0001 `CLAIM_STATUS_INVALID` (trigger): `update` van een eigen concept naar `approved`, `rejected` of `paid`; `insert` met `status` `approved`;
    - 42501 (kolomgrant): `update` van `owner_id`, `submitted_at`, `decided_at` of `paid_at`;
    - 0 rijen (`using`): wijziging van `description` op een eigen `submitted` rij (`claims_update_own`), `delete` van een eigen
      `submitted` rij (`claims_delete_own`), `select` van een bon van een ander (`claim_requests_select_own`);
  - als admin met MFA:
    - 42501 (`with check`): `insert` in `public.claims` met `status` `draft` (de trigger laat `draft` door; `claims_insert_own` met
      `not app.is_mfa_admin()` weigert); `insert` in `app.claim_requests` (`claim_requests_insert_own`, geen trigger);
    - P0001 `CLAIM_STATUS_INVALID` (trigger): op de `approved` rij van een ander `approved` → `submitted` (de `using` van
      `claims_update_admin` laat de rij door);
    - 0 rijen (`using`): `update` van een eigen concept of eigen `submitted` rij — de rij is aangemaakt door dezelfde admin in een
      `password`-sessie (dat staat RLS toe, zie OV-16) — (`claims_update_own` weert de MFA-admin, `claims_update_admin` eist een ander
      als eigenaar); `rejected` → `paid` op de rij van een ander (`claims_update_admin` laat alleen `submitted` en `approved` door);
      `delete` van een eigen concept dat dezelfde admin in een `password`-sessie aanmaakte (`claims_delete_own` met
      `not app.is_mfa_admin()`; de rij bestaat na de poging nog);
  - als admin zonder MFA: `insert`, `update` en `delete` van een eigen concept slagen in RLS (bekend restant, OV-16; de API weigert
    met `FORBIDDEN`, AC-13).
  - De `with check` van een policy los bewijzen (bijv. `claims_update_own` tegen `approved`, `claims_update_admin` tegen `submitted`):
    in een teruggedraaide transactie zet de test als eigenaar `alter table public.claims disable trigger claims_guard` en verwacht dan
    42501; daarna `enable trigger`.
- **claims/AC-28** — Gegeven een account met declaraties, wanneer het account wordt verwijderd, dan zijn de declaraties en de bonnen
  weg (`on delete cascade`, OV-8) en blijven de auditregels staan.
- **claims/AC-29** — Gegeven een admin met MFA, wanneer hij `/declaraties/nieuw` of `/declaraties/$id/bewerken` opent, dan ziet hij
  "Je hebt geen toegang tot deze pagina."; op `/` en `/declaraties` staat voor hem geen knop "Nieuwe declaratie".
- **claims/AC-30** — Gegeven een account met rol `user`, dan toont de UI "Medewerker" in de accountlijst van de admin en in de
  dev-rolwisselaar (e2e `e2e/claims.spec.ts`), het menu per rol volgt `src/web/routes.test.tsx`, en de woordenlijsttest blijft groen.
- **claims/AC-31** — Idempotentie, herhaling: gegeven een geslaagde `POST /api/claims` met `verzoekId` V, wanneer dezelfde medewerker
  hetzelfde request (zelfde V en invoer) opnieuw stuurt, dan krijgt hij hetzelfde `{ id }`, is er één rij, één bon en (bij
  `indienen: true`) één auditregel `claim.submit`.
- **claims/AC-32** — Idempotentie, conflict: gegeven een geslaagde aanmaak met V, wanneer dezelfde medewerker V stuurt met een ander
  bedrag, een andere omschrijving, categorie of `indienen`, dan krijgt hij 409 `REQUEST_ID_CONFLICT`, is er geen tweede rij en is de
  bestaande rij ongewijzigd. Een omschrijving die alleen in omringende witruimte verschilt, is gelijk (hash over de getrimde invoer).
- **claims/AC-33** — Idempotentie per gebruiker: gegeven V van medewerker A, wanneer medewerker B V gebruikt, dan krijgt B een eigen
  nieuwe declaratie (geen conflict, geen id van A).
- **claims/AC-34** — Tombstone: gegeven een concept aangemaakt met V en daarna verwijderd, wanneer V met dezelfde invoer opnieuw komt,
  dan ontstaat er geen nieuwe rij, krijgt de client het oude `{ id }`, en geeft `GET` op dat id `NOT_FOUND` (OV-15).
- **claims/AC-35** — Racetest: gegeven twee gelijktijdige `POST /api/claims` van dezelfde medewerker met dezelfde V en invoer
  (`indienen: true`), dan krijgen beide hetzelfde `{ id }`, is er één rij, één bon en één auditregel; met dezelfde V en verschillende
  invoer slaagt er precies één en krijgt de ander `REQUEST_ID_CONFLICT`. Zonder advisory lock zou de tweede op de primaire sleutel
  van de bon falen (`ALREADY_EXISTS`); de test faalt dan.
- **claims/AC-36** — Metrics in de UI (e2e, echte stack, data van de huidige maand via de API): gegeven een nieuwe medewerker die via
  `POST /api/claims` drie declaraties indient (€ 10,00, € 5,50 en € 20,00, `indienen: true`) en een admin met MFA die de declaratie
  van € 20,00 via `approve` goedkeurt, wanneer de medewerker `/` opent, dan toont "In behandeling" "€ 15,50" met "2 declaraties in
  behandeling", "Goedgekeurd" "€ 20,00" en "Uitbetaald" "€ 0,00"; nadat de admin dezelfde declaratie via `mark-paid` als uitbetaald
  markeert en de medewerker herlaadt, toont "Goedgekeurd" "€ 20,00" en "Uitbetaald" "€ 20,00". De maandgrens zelf bewijst AC-17,
  niet deze test.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Declaratie van een ander lezen, wijzigen, verwijderen | bestaat niet, gelijk aan onbekend id | `NOT_FOUND` |
| Admin opent een concept van een ander | bestaat niet | `NOT_FOUND` |
| Wijzigen of verwijderen van een niet-concept | geweigerd, rij ongewijzigd | `CLAIM_STATUS_INVALID` |
| Admin keurt goed terwijl de medewerker nog net wijzigt | de wijziging slaagt alleen in `draft`; een admin ziet geen `draft`; geen conflict mogelijk | — |
| Twee admins behandelen tegelijk | precies één slaagt | `CLAIM_STATUS_INVALID` |
| Detail open, intussen door een ander behandeld | actie geweigerd, fouttoast, data opnieuw geladen | `CLAIM_STATUS_INVALID` |
| Bewerkscherm van een declaratie die intussen is ingediend (ander tabblad) | opslaan geweigerd, fouttoast, naar het detail | `CLAIM_STATUS_INVALID` |
| Dubbelklik of netwerkherhaling op aanmaken | zelfde `verzoekId`, zelfde `{ id }`, één rij | — |
| Zelfde `verzoekId`, andere invoer | geweigerd | `REQUEST_ID_CONFLICT` |
| Herhaling na verwijderen van het concept | geen nieuwe rij, oud `{ id }` (tombstone) | — |
| Account van de medewerker verwijderd | declaraties en bonnen weg (cascade); auditregels blijven met het oude id | — |
| `medewerker` null voor een admin | niet bereikbaar zolang de cascade geldt; terugval "Onbekend account" | — |
| Bedrag precies op de grens / 1 cent erboven | slaagt / geweigerd | — / `VALIDATION` |
| Omschrijving met alleen witruimte | geweigerd (zod trim, CHECK `[^[:space:]]`) | `VALIDATION` |
| Omschrijving met emoji | zod telt UTF-16, strenger dan `char_length`; nooit een CHECK-fout | `VALIDATION` boven de zod-grens |
| Cursor van een andere sortering of vreemde cursor | geweigerd | `VALIDATION` |
| `q` met `%`, `_` of `\` | letterlijk gezocht | — |
| Admin opent de declaratielijst zonder ingediende declaraties | lege lijst, "Nog geen declaraties." | — |
| Admin met `password`-sessie probeert via SQL aan te maken | RLS laat het toe; de API weigert eerder (`can()`) | `FORBIDDEN` (API) |

## Raakt ook

- **Besluit-PR eerst:** bij twijfel kritiek (gegevensisolatie, nieuw RLS-model met admin-uitsluiting, een guard-trigger en een
  bonnetabel). Deze spec gaat als besluit-PR met alleen `docs/specs/` naar de eigenaar; de bouw volgt na de merge (R-WERK-07, ADR 0046).
- `pnpm new:resource claims --rollen user,admin` (na `goedgekeurd`, door de hoofdsessie) maakt contract, 501-handlers,
  generatormigratie, queries, pagina, route en menu-item; daarna de tweede migratie met velden en de bonnetabel. De generator kent
  alleen `claims:read` en `claims:write`; `claims:review` (alleen `admin`) en de beperking van `claims:write` tot `user` komen er met de
  hand bij. De route `src/web/routes/_app/claims.tsx` verhuist naar `src/web/routes/_app/declaraties/`, het menu-item naar
  `/declaraties`, en `src/web/routeTree.gen.ts` wordt opnieuw gegenereerd.
- `src/shared/permissions.ts` (drie permissies) met `src/shared/permissions.test.ts` (permissietest per verboden rol: `admin` op
  `claims:write`, `user` op `claims:review`; admin zonder MFA op `claims:read` en `claims:review`). Bestaande test; de wijziging
  staat met reden in de PR.
- `src/shared/errors.ts` (`CLAIM_STATUS_INVALID`, `REQUEST_ID_CONFLICT`), `src/web/copy/errors.ts` (teksten), `src/shared/audit.ts`
  (vier acties), `src/shared/limits.ts` (`CLAIMS_PAGE_SIZE`, `MAX_CLAIM_DESCRIPTION_LENGTH`, `MAX_CLAIM_AMOUNT_CENTS`,
  `OVERVIEW_RECENT_COUNT`; gelijkheidstest met de CHECKs), nieuw `src/shared/claims.ts` (`CLAIM_STATUSES`, `CLAIM_CATEGORIES`),
  `src/shared/ids.ts` (bestaat nog niet; `pnpm new:resource` maakt hem aan met `ClaimId`, `scripts/kit/new-resource.mjs`) en
  `db/ids.json` (de generator zet `public.claims.id`; met de hand erbij `app.claim_requests.claim_id` → `ClaimId` en
  `app.claim_requests.request_id` → `null`), nieuw `src/shared/schemas/claims.ts` (bedrag parsen).
- `src/shared/contracts/claims.ts`, `src/shared/contracts/index.ts`, `src/api/routes/claims.ts`, nieuw
  `src/api/domain/claims-month.ts` met `src/api/domain/claims-month.test.ts` ernaast, `src/api/app.ts` (volgorde summary vóór `:id`).
- `src/web/copy/ui.ts` (teksten, `roleLabels.user` → "Medewerker"), `src/web/lib/nav.ts` (menu, "Home" wordt "Overzicht"),
  `src/web/routes.test.tsx` (menu per rol; bestaande test, reden in de PR), `src/web/features/home/home-page.tsx` vervangen door het
  overzicht, nieuw `src/web/features/claims/*`, routes in `src/web/routes/_app/declaraties/`. Bestaande e2e en tests die "Home" of
  "Gebruiker" verwachten wijzigen mee (gedrag gewijzigd door deze spec; reden in de PR).
- `pnpm check:migrations` (twee nieuwe migraties, geen bestaande gewijzigd), `pnpm check:secdef` (geen nieuwe security definer;
  `app.claims_guard()` is er geen, de check moet groen blijven), `pnpm check:snapshot` (`db/schema.snapshot.sql`, `src/api/db/schema.ts`
  via `pnpm db:generate`).
- `pnpm test:db` en policies: nieuw `db/tests/claims.sql` (assert per policy op naam, ook `claim_requests_select_own` en
  `claim_requests_insert_own`; `check-policies`), `db/tests/functies.sql` (regel `app.claims_guard()` `intern`),
  `db/tests/invarianten.sql` (elke tabel heeft een rij in `app.retention`: de twee nieuwe tabellen vallen onder die bestaande
  controle; `db/tests/retention.sql` wijzigt niet), `db/tests/schrijfbaarheid.sql`
  (verplichte insertvelden van `public.claims` en `app.claim_requests`; de trigger zet `submitted_at`, dus een uitgevoerde probe met
  een geslaagde insert).
- `test/security/resources.ts`: regel `claims` in `resources`:
  `tabel: 'public.claims'`, `rol: 'user'`,
  `sample.create: { verzoekId: '<vast UUID 1>', omschrijving: 'beveiligingstest-a', bedrag: 1000, categorie: 'travel', indienen: false }`,
  `createTweede` (ander UUID, `beveiligingstest-b`, 2000), `spoof` (ander UUID, `beveiligingstest-spoof`), `update:
  { omschrijving: 'beveiligingstest-gewijzigd', bedrag: 1500, categorie: 'other', indienen: false }`,
  `rij: { description: 'beveiligingstest-rij', amount_cents: 1000, category: 'travel', status: 'draft' }` (API-veldnamen wijken af van de kolommen),
  `lijst: 'GET /claims'`. A en B gebruiken dezelfde vaste UUID's; de bon is per eigenaar, dus dat botst niet (AC-33). In
  `routeClassificatie`: `POST /claims` create, `GET /claims` list, `GET /claims/:id` read, `PATCH /claims/:id` update,
  `DELETE /claims/:id` delete (scope `eigenaar`, resource `claims`); `POST /claims/:id/approve`, `/reject`, `/mark-paid` scope
  `admin`; `GET /claims/summary` scope `eigen-account` (OV-12).
- Seed (`scripts/seed.mjs`): optioneel voorbeelddeclaraties voor het seed-account `user`; geen vereiste.
- `docs/ontwerp/claimly.md` (aparte stap `ontwerp-overnemen`), `docs/roadmap.md` ST-09 (stand), `CHANGELOG.md`.
- Leerpunten naar de template (`leerpunt`-issue, leerlus): `REQUEST_ID_CONFLICT` en een idempotentiehelper in core (OV-17), een
  scope voor aggregaatroutes in de securitysuite (OV-12), de hernoeming van generator-URL's (OV-19).

## Buiten scope

- **Bonupload en bijlagen** (bewust, besluit eigenaar): geen bestand, geen "Bon bijgevoegd", geen bestandsopslag-koppeling.
- Schermen **Uitbetalingen**, **Team** en **Instellingen** uit het referentieontwerp; de begroeting met naam en datum
  ("Goedemiddag, Bram") (OV-10).
- Afwijzingsreden of opmerkingen (OV-6), terugtrekken van een ingediende declaratie (OV-5), heropenen na afwijzing.
- Uitgavedatum als apart veld (OV-13); "Datum" is de aanmaakdatum.
- Opruimen van oude bonnen in `app.claim_requests` (wacht op de runner, ST-03).
- Bulkacties (meerdere tegelijk goedkeuren), export, betalingsbestanden, meerdere valuta, btw.
- Meldingen per e-mail bij een statuswijziging.
- Scherm voor de audit log (spec audit-log, eigen spec).
- Bewaartermijn voor de fiscus (OV-8), AVG-export en -verwijderen (ST-05).
- Het uiterlijk zelf: tokens en varianten (stap `ontwerp-overnemen`).

## Testplan

Tester schrijft eerst (rood), developer daarna (framework §8).

| Bewijs | Soort | Plaats | AC |
|---|---|---|---|
| assert per policy op naam (`claims_select_own`, `claims_select_admin`, `claims_insert_own`, `claims_update_own`, `claims_update_admin`, `claims_delete_own`, `claim_requests_select_own`, `claim_requests_insert_own`) met toegestane en verboden rol, ook admin met MFA | pgTAP + `check-policies` | `db/tests/claims.sql` | AC-11, AC-12, AC-27 |
| trigger: overgangstabel, niet-concept niet wijzigen, wie welke overgang, tijdstempels, CHECK-samenhang | pgTAP | `db/tests/claims.sql` | AC-5, AC-27 |
| grants: geen insert/update op `id`, `owner_id` en de tijdstempels; bon zonder update/delete; niets aan `api_user`, `auth_service`, `PUBLIC` | pgTAP | `db/tests/claims.sql` | AC-27 |
| catalogus, rij in `app.retention`, schrijfbaarheid | pgTAP | `db/tests/functies.sql`, `schrijfbaarheid.sql`, `invarianten.sql` | — |
| cascade bij verwijderd account, auditregels blijven | pgTAP | `db/tests/claims.sql` | AC-28 |
| permissietabel per rol en sessiesterkte | unit | `src/shared/permissions.test.ts` | AC-13 t/m AC-15 |
| contract: grenzen gelijk aan `limits.ts`, `claimIdParam`, strict, emoji-lengte | unit | `src/shared/contracts/claims.test.ts` | AC-21, AC-23e |
| tuples gelijk aan de CHECKs (`CLAIM_STATUSES`, `CLAIM_CATEGORIES`, grenzen) | unit + pgTAP | `src/shared/limits.test.ts`, `db/tests/claims.sql` | AC-21 |
| bedrag parsen, vaste gevallen en de deterministische rondgang (handgeschreven generator; `fast-check` zit niet in `package.json`, een dependency vraagt akkoord, R-SEC-06) | unit | `src/shared/schemas/claims.test.ts` | AC-22 |
| `claimsMonthStart`: jaargrens, zomer- en wintertijd | unit | `src/api/domain/claims-month.test.ts` | AC-17a |
| routes: elk AC op de API, per verboden rol, admin zonder MFA, anoniem, gecombineerde fouten, padparameter, strikte routering | integratie (echte database) | `test/api/claims.int.test.ts` | AC-1 t/m AC-5, AC-7 t/m AC-10, AC-12 t/m AC-16, AC-21, AC-23, AC-24 |
| audit met `request_id`, geen regel bij weigering, rollback na `app.audit` | integratie | `test/api/claims-audit.int.test.ts` (mechanisme: `test/audit/ctx-audit.int.test.ts`) | AC-2, AC-7 t/m AC-10, AC-14, AC-26 |
| summary en maandgrens, historische tijdstempels met FORCE RLS uit en uitgezette trigger in de terugdraaiende transactie | integratie | `test/api/claims.int.test.ts` | AC-17b, AC-18, AC-19 |
| idempotentie: herhaling, conflict, per gebruiker, tombstone | integratie | `test/api/claims-idempotency.int.test.ts` | AC-31 t/m AC-34 |
| racetests: twee gelijktijdige `POST` (zelfde en andere invoer) en twee gelijktijdige `approve`, elk op een eigen verbinding; deze tests committen echt (zie hieronder) | integratie | `test/api/claims-race.int.test.ts` | AC-25, AC-35 |
| A tegen B, spoof, cursor | securitysuite | `test/security/resources.ts` | AC-11 |
| copy en woordenlijst | unit | `src/web/copy/woordenlijst.test.ts` | AC-30 |
| menu per rol | unit | `src/web/routes.test.tsx` | AC-29, AC-30 |
| flows medewerker en admin, lege staat, filters in de URL, guards, label "Medewerker", metrics met data van deze maand via de API; axe op 375 en 1280 px | e2e (`pnpm ui:check`) | `e2e/claims.spec.ts` | AC-1 t/m AC-4, AC-6 t/m AC-9, AC-16, AC-18 t/m AC-20, AC-22, AC-29, AC-30, AC-36 |

**Welke tests echt committen (R-TEST-01).** Alle pgTAP-tests en de integratietests via de testkit (`beginTestDb`, `asUser`) draaien in
een transactie die terugrolt, ook AC-17b en AC-27. Echt committen doen:
- de racetests AC-25 en AC-35 (`test/api/claims-race.int.test.ts`): twee gelijktijdige requests hebben elk een eigen verbinding en
  transactie nodig, dus ze schrijven via `createWithUser(pool)` met een eigen pool, zoals `test/api/account-audit-race.int.test.ts`.
  Elke test gebruikt eigen, nieuwe testaccounts en ruimt na afloop op door die accounts te verwijderen; `on delete cascade` neemt de
  declaraties en bonnen mee. Auditregels zijn append-only en blijven staan; de test telt daarom alleen regels met het `target_id` van
  zijn eigen declaratie;
- de e2e-tests (`e2e/claims.spec.ts`, ook AC-36) tegen de echte stack: elke test maakt eigen data met eigen accounts en verwacht geen
  lege database; de metrics in AC-36 gelden voor een nieuwe medewerker zonder andere declaraties.

**CSRF in de integratietests.** Een schrijvend request zonder `Sec-Fetch-Site` of `Origin` krijgt eerst `CSRF_REJECTED` (R-SEC-01).
Elke integratietest op `POST`, `PATCH` of `DELETE` stuurt `sec-fetch-site: same-origin` mee, ook de gevallen van AC-23 (b) en (d) en
de `PATCH`/`DELETE`-gevallen in AC-23 (c) en AC-24; anders bewijst de test `CSRF_REJECTED` in plaats van de bedoelde code.

Gates: `pnpm gate:fast`, `pnpm check:migrations`, `pnpm check:secdef`, `pnpm test:db`, `pnpm check:snapshot`, `pnpm ui:check`.

## Open vragen

- **OV-1 ✅ besloten** — Maximumbedrag € 5.000 per declaratie (`MAX_CLAIM_AMOUNT_CENTS` = 500000, ook in de CHECK).
- **OV-2 ✅ besloten** — Label van rol `user` overal "Medewerker" (`roleLabels` in `src/web/copy/ui.ts`).
- **OV-3 ✅ besloten** — Een admin declareert niet zelf: `claims:write` alleen `user`, en RLS weert de admin met MFA (tweede laag).
- **OV-4 ✅ besloten** — Categorieën `travel`, `food_drink`, `lodging`, `other` ("Vervoer" valt onder Reiskosten).
- **OV-5 ✅ besloten** — Geen terugtrekken in deze ronde.
- **OV-6 ✅ besloten** — Geen afwijzingsreden en geen heropenen; `rejected` is eindstatus.
- **OV-7 ✅ besloten** — "Deze maand" = kalendermaand in `Europe/Amsterdam`; Goedgekeurd telt op `decided_at`.
- **OV-8 ✅ besloten** — `on delete cascade` voor declaraties en bonnen; een fiscale bewaarplicht hoort bij ST-05.
- **OV-9 ✅ besloten** — Omschrijving hoogstens 200 tekens.
- **OV-10 ✅ besloten** — Overzicht op `/`, menu-item "Overzicht", geen begroeting; de admin landt na inloggen op `/admin`.
- **OV-11 ✅ besloten** — Formulier als eigen pagina met "Opslaan als concept" en "Indienen".
- **OV-12 ✅ besloten** — `GET /claims/summary` als `eigen-account`, plus een A-tegen-B-integratietest (B ziet de bedragen van A niet)
  en een `leerpunt`-issue voor een aggregaat-scope.
- **OV-13 ✅ besloten** — Geen uitgavedatum; "Datum" is de aanmaakdatum.
- **OV-14 ✅ besloten** — Bonnetabel in schema `app` in plaats van `public`. In `public` eist de securitysuite een `resources`-regel met routes
  (`eigenaarTabellen` in `test/security/controles.ts`), die er voor een bonnetabel niet zijn. Aanbeveling: `app.claim_requests`; de
  isolatie bewijzen de pgTAP-tests op naam (AC-27) en AC-33.
- **OV-15 ✅ besloten** — Herhaling na verwijderen (tombstone): het oude `{ id }` teruggeven of `NOT_FOUND`. Aanbeveling: het oude `{ id }`; een
  herhaling geeft hetzelfde antwoord als het origineel, en een `GET` daarna zegt eerlijk dat het concept weg is.
- **OV-16 ✅ besloten** — De admin met een `password`-sessie wordt in RLS niet geweerd van aanmaken, wijzigen en verwijderen van een
  eigen concept (`claims_insert_own`, `claims_update_own`, `claims_delete_own`, `claim_requests_insert_own`), omdat `app.is_mfa_admin()` dan
  false is; alleen `can()` houdt hem tegen. Met MFA kan hij zo'n concept via SQL niet meer wijzigen of verwijderen (AC-27). Sluiten kan met een app-functie (security definer, eigenaar `app_definer`) die de rol uit
  `public.user_roles` leest los van de sessiesterkte, met catalogusregel en `check:secdef`. Aanbeveling: in deze ronde laten zoals de
  eigenaar besloot (`not app.is_mfa_admin()`), het restant vastleggen (AC-27), en het sluiten als vervolg meenemen.
- **OV-17 ✅ besloten** — `REQUEST_ID_CONFLICT` en idempotentie zijn een normatief patroon van de template (R-CODE-11, framework §4), maar core
  heeft geen foutcode en geen helper. Core is in de app dicht (R-ARCH-07). Aanbeveling: de app registreert `REQUEST_ID_CONFLICT` nu in
  `src/shared/errors.ts` en bouwt de bon in de handler; een `leerpunt`-issue vraagt de template om code en helper in core. Komt de code
  later via een template-merge in core, dan gooit `defineErrorCodes` bij opstart ("bestaat al in core") en verwijdert de merge-PR de
  app-code; dat is een verwacht conflict in het ST-09-rapport.
- **OV-18 ✅ besloten** — Idempotentie alleen op `POST /api/claims`, niet op de overgangen. Aanbeveling: zo laten; de overgangen zijn voorwaardelijk
  op de status (een herhaling wijzigt niets en geeft `CLAIM_STATUS_INVALID`), en er wordt in de app geen geld overgemaakt. Een echte
  betaalkoppeling krijgt een eigen spec met bon.
- **OV-19 ✅ besloten** — De generator schrijft Engelse URL's (`/claims`); de app wil `/declaraties`. Aanbeveling: in de bouw-PR verplaatsen (zie
  Hergebruik en UX) en een `leerpunt`-issue voor een URL-optie in `pnpm new:resource`.
