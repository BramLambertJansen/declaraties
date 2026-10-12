---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd
namespace: audit
model: opus
modelreden: nieuwe security definer-functies en aanpassing van app.assign_role en app.set_account_blocked (ADR 0025 punt 3d), en wijzigingen in src/core (withUser, route kit; punt 3c)
---

# Audit log van admin-acties

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

Uitwerking van [ADR 0021](../adr/0021-audit-log.md) (leidend) voor [ADR 0020](../adr/0020-achtergrondtaken.md), sectie
Bouwvolgorde, stap 2 t/m 4; roadmap ST-04, deel audit. Stap 1 (requestId van de server) is gebouwd in #83:
`src/core/api/http/create-app.ts:155` gebruikt `requestId({ headerName: '' })` (geen `X-Request-Id` van de client), getest in
`src/core/api/http/create-app.test.ts:38`.

## Doel

Elke admin-actie op een account (rol toekennen, uitnodigen, opnieuw uitnodigen, blokkeren, deblokkeren) laat in dezelfde transactie
een onwijzigbare regel achter in `app.audit_log`, met actor, databaserol en de server-gegenereerde `requestId`, en een app kan eigen
acties registreren zonder core te wijzigen.

## Deel-PR's

De spec wordt in drie PR's gebouwd, in deze volgorde; elk deel heeft eigen acceptatiecriteria en gaat pas verder als het vorige is gemerged.

| Deel | ADR 0020-stap | Inhoud | AC's |
|---|---|---|---|
| **A — requestId in de database** | 2 | migratie `app.request_id()`; `withUser()` en de testkit zetten `app.request_id` | AC-1 t/m AC-4 |
| **B — tabel en schrijvers** | 3 | migratie `app.audit_log`, guard-trigger, policies, grants, `app.audit`, `app.audit_account_action`, regel in `app.assign_role` en `app.set_account_blocked`; pgTAP, catalogus, invariant | AC-5 t/m AC-21 |
| **C — routes en `ctx.audit`** | 4 | `defineAuditActions`, `ctx.audit`, `src/shared/audit.ts`, invite en reinvite schrijven hun regel; integratietests | AC-22 t/m AC-31 |

## Rollen en wie wat ziet

| Rol / verbinding | Lezen `app.audit_log` | Schrijven |
|---|---|---|
| `user` (`app_authenticated`) | niets (0 rijen) | alleen via `ctx.audit` van een route waartoe hij toegang heeft (app-acties, `actor_id` = hijzelf) |
| `admin` zonder MFA (sessie `password`) | niets (0 rijen) | niets: `can()` geeft al `MFA_REQUIRED`, de functies 42501 |
| `admin` met MFA | alle regels (policy `audit_log_select_admin`), nog zonder scherm (ADR 0021 OV-6) | indirect via de accountroutes en `app.assign_role`/`app.set_account_blocked` |
| `app_definer` (security definer-functies) | alle regels (`audit_log_definer_select`) | `insert` (`audit_log_definer_insert`) |
| `app_migrator` (scripts: seed, `pnpm admin:create`) | als lid van `app_definer` | via `app.assign_role` zonder actor: regel met `actor_id` null en `db_role` `app_migrator`. Kan als eigenaar en lid van `app_definer` ook rechtstreeks invoegen of triggers uitzetten (ADR 0021 context 3, punt 6): zichtbaar via `db_role`, bewaakt door invariant en review van migraties |
| `api_user`, `auth_service` | geen rechten | geen rechten |
| `app_jobs` | bestaat nog niet (ADR 0020 stap 6) | — ; de negatieve tests voor deze rol komen in die stap |

Niemand kan een regel wijzigen of verwijderen: `update`, `delete` en `truncate` falen voor elke rol, ook de eigenaar bij gewone DML
(zie "Buiten scope" voor verwijderen na de bewaartermijn).

## Datawijzigingen (met grants)

### Deel A — migratie `…_request_id.sql`

- **`app.request_id() returns text`** — `language sql stable`, geen security definer, eigenaar `app_migrator` (zoals
  `app.current_user_id()`): `nullif(current_setting('app.request_id', true), '')`. `revoke all … from public`; `execute` alleen aan
  `app_definer` (de schrijvende functies). Functiecatalogus: klasse `intern`, reden "alleen gelezen door security definer-functies van
  de audit log" (OV-A1).
- **`withUser()`** (`src/core/api/db/with-user.ts`): `enterActor` zet `app.request_id` in dezelfde `set_config`-aanroep als `app.user_id`
  en `app.session_strength`, met `is_local = true`. Geldt voor de rate-limit-transactie en de routetransactie.
- **Type**: `WithUserOptions.requestId: string`, verplicht (OV-A2). Een lege string → `Error('withUser: lege requestId')`, net als een
  lege `userId` (`checkActor`). `createApp` geeft `c.get('requestId')` mee (`src/core/api/http/create-app.ts:99`).
- **Testkit** (`src/core/api/db/test-transaction.ts`): `asUser`/`withUser` krijgt een optionele `requestId`; zonder optie een
  `crypto.randomUUID()` per aanroep.
- Geen tabel, geen grant op een tabel, geen nieuwe rol.

### Deel B — migratie `…_audit_log.sql`

**Tabel `app.audit_log`** (ADR 0021 punt 1), RLS `enable` én `force`:

| Kolom | Type | Regel |
|---|---|---|
| `id` | `bigint generated always as identity primary key` | |
| `at` | `timestamptz not null default pg_catalog.now()` | |
| `actor_id` | `text` | null = script of taak; geen foreign key (ADR 0022 punt 4) |
| `db_role` | `text not null default session_user` | |
| `action` | `text not null` | CHECK `action ~ '^[a-z]+(\.[a-z_]+)+$'` |
| `target_type` | `text` | CHECK `target_type ~ '^[a-z_]+$'` |
| `target_id` | `text` | CHECK `target_id ~ '^[A-Za-z0-9_.:-]{1,128}$'`; geen foreign key |
| `request_id` | `text` | gevuld door de functies uit `app.request_id()` |
| `details` | `jsonb not null default '{}'` | CHECK `jsonb_typeof(details) = 'object'` en `octet_length(details::text) <= 2048` (OV-B4, OV-B5) |

Index: `(target_type, target_id, at)` en `(actor_id, at)` voor de latere export en het latere scherm (ADR 0022 stap 11, ADR 0021 OV-6).

**Grants** (ADR 0021 punt 6; alleen deze):
- `app_definer`: `select`, en `insert` op de kolommen `actor_id, action, target_type, target_id, request_id, details` (OV-B2: kolomgrant,
  zodat `id`, `at` en `db_role` altijd hun standaard krijgen); **geen** `delete` in deel B (OV-B1).
- `app_authenticated`: `select`.
- Niets aan `api_user`, `auth_service` of `PUBLIC`.

**Policies** (deel B; de policy-allowlist in de invariant is precies deze drie, OV-B1):
- `audit_log_definer_insert` — `for insert to app_definer with check (true)`;
- `audit_log_select_admin` — `for select to app_authenticated using ((select app.is_mfa_admin()))`;
- `audit_log_definer_select` — `for select to app_definer using (true)`.

**Guard-trigger** (ADR 0021 punt 6): triggerfunctie `app.audit_log_guard() returns trigger`, eigenaar `app_definer`, geen security
definer, `set search_path = ''`, `raise exception 'audit log is append-only' using errcode = '42501'`. Triggers
`audit_log_no_update` (`before update … for each statement`), `audit_log_no_delete` (`before delete … for each statement`) en
`audit_log_no_truncate` (`before truncate … for each statement`). Statement-niveau, zodat ook een `update`/`delete` die door RLS 0 rijen
raakt (de eigenaar onder FORCE RLS) zichtbaar faalt. Functiecatalogus: klasse `intern`, reden "triggerfunctie van app.audit_log".

**`app.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb) returns void`** — security definer, eigenaar
`app_definer`, `set search_path = ''`, volledig gekwalificeerd, geen overload; `execute` alleen aan `app_authenticated`; klasse `client`.
In deze volgorde:
1. `app.current_user_id()` is null → 42501;
2. `p_action` begint met `core.` of `p_target_type = 'account'` → `raise exception … using errcode = '22023'`;
3. insert met `actor_id = app.current_user_id()`, `request_id = app.request_id()`; patroon en omvang bewaken de CHECKs (23514).

**`app.audit_account_action(p_action text, p_target_id text) returns void`** — zelfde eigenschappen, klasse `client`:
1. niet `app.is_mfa_admin()` → 42501;
2. `p_action` niet in (`core.account.invite`, `core.account.reinvite`, `core.account.revoke`, `core.account.reset_link`) → 22023;
3. insert met `actor_id = app.current_user_id()`, `target_type = 'account'`, `target_id = p_target_id`, `details = '{}'`,
   `request_id = app.request_id()`.

**`app.assign_role`** (`create or replace`, zelfde signatuur, eigenaar en grants): leest vóór de upsert de huidige rol; na de upsert,
alleen bij een echte wijziging (OV-B3), een regel `core.role.assign`, `target_type` `account`, `target_id` = `p_user_id`, `details`
`{"role": <nieuw>, "previous": <oud>}` (`previous` weggelaten bij een nieuw account, OV-B3), `actor_id` = `app.current_user_id()`
(null bij een script), `request_id` = `app.request_id()`.

**`app.set_account_blocked`** (`create or replace`, zelfde signatuur, eigenaar en grants; ADR 0026 besluit 3 punt 6): regel
`core.account.block` resp. `core.account.unblock`, `target_type` `account`, `details` `{}`, **alleen bij een echte wijziging**: niet
als het account al geblokkeerd was (blokkeren) of niet geblokkeerd was (deblokkeren). Bij blokkeren na de `LAST_ADMIN`-controle,
zodat een geweigerde actie nooit een regel schrijft (de rollback ruimt hem anders ook op).

### Deel C — geen migratie

- **`src/core/shared/audit.ts`**: `defineAuditActions(map)` (patroon van `defineErrorCodes`). Per actie `{ target: string, details: z.ZodObject }`.
  Weigert bij aanmaken (gooit, dus bij opstart): een sleutel buiten `^[a-z]+(\.[a-z_]+)+$`, een sleutel die met `core.` begint, een
  `target` buiten `^[a-z_]+$` of gelijk aan `account`. `details` wordt strict geparsed (onbekende sleutel faalt).
- **`src/shared/audit.ts`** (app): `export const auditActions = defineAuditActions({})`; de template registreert geen app-acties.
- **Route kit** (`src/core/api/route/kit.ts`): `createRouteKit({ permissions, audit })`; `RouteContext.audit(action, targetId, details)`,
  getypt op de sleutels van `audit` en de `z.input` van hun `details`. Runtime: onbekende actie → `Error`; `details` parsen met zod
  (fout → `ZodError`); dan `select app.audit($1, $2, $3, $4::jsonb)` in de eigen `tx` met de `target` uit de registratie.
- **`src/api/kit.ts`**: geeft `auditActions` mee.

## Routes en foutcodes

Geen nieuwe routes, permissies of foutcodes. Bestaande routes krijgen een auditregel:

| Methode | Pad | Permissie | Foutcodes | Auditregel |
|---|---|---|---|---|
| POST | `/api/accounts/invite` | `accounts:invite` | ongewijzigd | `core.account.invite` + `core.role.assign`, beide in `beforeMail` (deel C; `core.role.assign` al vanaf deel B via `app.assign_role`) |
| POST | `/api/accounts/:id/reinvite` | `accounts:invite` | ongewijzigd | `core.account.reinvite`, vóór de aanroep van de service (deel C) |
| POST | `/api/accounts/:id/block` | `accounts:manage` | ongewijzigd | `core.account.block`, door de functie (deel B) |
| POST | `/api/accounts/:id/unblock` | `accounts:manage` | ongewijzigd | `core.account.unblock`, door de functie (deel B) |
| DELETE | `/api/accounts/:id/invitation` | `accounts:invite` | — | `core.account.revoke`; route bestaat nog niet (OV-C1) |
| POST | `/api/accounts/:id/reset-link` | `accounts:manage` | — | `core.account.reset_link`; route bestaat nog niet (OV-C1) |

Foutvertaling (bestaand, `src/core/api/errors.ts:67`): 42501 → `FORBIDDEN`; 22023 en 23514 worden niet vertaald → `INTERNAL_ERROR`
(een fout in de servercode, niet in de invoer van de client, en zo komt hij in de serverlog). Een `ZodError` of onbekende actie in
`ctx.audit` → `INTERNAL_ERROR`. In alle gevallen draait de transactie terug, dus ook de actie zelf.

## Hergebruik en UX

- **Bestaande componenten:** n.v.t. — deze spec heeft geen scherm (ADR 0021 OV-6). Een later `/admin/audit` krijgt een eigen spec op het
  lijstpatroon (spec `lijstpagina`) met `PageHeader`, `ListToolbar`, `AsyncView`, `Table` (`TableHeader`, `TableBody`, `TableRow`,
  `TableHead`, `TableCell`) en `Notice`, uit de feiten.
- **Hergebruik in de API en database:** `withUser()`/`enterActor` (set_config, één plek), `createRouteKit`/`defineRoute`, het
  registratiepatroon van `defineErrorCodes` voor `defineAuditActions`, `translateDatabaseError`, de testkit `beginTestDb`, de
  functiecatalogus (`db/tests/functies.sql`), de invarianten (`db/tests/invarianten.sql`), `check-policies` en `check:secdef`.
  Policies en functies volgen het patroon van `app.rate_limits`/`app.consume_rate_limit` en `app.set_account_blocked`.
- **Staten per scherm:** n.v.t. — geen scherm; zichtbaar gedrag van de accountroutes verandert niet.
- **Alle zichtbare tekst letterlijk:** n.v.t. — geen nieuwe UI-tekst en geen nieuwe foutcode. (Bij het latere scherm: "verwijderd account" voor een
  actor of doel zonder rij in `app.accounts`, ADR 0021 punt 8.)
- **Focusvolgorde en toetsenbord:** n.v.t. — geen scherm.

## Acceptatiecriteria

### Deel A — requestId in de database

- **audit/AC-1** — Gegeven `withUser(actor, work, { requestId: R })`, wanneer `work` `app.request_id()` leest (als `app_definer`, in een test in
  `src/core/api/db`, waar `current_setting` mag), dan is de waarde R; en via `createApp` is R de header `X-Request-Id` van de response.
- **audit/AC-2** — Gegeven een request met header `X-Request-Id: vervalst-door-client`, dan is `app.request_id()` in de transactie niet
  `vervalst-door-client` en gelijk aan de `X-Request-Id` van de response en aan `requestId` in de request-log.
- **audit/AC-3** — Gegeven twee opeenvolgende `withUser`-aanroepen op dezelfde poolverbinding met requestId R1 en R2, dan ziet de tweede R2, en
  na de commit geeft `current_setting('app.request_id', true)` op die verbinding een lege waarde (is_local).
- **audit/AC-4** — `withUser` met een lege `requestId` gooit vóór er een verbinding wordt gepakt; zonder `requestId` compileert de aanroep niet
  (type-test).

### Deel B — tabel en schrijvers

- **audit/AC-5** — `app.audit_log` heeft RLS aan en geforceerd, de kolommen en CHECKs uit "Datawijzigingen", en precies de grants en de drie
  policies uit deel B; de invariant faalt met een opzettelijke extra policy, een extra grant (bijv. `update` aan `app_definer`) en een
  uitgeschakelde guard-trigger (controle in een teruggedraaide transactie).
- **audit/AC-6** — `audit_log_definer_insert: …` — als `app_definer` slaagt een insert; als `app_authenticated` faalt hij met 42501.
- **audit/AC-7** — `audit_log_select_admin: …` — een admin met MFA ziet alle regels; een admin met sessie `password` ziet 0 regels; een `user`
  ziet 0 regels, ook niet die met hemzelf als actor of doel.
- **audit/AC-8** — `audit_log_definer_select: …` — als `app_definer` zijn alle regels zichtbaar.
- **audit/AC-9** — `insert`, `update`, `delete` en `truncate` falen voor `app_authenticated`; `api_user` en `auth_service` hebben geen enkel
  recht op de tabel (`has_table_privilege` false voor alle vier).
- **audit/AC-10** — `update`, `delete` en `truncate` falen met 42501 als `app_definer` en als `app_migrator` (eigenaar), ook als de
  `where` 0 rijen raakt.
- **audit/AC-11** — `app.assign_role` door een admin met MFA (rol `user` → `admin`) schrijft precies één regel: `action` `core.role.assign`,
  `actor_id` = de admin, `db_role` = `session_user` van de test, `target_type` `account`, `target_id` = het account, `details`
  `{"role":"admin","previous":"user"}`, `request_id` = de gezette `app.request_id`.
- **audit/AC-12** — `app.assign_role` als `app_migrator` zonder actor schrijft een regel met `actor_id` null en `db_role` `app_migrator`.
- **audit/AC-13** — `app.assign_role` die faalt (`LAST_ADMIN` door de trigger) laat geen regel achter.
- **audit/AC-14** — `app.set_account_blocked(id, true)` schrijft één regel `core.account.block`; nogmaals aanroepen schrijft geen tweede;
  `(id, false)` schrijft één `core.account.unblock`; deblokkeren van een niet-geblokkeerd account schrijft niets.
- **audit/AC-15** — Blokkeren dat faalt met `LAST_ADMIN`, `OWN_ACCOUNT`, `ACCOUNT_INVITED`, `NOT_FOUND` of 42501 laat geen regel achter.
- **audit/AC-16** — `app.audit` weigert: actor null (42501); `action` `core.x.y` (22023); `target_type` `account` (22023); `target_id` met
  `@` of een spatie of van 129 tekens (23514); `details` geen object (23514); `details` van 2049 bytes (23514). `details` van precies
  2048 bytes en `target_id` van 128 tekens slagen.
- **audit/AC-17** — `app.audit` zet `actor_id` altijd op `app.current_user_id()`; een `user` kan via geen enkele parameter een andere actor kiezen.
- **audit/AC-18** — `app.audit_account_action` weigert een `user` en een admin zonder MFA (42501) en een actie buiten de vier (22023), en
  schrijft voor een admin met MFA `target_type` `account` en `details` `{}`.
- **audit/AC-19** — Functiecatalogus: `app.audit` en `app.audit_account_action` `client`; `app.audit_log_guard()` en `app.request_id()`
  `intern`; alle security definer-functies eigenaar `app_definer` met leeg `search_path` (bestaande invariant), `pnpm check:secdef` groen.
- **audit/AC-20** — Een actie die faalt ná het schrijven van de regel (in de test: `app.audit` gevolgd door een fout in dezelfde transactie)
  laat na de rollback geen regel achter.
- **audit/AC-21** — `pnpm check:snapshot` groen met de nieuwe `db/schema.snapshot.sql` en `src/api/db/schema.ts`; `check-policies` vindt
  voor elke policy een assert op naam.

### Deel C — routes en `ctx.audit`

- **audit/AC-22** — `POST /api/accounts/invite` door een admin met MFA schrijft `core.account.invite` en `core.role.assign` met `target_id` =
  het `id` uit de response, `actor_id` = de admin en `request_id` = de `X-Request-Id` van de response.
- **audit/AC-23** — `POST /api/accounts/invite` met een bestaand e-mailadres (`ALREADY_EXISTS`) schrijft geen regel.
- **audit/AC-24** — `POST /api/accounts/:id/reinvite` schrijft één `core.account.reinvite`; met een onbekend ID (`NOT_FOUND`) of een actief
  account (`ALREADY_ACTIVE`) geen regel.
- **audit/AC-25** — `POST /api/accounts/:id/block` en `/unblock` schrijven via de route precies de regels uit AC-14, met de `request_id` van de
  response; een geweigerde blokkade (`LAST_ADMIN`, `OWN_ACCOUNT`) geen.
- **audit/AC-26** — Een `X-Request-Id` van de client komt in geen enkele auditregel van AC-22 t/m AC-25.
- **audit/AC-27** — `user` en admin zonder MFA op elk van deze routes: `FORBIDDEN` resp. `MFA_REQUIRED`, geen regel.
- **audit/AC-28** — `defineAuditActions` gooit bij een sleutel `core.x.y`, een sleutel buiten het patroon, `target` `account` en `target`
  buiten het patroon (unit).
- **audit/AC-29** — `ctx.audit` met een niet-geregistreerde actie compileert niet (type-test) en gooit runtime; met `details` die niet bij het
  schema passen of een extra sleutel bevatten faalt de route met `INTERNAL_ERROR` en staat er geen regel en geen effect van de route.
- **audit/AC-30** — Een fixture-app registreert een actie (bijv. `note.archive`, target `note`) zonder `src/core` te wijzigen; `ctx.audit`
  schrijft een regel met de actor van de sessie en de `request_id` van de response (test in core, zoals voor foutcodes; `.claude/rules/core.md`).
- **audit/AC-31** — De route die `ctx.audit` aanroept en daarna faalt, laat geen regel achter.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Uitnodigen: `auth_service` maakt het account (eigen verbinding, al gecommit), daarna faalt de commit van de route | account bestaat zonder rol en zonder auditregel; zichtbaar in de request-log met status 500 (ADR 0021 OV-7, geaccepteerd) | `INTERNAL_ERROR` |
| Uitnodigen: `beforeMail` faalt (rol of auditregel) | `inviteUser` verwijdert het account weer; rol en regel draaien terug | die van de fout |
| Uitnodigen: mail versturen faalt na `beforeMail` | bestaand gedrag: route faalt, rol en regel draaien terug, account blijft (zelfde gat als hierboven, tot de outbox, ADR 0020 stap 9) | `INTERNAL_ERROR` |
| Opnieuw uitnodigen: service slaagt (eigen verbinding), commit van de route faalt | token vernieuwd en mail weg zonder regel; gat tot de outbox (ADR 0021 OV-7) | `INTERNAL_ERROR` |
| Blokkeren van een al geblokkeerd account | geen wijziging, geen regel (ADR 0026 besluit 3.6) | — (200) |
| Rol toekennen gelijk aan de huidige (bijv. `admin:create` op een bestaande admin) | zie OV-B3 | — |
| Account later verwijderd (ADR 0022, buiten scope) | regels blijven met het oude ID; geen foreign key | — |
| `app_migrator` voegt rechtstreeks een regel in met verzonnen `actor_id` | mogelijk (erkend, ADR 0021 punt 6); `db_role` = `app_migrator` verraadt het; migraties zijn beschermd pad | — |
| `app_migrator` zet de guard-trigger uit (`alter table … disable trigger`) | mogelijk als eigenaar; de invariant in pgTAP (`pnpm test:db`) faalt bij elke migratie die het achterlaat | — |
| Request zonder database (`/api/health`, CSRF-weigering) | geen transactie, geen regel | — |
| GET-route (read only) | `app.request_id` wordt ook gezet; schrijven kan niet (read only) en gebeurt niet | — |
| Script zonder request (seed, `admin:create`) | `request_id` null | — |

## Raakt ook

- `src/core/api/db/with-user.ts`, `types.ts`, `test-transaction.ts`; `src/core/api/http/create-app.ts`; `src/core/api/route/kit.ts`;
  nieuw `src/core/shared/audit.ts` — beschermd pad `src/core/`, akkoord van de eigenaar.
- `src/api/kit.ts` (beschermd), nieuw `src/shared/audit.ts`, `src/api/routes/accounts.ts`.
- `src/core/shared/limits.ts`: `MAX_AUDIT_DETAILS_BYTES = 2048` en `MAX_AUDIT_TARGET_ID_LENGTH = 128`, met een verwijzing naar de CHECK in
  de migratie (één bron in TypeScript; de pgTAP-test AC-16 bewijst de grens in de database).
- `db/tests/functies.sql` en `db/tests/invarianten.sql`: regels erbij in dezelfde PR als de migratie (catalogus, allowlist); nieuw
  `db/tests/audit_log.sql`. Bestaande asserts in `db/tests/user_roles.sql` en `db/tests/account_blocking.sql` blijven gelden; tellen ze
  rijen of plannen ze een vast aantal, dan noemt de PR de wijziging met reden.
- `db/schema.snapshot.sql`, `src/api/db/schema.ts` — gegenereerd.
- `docs/framework.md` §6: alinea audit log (append-only, policy-allowlist, invariant, `app.request_id`) — beschermd, akkoord van de eigenaar
  (ADR 0021 Gevolgen). §12 bevat geen rij "Audit log" meer.
- `.claude/rules/api.md`: `ctx.audit` en de auditregel voor core-acties — beschermd.
- `docs/specs/accountbeheer-uitbreiding.md:158`: de zin "Daarover is nog geen besluit" vervalt; verwijzing naar deze spec.
- `docs/roadmap.md` ST-04 (stand bijwerken per deel), `CHANGELOG.md`.

## Buiten scope

- **Bewaartermijn en opruimen** (ADR 0020 stap 5 en 8, ADR 0022): `app.retention`, `app.retention_cutoff(regclass)`, de rij voor
  `app.audit_log` (1 jaar), de pgTAP-eis `keep ≥ 1 jaar`, `app.purge_expired`. **Verhouding tot deze spec:** in deel B kan niemand
  een regel verwijderen: geen `delete`-grant, geen delete-policy, en de guard-trigger `audit_log_no_delete` faalt altijd. Stap 5 voegt in
  één migratie toe: de policy `audit_log_definer_delete` (`using (at < app.retention_cutoff('app.audit_log'))`), `delete` aan
  `app_definer`, en vervangt `audit_log_no_delete` door een rij-trigger die alleen een rij binnen de termijn weigert; de policy-allowlist
  in de invariant groeit dan naar de vier van ADR 0021 punt 6 (OV-B1).
  **Termijn en omvang tot stap 5:** de tabel groeit tot dan zonder opruimen; dat is bewust en klein (één rij per admin-actie, `details`
  ≤ 2 KB). De termijn is geen env-instelling: hij staat in `app.retention` en wijzigt met een migratie, zodat hij reviewbaar is en voor
  export en privacyregister één bron heeft. Een app mag verlengen; verkorten onder 1 jaar vraagt een wijziging van de pgTAP-eis en dus
  review van de eigenaar.
- **Rol `app_jobs`**, de runner, de mail-outbox (ADR 0020 stap 6, 7, 9) en daarmee de test "mail faalt later, regel blijft" (ADR 0021 Tests).
- **Export en verwijderen** (ADR 0022, ADR 0020 stap 11 en 12), inclusief `core.account.delete` en de definer-functie die de regels van een
  gebruiker leest.
- **Scherm `/admin/audit`** (ADR 0021 OV-6): eigen spec.
- **Lees-acties, inloggen, mislukte pogingen**, export naar externe onwijzigbare opslag (ADR 0021 punt 9).
- De routes intrekken en resetlink zelf (spec `accountbeheer-uitbreiding`); alleen hun auditregel staat hier (OV-C1).

## Open vragen voor de eigenaar

- **OV-A1 — Klasse van `app.request_id()`.** `intern`, alleen `execute` aan `app_definer`, of `client` (ook leesbaar voor
  `app_authenticated`). Aanbeveling: `intern`; niets in de API hoeft hem te lezen.
- **OV-A2 — `requestId` verplicht in `withUser`.** Verplicht (elke aanroeper moet hem meegeven, core-tests en fixtures wijzigen mee) of
  optioneel (regel zonder `request_id` mogelijk). Aanbeveling: verplicht; de testkit maakt er zelf een.
- **OV-B1 — Policy-allowlist vóór de bewaarcatalogus.** ADR 0021 punt 6 noemt "exact" vier policies, waarvan
  `audit_log_definer_delete` `app.retention_cutoff` gebruikt, die pas in stap 5 bestaat. (a) In deel B drie policies, geen `delete`-grant,
  delete altijd geweigerd; stap 5 voegt de vierde toe. (b) Nu al een `app.retention_cutoff` met een vaste termijn. Aanbeveling: (a); (b)
  vult een termijn in vóór de catalogus beslist is. (a) wijkt tijdelijk af van de letter van de ADR: akkoord gevraagd.
- **OV-B2 — Kolomgrant voor insert.** ADR 0021 zegt `insert` aan `app_definer`. Een kolomgrant zonder `id`, `at` en `db_role` voorkomt dat
  een (toekomstige) definer-functie tijd of databaserol vervalst. Aanbeveling: kolomgrant.
- **OV-B3 — Regel bij een ongewijzigde rol en vorm van `details`.** Schrijft `app.assign_role` een regel als de rol gelijk blijft
  (`admin:create` op een bestaande admin, upsert)? En `previous` weglaten of `null` bij een nieuw account? Aanbeveling: alleen bij een echte
  wijziging (zoals blokkeren, ADR 0026), en `previous` weglaten.
- **OV-B4 — Inhoud van `details` in de database bewaken.** ADR 0021 laat de inhoud aan zod per actie. Extra: een CHECK dat elke
  stringwaarde in `details` het patroon van `target_id` volgt (geen `@`, geen spatie), via `jsonb_path_exists`; dan houdt ook een
  definer-functie van een app er een e-mailadres of vrije tekst uit. Aanbeveling: toevoegen, met platte objecten (geen geneste objecten of
  arrays). Zonder akkoord: alleen object en omvang, zoals de ADR.
- **OV-B5 — Meting van "2 KB".** `octet_length(details::text) <= 2048` (bytes van de tekstvorm) of `pg_column_size`. Aanbeveling:
  `octet_length(details::text)`; deterministisch en gelijk aan wat de API meet.
- **OV-C1 — Intrekken en resetlink.** Die routes bestaan nog niet. (a) Deze spec legt alleen vast dat ze `app.audit_account_action` met
  `core.account.revoke`/`core.account.reset_link` vóór de service aanroepen, en de PR die ze bouwt voegt de regel en de tests toe; (b)
  deel C wacht op die routes. Aanbeveling: (a); de allowlist in de functie bevat de vier acties al.
- **OV-C2 — Aanroep van `app.audit_account_action` vanuit de route.** (a) Rechtstreeks met `tx.execute(sql\`select app.audit_account_action(…)\`)`,
  zoals `app.assign_role` nu; (b) een getypte helper in core. Aanbeveling: (a); geen nieuwe core-API, de allowlist en AC-22/AC-24 vangen een
  tikfout.

## Testplan

Bewijsmatrix (tester schrijft rood vóór de developer; bij de migraties één `pnpm test:db`-run, ADR 0025 punt 9).

| Bewijs | Soort | Plaats | AC |
|---|---|---|---|
| requestId van de server in de transactie, ook bij vervalste header | integratie | `src/core/api/db/with-user.int.test.ts` of `src/core/api/http/*.int.test.ts` | AC-1, AC-2 |
| is_local: geen lek naar de volgende transactie op dezelfde verbinding | integratie (lektest, direct en via de pooler) | bestaande datapad-lektest uitbreiden | AC-3 |
| lege/ontbrekende requestId | unit + type-test | `src/core/api/db/with-user.test.ts` | AC-4 |
| invariant: RLS, grants, exact drie policies, triggers aan, met opzettelijke fout | pgTAP | `db/tests/invarianten.sql`, `db/tests/audit_log.sql` | AC-5 |
| per policy een assert op naam (`audit_log_definer_insert: …`, `audit_log_select_admin: …`, `audit_log_definer_select: …`) | pgTAP + `check-policies` | `db/tests/audit_log.sql` | AC-6 t/m AC-8, AC-21 |
| negatieve test per verboden rol: `app_authenticated` (insert/update/delete/truncate), `api_user` en `auth_service` (privileges), `app_definer` en `app_migrator` (update/delete/truncate) | pgTAP | `db/tests/audit_log.sql` | AC-9, AC-10 |
| lezer verboden: `user`, admin zonder MFA | pgTAP | `db/tests/audit_log.sql` | AC-7 |
| `app.assign_role` schrijft één regel met actor, `db_role`, `request_id`; script zonder actor | pgTAP | `db/tests/audit_log.sql` | AC-11, AC-12 |
| rollback-met-actie: `LAST_ADMIN` bij assign_role en blokkeren, andere weigeringen, fout ná schrijven | pgTAP | `db/tests/audit_log.sql` | AC-13, AC-15, AC-20 |
| alleen bij echte wijziging (blokkeren/deblokkeren) | pgTAP | `db/tests/audit_log.sql` | AC-14 |
| allowlist-falen: `app.audit` (`core.*`, `account`, patroon, omvang, actor null), `app.audit_account_action` (actie buiten de vier, `user`, geen MFA) | pgTAP | `db/tests/audit_log.sql` | AC-16 t/m AC-18 |
| functiecatalogus en security definer | pgTAP + `pnpm check:secdef` | `db/tests/functies.sql` | AC-19 |
| snapshot | `pnpm check:snapshot` | — | AC-21 |
| invite/reinvite/block/unblock schrijven hun regel met de `request_id` van de response; falen laat niets achter | integratie (echte database, testkit) | `src/api/routes/accounts.int.test.ts` | AC-22 t/m AC-25 |
| vervalste `X-Request-Id` komt niet in de regel | integratie | idem | AC-26 |
| verboden rol per route, geen regel | integratie | idem | AC-27 |
| `defineAuditActions` weigert `core.*`, `account`, patronen | unit | `src/core/shared/audit.test.ts` | AC-28 |
| `ctx.audit`: niet-geregistreerde actie (type-test met `expectTypeOf`), zod-fout, extra sleutel → `INTERNAL_ERROR` en geen effect | unit + integratie | `src/core/api/route/*.test.ts`, fixture-app | AC-29, AC-31 |
| app registreert eigen actie zonder core te wijzigen | integratie met fixture | `src/core/api/route/*.int.test.ts` | AC-30 |

Gates per deel: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm ratchet`, `pnpm test:unit`, `pnpm check:migrations`
(A, B), `pnpm check:secdef` (B), `pnpm test:db` en `pnpm check:snapshot` (A, B, C). Niet in deze spec: de negatieve tests voor
`app_jobs` (stap 6) en `keep ≥ 1 jaar` (stap 5).
