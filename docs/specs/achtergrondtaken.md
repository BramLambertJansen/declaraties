---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd; gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: jobs
model: opus
modelreden: nieuwe databaserol en security definer-functies app.purge_expired en app.retention_targets (ADR 0025 punt 3d), gelijktijdigheid via advisory locks en de stopvolgorde (punt 3a), en wijzigingen in src/core (db, auth, nieuwe map jobs; punt 3c)
---

# Achtergrondtaken: bewaarcatalogus, rol `app_jobs`, runner en opruimen

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

Uitwerking van [ADR 0020](../adr/0020-achtergrondtaken.md) (leidend), sectie Bouwvolgorde, stap 5 t/m 8, en van
[ADR 0022](../adr/0022-avg.md) punt 5 (bewaarcatalogus); roadmap ST-03 (en het deel bewaarcatalogus van ST-05). Stap 1 t/m 4 zijn
gebouwd in #128 (spec [audit-log](audit-log.md)): `app.request_id()` en `app.audit_log` staan in `db/schema.snapshot.sql:207` en `:403`.
Stap 9 (mail-outbox) staat in de spec [mail-outbox](mail-outbox.md) en wacht op alle vier delen van deze spec.

**Afwijkingen van de ADR's** (besluiten 2026-10-19 hieronder; normatief, dus een wijzigings-ADR volgens de procedure "Correctie aan een
geaccepteerd ADR", `docs/operations/agent-doorloop.md:141`, spoor 1):

- ADR 0020 punt 1/2: `withJob(name, work)` wordt `withJob({ name, key }, work, options?)` met resultaat `{ ran: false } | { ran: true, value }`
  (OV-C3), en krijgt naast de try-lock een **wachtende** variant (`{ wait: true }`) voor het markeren van mail (spec mail-outbox, OV-2): daar
  slaat een instantie de transactie niet over als de lock bezet is (wijkt af van punt 1, "lukt de lock niet, dan slaat deze instantie de batch over").
- ADR 0020 context: "`rateLimit` … wordt nooit kleiner" klopt niet voor Better Auth 1.7.7 (OV-A4).
- ADR 0022 punt 5: `app_jobs` leest `app.retention` niet rechtstreeks maar via `app.retention_targets()` (OV-A6).
- ADR 0020 punt 2: "het langste rate-limit-venster" is voor Better Auth 1.7.7 60 s (vaste regel, `better-auth/dist/api/rate-limiter/index.mjs:305`–`:318`),
  niet het standaardvenster van 10 s; de opruimtermijn is daarom een eigen constante `AUTH_RATE_LIMIT_KEEP_SECONDS = 60`, los van `rateLimit.window`.
- ADR 0021 punt 6 en Tests ("`delete` van een rij binnen de termijn faalt voor iedereen", ook voor `app_migrator`): onder FORCE RLS filtert
  `audit_log_definer_delete` zo'n rij weg vóór de trigger, dus de `delete` slaagt met 0 rijen in plaats van te falen; de trigger weigert alleen
  wie RLS omzeilt (jobs/AC-6, AC-7).
- ADR 0018 punt 2 en Gevolgen (specwijziging 2026-10-19, OV-C4): `pingDatabase()` controleert naast `select 1` als `api_user` ook een
  tweede eigen verbinding als `app_jobs` (`JOBS_DATABASE_URL`); readiness is dus pas 200 als beide slagen, en elke instantie heeft twee
  extra verbindingen in plaats van één. ADR 0018 punt 4 ("ready raakt de database hooguit één keer per seconde") wordt: hooguit één
  controle per seconde, met twee verbindingen (één als `api_user`, één als `app_jobs`). De rest van ADR 0018 (200/503 zonder data, 900 ms
  per stap, 2 s, cache 1 s, single-flight) blijft.

## Doel

Elke tabel in `public` en `app` heeft een vastgelegde bewaartermijn, en een runner in het API-proces ruimt verlopen rijen op (app-tabellen
als `app_jobs`, `better_auth` als `auth_service`), in batches onder een advisory lock, zonder dat de runner zelf verbindingen maakt.

## Deel-PR's

Vier PR's, in deze volgorde; elk deel heeft eigen acceptatiecriteria en begint pas als het vorige gemerged is. De wijzigings-ADR
(zie hierboven) is een eigen PR direct vóór deel C (ADR 0029: één PR per besluit); deel C en D verwijzen ernaar.

| Deel | ADR 0020-stap | Inhoud | Wacht op | AC's |
|---|---|---|---|---|
| **A — bewaarcatalogus** | 5 | migratie `app.retention`, `app.retention_cutoff(regclass)`, een rij per bestaande tabel, delete-policy en rij-trigger op `app.audit_log`, restrictieve delete-policy op `app.rate_limits`, invariant, generator-template | — (audit log is gebouwd) | AC-1 t/m AC-10 |
| **B — rol `app_jobs`** | 6 | `db/init/01-roles.sql`, migratie met `usage`, verplichte env `JOBS_DATABASE_URL` met demo-wachtwoord, klasse `job` in de functiecatalogus, invarianten, runbook voor alle rollen, framework §6 | A | AC-11 t/m AC-18 |
| **C — runner** | 7 | `src/core/api/jobs/` (register, `startJobs`, `runJobsOnce`), `withJob()` (try- en wachtende variant) in `src/core/api/db`, readiness met de jobs-verbinding, stopvolgorde in `src/api/server.ts`, exportlijsten | B, wijzigings-ADR | AC-19 t/m AC-29, AC-44, AC-45 |
| **D — opruimen** | 8 | migratie `app.purge_expired` en `app.retention_targets` (klasse `job`), `purgeExpired()` in `src/core/api/auth`, `AUTH_RATE_LIMIT_WINDOW_SECONDS` en `AUTH_RATE_LIMIT_KEEP_SECONDS`, de twee core-taken | A, C | AC-30 t/m AC-43 |

## Rollen en wie wat ziet

| Rol / verbinding | `app.retention` | `app.purge_expired`, `app.retention_targets` | `better_auth` opruimen |
|---|---|---|---|
| `user`, `admin` (`app_authenticated` via `api_user`) | niets | geen `execute` | nee |
| `app_definer` (security definer-functies) | `select` (policy `retention_definer_select`) | is de eigenaar; verwijdert alleen wat de delete-policy van de tabel toelaat | nee |
| `app_jobs` (nieuw, deel B) | geen tabelrecht; leest via `app.retention_targets()` | alleen `execute` op functies van klasse `job` | nee |
| `auth_service` (pool van Better Auth) | niets | geen `execute` | ja, alleen via `purgeExpired()` in `src/core/api/auth` (ADR 0010) |
| `app_migrator` | eigenaar; rijen via migraties | eigenaar van de tabellen; lid van `app_definer` (`db/init/01-roles.sql:34`) | — |

`app_jobs` heeft geen rechten op tabellen (in `public`, `app` en `better_auth`), geen `TRUNCATE`, `REFERENCES` of `TRIGGER`, en geen
`execute` op functies van klasse `client` of `intern`.

## Datawijzigingen (met grants)

### Deel A — migratie `…_retention.sql`

**Tabel `app.retention`** (ADR 0022 punt 5), RLS `enable` én `force`:

| Kolom | Type | Regel |
|---|---|---|
| `table_name` | `regclass primary key` | |
| `time_column` | `text` | null alleen als `keep` null is |
| `keep` | `interval` | null = zolang het account bestaat; anders CHECK `keep >= interval '0'` |
| `purger` | `text not null` | CHECK `purger in ('app', 'auth')` |
| `reason` | `text not null` | CHECK `length(trim(reason)) > 0` |

- Grants: alleen `select` aan `app_definer`. Niets aan `app_authenticated`, `api_user`, `auth_service`, `app_jobs`, `PUBLIC`.
- Policy `retention_definer_select` — `for select to app_definer using (true)`.
- **`app.retention_cutoff(p_table regclass) returns timestamptz`** — `language plpgsql stable`, security definer van `app_definer`,
  `set search_path = ''`, geen overload: `pg_catalog.now() - keep`; `'-infinity'` als `keep` null is; een tabel zonder rij →
  `raise exception … using errcode = '22023'`. `execute` alleen aan `app_definer`. Functiecatalogus: klasse `intern`, reden
  "gelezen door policies en triggers met een termijn".
- **Rijen** (één bron voor het register; `app` = opgeruimd door `app.purge_expired`, `auth` = door `purgeExpired()`):

| `table_name` | `time_column` | `keep` | `purger` | Bron |
|---|---|---|---|---|
| `app.retention` | null | null | `app` | "configuratie" (ADR 0022 punt 5) |
| `public.user_roles` | null | null | `app` | verdwijnt met het account (cascade) |
| `app.audit_log` | `at` | `1 year` | `app` | ADR 0021 OV-5 |
| `app.rate_limits` | `window_start` | `60 seconds` (= `RATE_LIMIT_WINDOW_SECONDS`) | `app` | spec rate-limit, regel 40; OV-A1 |
| `better_auth.session` | `createdAt` | `7 days` (= `SESSION_ABSOLUTE_SECONDS`) | `auth` | ADR 0003 |
| `better_auth.verification` | `expiresAt` | `0 seconds` | `auth` | de geldigheid zit al in `expiresAt` |
| `better_auth."rateLimit"` | `lastRequest` (epoch-ms, `bigint`) | `60 seconds` (= `AUTH_RATE_LIMIT_KEEP_SECONDS`, deel D; langste venster van Better Auth) | `auth` | OV-A3, OV-A4 |
| `better_auth."user"`, `account`, `"twoFactor"` | null | null | `auth` | met het account; OV-A3 |

- **`app.audit_log`** (spec audit-log, "Buiten scope", OV-B1 daar): policy `audit_log_definer_delete` — `for delete to app_definer using
  (at < (select app.retention_cutoff('app.audit_log')))`; grant `delete` aan `app_definer`; trigger `audit_log_no_delete` (statement)
  vervalt en wordt `audit_log_delete_expired_only` (`before delete … for each row`, functie `app.audit_log_guard_delete()`, eigenaar
  `app_definer`, geen security definer, klasse `intern`, reden "triggerfunctie van app.audit_log"): weigert met 42501 elke rij met
  `at >= app.retention_cutoff('app.audit_log')`. `update` en `truncate` blijven altijd geweigerd. De audit-invariant in
  `db/tests/invarianten.sql` wijzigt op drie plekken: policy-allowlist (`:139`, `:142`) wordt de vier van ADR 0021 punt 6, grant-allowlist
  (`:151`–`:152`) krijgt `('app_definer', 'DELETE')`, trigger-allowlist (`:163`) de nieuwe naam.
  **Let op:** `app_migrator` is eigenaar én lid van `app_definer`; onder FORCE RLS valt hij onder `audit_log_definer_delete`, dus een
  `delete` van een regel binnen de termijn geeft 0 rijen (de policy filtert vóór de trigger). De trigger is de grens voor wie RLS omzeilt
  (eigenaar na `no force row level security`).
- **`app.rate_limits`**: policy `rate_limits_definer_delete_expired` — `as restrictive for delete to app_definer using (window_start <
  (select app.retention_cutoff('app.rate_limits')))`, naast de bestaande permissieve `rate_limits_definer_all` (`db/schema.snapshot.sql:782`),
  die ongewijzigd blijft voor `app.consume_rate_limit`.
- **Invariant "bewaarcatalogus"** (`db/tests/invarianten.sql`), met per regel een opzettelijke fout:
  1. elke tabel (`relkind in ('r', 'p')`) in `public` en `app` heeft een rij, behalve `public.schema_migrations`;
  2. geen rij verwijst naar een tabel die niet bestaat;
  3. `purger = 'app'`: tabel in `public` of `app`; `purger = 'auth'`: tabel in `better_auth`;
  4. `purger = 'app'` en `keep` niet null: `time_column` is een kolom van type `timestamptz`, `app_definer` heeft `select` en `delete`,
     en elke permissieve delete-policy `to app_definer` roept `app.retention_cutoff` aan, of er is een restrictieve delete-policy die dat doet;
  5. `app.audit_log` heeft `keep >= interval '1 year'` (spec audit-log, "Buiten scope").
- **Generator** (`scripts/kit/templates/migratie.sql.tmpl`): `insert into app.retention values ('public.__tabel__', null, null, 'app',
  'verdwijnt met het account (owner_id, on delete cascade)')` (OV-A5).

### Deel B — rol `app_jobs`

- **`db/init/01-roles.sql`**: `create role app_jobs login noinherit password 'app_jobs';`, `alter role app_jobs set statement_timeout = '5s'`
  en `idle_in_transaction_session_timeout = '10s'` (OV-B3); `connect` erbij in de `grant connect`-regel (`:30`).
  `db/init` draait alleen bij een lege container: een bestaande lokale database krijgt de rol pas na het opnieuw aanmaken van het volume
  of met de hand (notitie "Bij een update").
- **Migratie `…_app_jobs.sql`**: `grant usage on schema app to app_jobs`. Geen tabelgrants. De migratie faalt als de rol niet bestaat:
  in elke omgeving eerst het runbook.
- **Runbook** `docs/operations/rollen.md` (nieuw): alle rollen uit `db/init/01-roles.sql` per omgeving met echte geheimen, attributen,
  timeouts en `connect` (OV-B2); vult de verwijzing in framework §6 (`:182`).
- **Env** (`src/core/api/env.ts`): `JOBS_DATABASE_URL` verplicht (postgres-URL, zoals `DATABASE_URL`, OV-B1); `'app_jobs'` in
  `DEMO_DB_PASSWORDS` (`:17`) en in de lus van `checkSecrets` (`:85`); `Env.jobsDatabaseUrl`. Demo-waarde in `.env.example` en
  `db/test.env` (`postgres://app_jobs:app_jobs@…`), doorgegeven in `compose.yaml` (runner-env, `:34`) en in `scripts/check-image.sh` (`:30`).
  De workflows in `.github/` zetten geen database-URL's (de runner leest `db/test.env`); daar wijzigt niets.
- **Functiecatalogus** (`db/tests/functies.sql`): klasse `job` erbij (CHECK op `:9`); `verkeerde_grants` (`:40`) kijkt ook naar
  `app_jobs`: `job` → uitvoerbaar voor `app_jobs` en voor geen API-rol; `client` en `intern` → niet voor `app_jobs`.
- **Invarianten** (`db/tests/invarianten.sql`): `app_jobs` in `verboden_rechten` (`:22`); nieuw: `app_jobs` heeft geen tabel- of
  kolomrecht in `public`, `app` en `better_auth`, geen `usage` op `better_auth`, en de rolattributen `noinherit`, geen superuser,
  `createrole`, `createdb`, `bypassrls`, lid van geen rol.

### Deel C — runner (geen migratie)

- **`src/core/api/db`**: `withJob({ name, key }, work, options?)` op een eigen pool als `app_jobs` (`createPool`, `src/core/api/db/pool.ts:22`,
  krijgt `application_name` en omvang als parameter; voor jobs `jobs` en kleiner dan de API-pool). Eén transactie, eerst
  `current_user = session_user = 'app_jobs'`, dan de lock in twee-sleutelvorm (`<namespace>`, `key`):
  - standaard `pg_catalog.pg_try_advisory_xact_lock(…)`: `false` → rollback, `work` draait niet, resultaat `{ ran: false }`;
  - met `{ wait: true }` `pg_catalog.pg_advisory_xact_lock(…)`: wacht, begrensd door de `statement_timeout` van `app_jobs` (5 s); verlopen →
    fout (57014), transactie terug;
  - lock gekregen → `work(tx)` met Drizzle-`tx`, commit, `{ ran: true, value }`.
  Geen `set_config` van een actor: `app.current_user_id()` is null, dus elke functie van klasse `client` weigert. `closeDatabase()` sluit
  ook deze pool (`src/core/api/db/index.ts:18`). Export via `index.ts`, dus de exportlijst wordt `withUser()`, `withJob()`, `pingDatabase()`,
  `closeDatabase()` (plus `audit.ts` en `testing.ts`).
- **Readiness met de jobs-verbinding** (`src/core/api/db/index.ts:16`, OV-C4): de pool van `withJob` verbindt pas bij de eerste taak, dus
  zonder deze stap blijft `GET /api/ready` 200 bij verkeerde `JOBS_DATABASE_URL`-gegevens of een storing die alleen `app_jobs` raakt, terwijl
  elke taak (en later elke mail) faalt. Daarom:
  - `createPing(connectionString, timeoutMs, options?)` (`src/core/api/db/pool.ts:46`) krijgt een optioneel derde argument
    `{ applicationName, role }`: `applicationName` (standaard `'readiness'`, zoals nu) en `role`; met `role` is de query
    `select session_user` en faalt de ping als die niet gelijk is aan `role` (een URL met de gegevens van een andere rol telt als niet klaar).
    Zonder `options` blijft het gedrag exact zoals nu (`select 1`).
  - `index.ts` maakt een tweede ping `createPing(jobsDatabaseUrl, PING_TIMEOUT_MS, { applicationName: 'readiness-jobs', role: 'app_jobs' })`;
    `pingDatabase()` is `pingAll([ping, jobsPing])`: een nieuwe helper `pingAll(pings)` in `pool.ts` (via `testing.ts` te testen) draait
    de pings tegelijk met `Promise.allSettled`: hij wacht op **beide** uitkomsten en faalt pas daarna als één faalde. Zo eindigt een
    controle nooit terwijl een ping nog loopt: een snel falende jobs-ping laat de API-ping (pool met max 1) niet achter als lopende
    verbinding waar de volgende controle op wacht, en de single-flight van `createReadiness` (`checking`) blijft gelden voor beide pings.
    De export blijft `pingDatabase(): Promise<void>`:
    `src/api/server.ts` en `createReadiness` wijzigen niet, de exportlijst van `src/core/api/db` ook niet. `closeDatabase()` sluit ook deze ping.
  - Beide pings zijn elk begrensd op 900 ms en lopen parallel, dus samen blijven ze binnen de 2 s van ADR 0018 punt 3; cache en single-flight
    gelden voor het geheel (`src/core/api/http/readiness.ts`).
- **`src/core/api/jobs/`**: `defineJobs`-register (naam, nummer, interval, `run`), `startJobs({ jobs, … })` → `{ stop }`, en
  `runJobsOnce()` (één ronde, voor adapters van hosts die naar nul schalen, ADR 0020 punt 7; de template levert geen adapter).
  Constante `JOB_LOCK_NAMESPACE` (één vaste `int4`) en taaknummers 1–99 voor core, vanaf 100 voor de app (OV-C2). Interval standaard
  `JOBS_INTERVAL_SECONDS = 60` (`src/core/shared/limits.ts`), per taak te kiezen; eerste ronde direct na de start (OV-C1).
  Geen import van `pg` (`.dependency-cruiser.mjs:52` blijft gelden): `withJob` en `purgeExpired` worden geïnjecteerd vanuit `src/api/server.ts`.
  Een dubbel nummer of een nummer buiten het bereik gooit bij opstart. Per proces draait een taak nooit twee keer tegelijk.
  Een fout in een taak wordt gelogd (taaknaam, uitkomst, duur, foutklasse; geen SQL, geen adres) en stopt het proces niet.
- **Stoppen** (`src/api/server.ts:51`): `onStopped` roept eerst `jobs.stop()` aan (geen nieuwe ronde; wacht op de lopende batch), daarna
  `closeDatabase()` en `auth.closePool()`. Alles binnen `SHUTDOWN_TIMEOUT_MS` (`closeWithin`, `src/core/api/http/serve.ts:56`).
- **Uitbreidingsplek**: een app registreert eigen taken via de compositie-root (`src/api/server.ts`), zonder core te wijzigen (test in core,
  `.claude/rules/core.md`).

### Deel D — migratie `…_purge_expired.sql`, `purgeExpired()` en limieten

- **`app.retention_targets() returns setof regclass`** — security definer van `app_definer`, `set search_path = ''`, `stable`, geen
  overload; klasse `job`, `execute` alleen aan `app_jobs`. Geeft de tabellen met `purger = 'app'` en `keep` niet null, gesorteerd op naam (OV-A6).
- **`app.purge_expired(p_table regclass, p_batch integer) returns integer`** — security definer van `app_definer`, `set search_path = ''`,
  geen overload; klasse `job`, `execute` alleen aan `app_jobs`. In deze volgorde: geen rij in `app.retention` → 22023; `purger <> 'app'`
  → 22023; `p_batch` buiten `1 … 1000` (`MAX_PURGE_BATCH`) → 22023; `keep` null → `0`; anders verwijdert hij hooguit `p_batch` rijen met
  `<time_column> < app.retention_cutoff(p_table)` (dynamische SQL met `format('%s', p_table)` en `%I` voor de kolom; met een leeg
  `search_path` is de tabelnaam altijd met schema) en geeft het aantal terug. De delete-policy van de tabel is de tweede grens.
- **`purgeExpired()`** in `src/core/api/auth` (nieuw `purge.ts`, export via `src/core/api/auth/index.ts`), als `auth_service` op de pool van
  Better Auth (`src/core/api/auth/auth.ts:18`). Per tabel batches van `MAX_PURGE_BATCH`, hooguit `MAX_PURGE_BATCHES_PER_ROUND` per tabel,
  elke batch een eigen transactie met dezelfde lockvorm (eigen taaknummer): `session` met `"expiresAt" < now()` **of**
  `"createdAt" < now() - SESSION_ABSOLUTE_SECONDS`; `verification` met `"expiresAt" < now()`; `"rateLimit"` met
  `"lastRequest" < epoch-ms(now()) - AUTH_RATE_LIMIT_KEEP_SECONDS * 1000`. Termijnen uit `limits.ts`, niet uit `app.retention`.
- **Register**: twee core-taken, `core.purge_auth` en `core.purge`: per tabel uit `app.retention_targets()` een reeks `withJob` +
  `app.purge_expired`, tot een batch minder dan `MAX_PURGE_BATCH` geeft of `MAX_PURGE_BATCHES_PER_ROUND` bereikt is. Geeft `withJob`
  `{ ran: false }` (een andere instantie heeft de lock), dan stopt `core.purge` voor die tabel en gaat door met de volgende; geen fout, de
  rest volgt in de volgende ronde. Elke tabel heeft daarvoor dezelfde taaksleutel van `core.purge` (één batch tegelijk over alle instanties).
- **`src/core/shared/limits.ts`**: `MAX_PURGE_BATCH = 1000`, `MAX_PURGE_BATCHES_PER_ROUND = 100` (OV-D1), en voor Better Auth (OV-A4):
  - `AUTH_RATE_LIMIT_WINDOW_SECONDS = 10`: het standaardvenster, expliciet gezet in `src/core/api/auth/options.ts:171`
    (`rateLimit: { enabled: true, storage: 'database', window: AUTH_RATE_LIMIT_WINDOW_SECONDS }`); gelijk aan de huidige standaard
    (`better-auth/dist/context/create-context.mjs:173`), dus geen gedragswijziging;
  - `AUTH_RATE_LIMIT_KEEP_SECONDS = 60`: de opruimtermijn = het langste venster dat Better Auth 1.7.7 gebruikt. Naast het standaardvenster
    heeft Better Auth vaste regels: 10 s voor `/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*` en **60 s** voor
    `/request-password-reset`, `/send-verification-email`, `/forget-password*` en twee `/email-otp/…`-paden
    (`better-auth/dist/api/rate-limiter/index.mjs:305`–`:318`); de two-factor-plugin gebruikt 10 s. `/request-password-reset` en
    `/send-verification-email` staan in `DISABLED_PATHS` (`src/core/api/auth/options.ts:48`, `:64`) en krijgen een 404 vóór de rate limit
    (`better-auth/dist/api/index.mjs:166`), maar `/forget-password*` en `/email-otp/*` niet, en de rate limit draait vóór de routering
    (`:172`): een anonieme request op die paden maakt een rij met venster 60 s. Better Auth ruimt zelf op met hetzelfde langste venster
    (`rate-limiter/index.mjs:82`, `:187`–`:195`).
  Gelijkheidstests tegen de grens in `app.purge_expired` en de rijen in `app.retention`.
- **Toetsbaarheid van de 60 s** (de regels zijn niet geëxporteerd): (1) een unit-test eist dat de geïnstalleerde `better-auth` exact `1.7.7` is
  (`package.json`), met in de test de verwijzing naar `rate-limiter/index.mjs:305`–`:318`; bij een update faalt hij en moet de termijn
  opnieuw worden vastgesteld; (2) een integratietest: vier anonieme requests op `/api/auth/forget-password/x` binnen 60 s geven bij de vierde
  `429`, ook als tussen de derde en de vierde `purgeExpired()` draait (opruimen verkort geen lopend venster). Blijkt bij het bouwen een regel
  langer dan 60 s, dan stopt de developer en vraagt het (geen andere waarde invullen).

## Routes en foutcodes

n.v.t. — geen routes, permissies of foutcodes. Databasefouten van een taak gaan niet naar een client: ze worden gelogd. 22023 en 42501
uit de functies zijn fouten in de servercode.

## Hergebruik en UX

- **Bestaande componenten:** n.v.t. — geen scherm; de feiten (`node scripts/kit/feiten.mjs`) noemen geen component voor achtergrondtaken.
- **Hergebruik in API en database:** `createPool`/`ignoreIdleErrors` (`src/core/api/db/pool.ts`), `closeWithin` en `onStopped`
  (`src/core/api/http/serve.ts`), `writeJsonLine` (`src/core/api/obs/request-log.ts`) voor de taaklog, het patroon van `withUser()`
  (`current_user = session_user`, foutvertaling), de policy-`to app_definer`-aanpak van `app.rate_limits`, de invarianten
  (`db/tests/invarianten.sql`), de functiecatalogus (`db/tests/functies.sql`), `check-policies` en `check:secdef`.
- **Staten per scherm:** n.v.t. — geen scherm.
- **Alle zichtbare tekst letterlijk:** n.v.t. — geen UI-tekst; logregels zijn geen UI.
- **Focusvolgorde en toetsenbord:** n.v.t. — geen scherm.

## Acceptatiecriteria

### Deel A — bewaarcatalogus

- **jobs/AC-1** — `app.retention` heeft RLS aan en geforceerd, de kolommen en CHECKs uit deel A, alleen `select` voor `app_definer` en
  policy `retention_definer_select`; `app_authenticated`, `api_user` en `auth_service` hebben geen recht (`has_table_privilege` false).
- **jobs/AC-2** — `retention_definer_select: …` — als `app_definer` zijn alle rijen zichtbaar; als `app_authenticated` faalt `select` met 42501.
- **jobs/AC-3** — De catalogus bevat precies de rijen uit de tabel in deel A, met die `time_column`, `keep` en `purger`.
- **jobs/AC-4** — Invariant regel 1: een nieuwe tabel in `app` zonder rij wordt gevangen; regel 2: een rij voor een verwijderde tabel;
  regel 3: `purger = 'auth'` op een tabel in `app`; regel 4: `purger = 'app'` met een `time_column` van type `date`, en een tabel met een
  permissieve delete-policy `to app_definer` zonder `app.retention_cutoff` en zonder restrictieve policy; regel 5: `app.audit_log` met
  `keep = '11 months'` (elk in een teruggedraaide transactie).
- **jobs/AC-5** — `app.retention_cutoff('app.audit_log')` = `now() - 1 year`; voor `public.user_roles` `-infinity`; voor een tabel zonder rij 22023.
- **jobs/AC-6** — `audit_log_definer_delete: …` — als `app_definer` verwijdert `delete` een regel met `at` ouder dan 1 jaar; een regel van
  vandaag blijft staan: `delete` als `app_definer` en als `app_migrator` (lid van `app_definer`, onder FORCE RLS) raakt 0 rijen.
- **jobs/AC-7** — `audit_log_delete_expired_only`: in een teruggedraaide transactie, na `alter table app.audit_log no force row level security`
  als eigenaar (`app_migrator`), faalt een `delete` van een regel van vandaag met 42501 (trigger) en slaagt hij voor een regel van 366 dagen.
  `update` en `truncate` falen nog steeds voor elke rol (audit/AC-10 blijft groen); de audit-invariant eist precies vier policies en vangt
  een vijfde, en vangt een `delete`-grant aan een andere rol dan `app_definer`.
- **jobs/AC-8** — `rate_limits_definer_delete_expired: …` — als `app_definer` verwijdert `delete` een rij met `window_start` van 61 s geleden
  en laat een rij van 30 s geleden staan; `app.consume_rate_limit` werkt ongewijzigd (rate-limit-tests groen).
- **jobs/AC-9** — Integratie: in `app.retention` is `keep` van `app.rate_limits` gelijk aan `RATE_LIMIT_WINDOW_SECONDS`, van
  `better_auth.session` aan `SESSION_ABSOLUTE_SECONDS`, en van `better_auth.verification` `interval '0'` met `time_column` `expiresAt`
  (`extract(epoch from keep)` vergeleken met de constanten). De rij voor `"rateLimit"` toetst AC-35 (deel D).
- **jobs/AC-10** — `pnpm new:resource` maakt een migratie met de rij uit deel A in `app.retention`; de gegenereerde migratie haalt de
  invariant (generator-test, `test/rails/new-resource.test.ts`); `pnpm check:snapshot` groen.

### Deel B — rol `app_jobs`

- **jobs/AC-11** — Rol `app_jobs` bestaat lokaal en in de runner: `login`, `noinherit`, geen superuser, `createrole`, `createdb` of
  `bypassrls`, lid van geen rol; `statement_timeout = 5s` en `idle_in_transaction_session_timeout = 10s`.
- **jobs/AC-12** — `app_jobs` heeft `connect` en `usage` op `app`, geen enkel tabel- of kolomrecht in `public`, `app` en `better_auth`, en
  geen `usage` op `better_auth`; de invariant vangt een opzettelijke `grant select on app.audit_log to app_jobs`.
- **jobs/AC-13** — Functiecatalogus: een functie van klasse `job` die `app_jobs` niet mag uitvoeren, een `job`-functie die
  `app_authenticated` wél mag uitvoeren, en een `client`-functie die `app_jobs` mag uitvoeren worden elk gevangen.
- **jobs/AC-14** — Als `app_jobs` faalt `select app.current_user_id()`, `select app.assign_role(…)` en `select * from app.audit_log` met 42501.
- **jobs/AC-15** — Env: zonder `JOBS_DATABASE_URL` (of leeg) weigert `env()` met een melding voor die variabele; een niet-postgres-URL faalt.
- **jobs/AC-16** — Env, buiten `local`/`test`: `JOBS_DATABASE_URL` met wachtwoord `app_jobs`, leeg of gelijk aan de gebruikersnaam faalt
  (`DEMO_DB_PASSWORDS`, één test per regel); met `APP_ENV=local` slaagt de demo-waarde.
- **jobs/AC-17** — `scripts/check-image.sh` start de image met `JOBS_DATABASE_URL` en readiness geeft 503 zonder database (bestaand gedrag).
- **jobs/AC-18** — `docs/operations/rollen.md` bestaat en noemt elke rol uit `db/init/01-roles.sql` met dezelfde attributen en timeouts.

### Deel C — runner

- **jobs/AC-19** — `withJob` voert `work` uit in één transactie als `app_jobs` (`current_user` en `session_user` = `app_jobs`) en commit.
- **jobs/AC-20** — Try-variant: twee gelijktijdige `withJob`-aanroepen met dezelfde taak: precies één voert `work` uit, de ander krijgt
  `{ ran: false }` zonder te wachten (racetest met twee verbindingen); met verschillende taaknummers draaien beide.
- **jobs/AC-21** — Wachtende variant (`{ wait: true }`): terwijl een andere transactie de lock van dezelfde taak vasthoudt, wacht de aanroep en
  voert `work` uit zodra die commit (`{ ran: true }`); houdt de ander de lock langer vast dan de `statement_timeout`, dan faalt de aanroep
  (57014) en is er niets gecommit.
- **jobs/AC-22** — De lock is de twee-sleutelvorm en botst niet met `hashtext('public.user_roles:last_admin')`: een `withJob` loopt door
  terwijl een andere transactie de laatste-admin-lock vasthoudt.
- **jobs/AC-23** — Een fout in `work` draait de transactie terug en laat de lock los; de volgende `withJob` van dezelfde taak draait.
- **jobs/AC-24** — `startJobs` met een dubbel taaknummer, een core-taak met nummer ≥ 100 of een app-taak met nummer < 100 gooit bij opstart.
- **jobs/AC-25** — Een taak die langer duurt dan het interval start in hetzelfde proces niet opnieuw voordat hij klaar is; de eerste ronde
  start direct na `startJobs`.
- **jobs/AC-26** — Een taak die gooit, wordt gelogd met taaknaam en uitkomst zonder foutmelding van de database of adres, en de volgende
  ronde draait; het proces stopt niet (geen unhandled rejection).
- **jobs/AC-27** — Stoppen: met een batch die loopt, commit die batch (rij zichtbaar na het stoppen), er start geen nieuwe ronde, en pas
  daarna worden de pools gesloten; een `withUser` of `withJob` na het stoppen faalt.
- **jobs/AC-28** — `runJobsOnce()` draait elke geregistreerde taak precies één ronde en wacht tot alle klaar zijn.
- **jobs/AC-29** — Een fixture-app registreert een eigen taak zonder `src/core` te wijzigen; die draait via `startJobs` en `runJobsOnce`.
- **jobs/AC-44** — Readiness met de jobs-verbinding: de ping met `{ role: 'app_jobs' }` slaagt met `JOBS_DATABASE_URL` (direct), en faalt bij
  een geweigerde login (wachtwoord met één teken erbij) en bij een URL met de gegevens van `api_user` (`session_user` ≠ `app_jobs`); de ping
  zonder `options` gedraagt zich als voorheen (bestaande asserts in `test/datapad/ping.int.test.ts` blijven groen).
- **jobs/AC-45** — `pingAll` (de vorm van `pingDatabase()`) faalt als alleen de jobs-ping faalt en als alleen de API-ping faalt, en slaagt
  als beide slagen (unit met nep-pings); faalt de ene ping direct en loopt de andere nog, dan settled `pingAll` pas als ook die klaar is
  (unit met een uitgestelde nep-ping). Integratie: na `await pingDatabase()` is er in `pg_stat_activity` een verbinding met `usename =
  'app_jobs'` en `application_name = 'readiness-jobs'` (en een met `'readiness'` als `api_user`), zodat een `index.ts` die alleen de API-ping
  bedraadt rood is. `GET /api/ready` geeft daardoor 503 als alleen `app_jobs` niet kan verbinden, en de bestaande readiness-tests
  (`src/core/api/http/readiness.test.ts`, timeout 2 s, cache 1 s) blijven ongewijzigd groen.

### Deel D — opruimen

- **jobs/AC-30** — `app.retention_targets()` als `app_jobs` geeft precies de tabellen met `purger = 'app'` en `keep` niet null
  (`app.audit_log`, `app.rate_limits`); niet uitvoerbaar voor `app_authenticated`, `api_user` en `auth_service` (42501); catalogus: klasse `job`.
- **jobs/AC-31** — `app.purge_expired('app.audit_log', n)` als `app_jobs` verwijdert alleen regels ouder dan 1 jaar, hooguit `n` per aanroep,
  en geeft het aantal terug; regels van 364 dagen oud blijven.
- **jobs/AC-32** — `app.purge_expired` weigert met 22023: een tabel zonder rij in `app.retention`, `better_auth.session` (`purger = 'auth'`),
  `p_batch` 0 en 1001; voor `public.user_roles` (`keep` null) geeft hij 0 en verwijdert niets.
- **jobs/AC-33** — `app.purge_expired` is niet uitvoerbaar voor `app_authenticated`, `api_user` en `auth_service` (42501); catalogus: klasse `job`.
- **jobs/AC-34** — `purgeExpired()` verwijdert een sessie met `expiresAt` in het verleden, en een sessie met `createdAt` 7 dagen en 1 minuut
  geleden en `expiresAt` in de toekomst; een sessie van 6 dagen met `expiresAt` in de toekomst blijft (roadmap ST-03, **Klaar als**);
  verificaties met `expiresAt` in het verleden verdwijnen en een geldige uitnodigingslink blijft werken.
- **jobs/AC-35** — `purgeExpired()` verwijdert `"rateLimit"`-rijen met `lastRequest` van 61 s geleden en laat een rij van 59 s geleden staan;
  de rij in `app.retention` voor `"rateLimit"` heeft `keep` gelijk aan `AUTH_RATE_LIMIT_KEEP_SECONDS` (60).
- **jobs/AC-36** — Better Auth gebruikt `AUTH_RATE_LIMIT_WINDOW_SECONDS` als `rateLimit.window`; de geïnstalleerde `better-auth` is exact
  `1.7.7` (de versie waarvoor 60 s het langste venster is); en vier anonieme requests op `/api/auth/forget-password/x` binnen 60 s geven bij
  de vierde `429`, ook met een `purgeExpired()` tussen de derde en de vierde.
- **jobs/AC-37** — `purgeExpired()` werkt in batches van 1000: met 1001 verlopen sessies zijn er na één aanroep geen verlopen sessies meer, in
  twee transacties; met `MAX_PURGE_BATCHES_PER_ROUND` × 1000 + 1 verlopen rijen stopt één ronde na 100 batches (unit met nep-batches).
- **jobs/AC-38** — Twee gelijktijdige `purgeExpired()`-aanroepen: per batch draait er één; samen verwijderen ze elke verlopen rij precies
  één keer en geen geldige rij.
- **jobs/AC-39** — De taak `core.purge` haalt zijn tabellen uit `app.retention_targets()`; na één ronde zijn er in `app.audit_log` en
  `app.rate_limits` geen rijen ouder dan hun termijn, en een tabel die een fixture aan `app.retention` toevoegt, wordt ook opgeruimd.
- **jobs/AC-40** — `MAX_PURGE_BATCH` in `limits.ts` is gelijk aan de grens in `app.purge_expired`: een integratietest roept de functie als
  `app_jobs` aan met `MAX_PURGE_BATCH` (slaagt) en `MAX_PURGE_BATCH + 1` (22023).
- **jobs/AC-41** — `keep` van `better_auth."rateLimit"` in `app.retention` is gelijk aan `AUTH_RATE_LIMIT_KEEP_SECONDS` (integratie), en de
  rijen uit AC-9 blijven groen.
- **jobs/AC-42** — `pnpm check:secdef` en `pnpm check:snapshot` groen; `check-policies` vindt elke nieuwe policy op naam.
- **jobs/AC-43** — Houdt een andere transactie de lock van `core.purge` vast, dan krijgt `core.purge` voor die tabel `{ ran: false }`, slaat
  hem over zonder fout of foutlog en gaat door met de volgende tabel; de volgende ronde ruimt de overgeslagen tabel alsnog op.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Twee API-instanties, dezelfde taak | per batch één; de ander slaat over (`{ ran: false }`) | — |
| `core.purge` krijgt `{ ran: false }` voor een tabel | die tabel overslaan, door met de volgende; volgende ronde opnieuw; geen fout (AC-43) | — |
| Anonieme request op `/api/auth/forget-password*` of `/api/auth/email-otp/*` | rij in `"rateLimit"` met venster 60 s; opruimen pas na 60 s | — |
| Wachtende variant en de lock blijft bezet | wacht tot de `statement_timeout` (5 s), dan fout en rollback; gelogd | — |
| Proces crasht midden in een batch | transactie rolt terug, lock vervalt met de verbinding; volgende ronde doet het opnieuw (idempotent) | — |
| Database onbereikbaar | taak faalt, gelogd; volgende ronde opnieuw; readiness geeft 503 (ADR 0018) | — |
| Alleen `app_jobs` kan niet verbinden (verkeerde `JOBS_DATABASE_URL`, wachtwoord niet geroteerd, verbindingslimiet van de rol) | taak faalt, gelogd; readiness geeft 503 via de jobs-ping, ook als `api_user` wel verbindt (AC-44, AC-45) | — |
| `JOBS_DATABASE_URL` met de gegevens van een andere rol | jobs-ping faalt op `session_user`; readiness 503; `withJob` weigert al op de rolcontrole (AC-19) | — |
| SIGTERM tijdens een batch | runner maakt de batch af, start niets nieuws, daarna pools dicht; na `SHUTDOWN_TIMEOUT_MS` afgebroken (rollback) | — |
| Migratie voegt een tabel toe zonder rij in `app.retention` | `pnpm test:db` faalt op de invariant | — |
| App verkort de termijn van de audit log onder 1 jaar | invariant regel 5 faalt; vraagt review van de eigenaar | — |
| Rij in `app.retention` voor een tabel die later verdwijnt | invariant regel 2 faalt tot de rij weg is | — |
| `app.purge_expired` op een tabel met `keep` null | 0, niets verwijderd | — |
| `app_migrator` of `app_definer` verwijdert een auditregel binnen de termijn | 0 rijen (policy onder FORCE RLS); zonder FORCE (eigenaar) weigert de trigger met 42501 | — |
| Eigenaar zet FORCE RLS uit en de trigger uit | mogelijk als eigenaar (zoals ADR 0021 punt 6); de invariant (`pnpm test:db`) faalt bij elke migratie die het achterlaat | — |
| Sessie ouder dan 7 dagen die nog gebruikt wordt | `getSession()` weigert hem al (ADR 0003); opruimen verwijdert hem | — |
| `statement_timeout` tijdens een batch van 1000 | batch rolt terug, gelogd; volgende ronde opnieuw | — |
| Meer verlopen rijen dan 100 × 1000 | de rest volgt in de volgende ronde | — |
| Bestaande lokale database zonder rol `app_jobs` | migratie `…_app_jobs.sql` faalt; volume opnieuw maken of rol met de hand (notitie "Bij een update") | — |
| Host die naar nul schaalt | runner draait niet; adapter in `deploy/<host>/` roept `runJobsOnce()` aan (buiten deze spec) | — |

## Raakt ook

Beschermde paden (framework §10; eigenaarakkoord nodig, label `gate-wijziging` met goedkeuring van een goedkeurder):

- **Deel A:** `db/tests/invarianten.sql` (nieuwe invariant; audit-allowlists voor policies `:139`/`:142`, grants `:151`–`:152` met
  `('app_definer', 'DELETE')` en triggers `:163`; `plan()` wijzigt), `db/tests/audit_log.sql` (de assert op `audit_log_no_delete`, `:180`,
  wijzigt mee: bestaande test, met reden in de PR), `db/tests/functies.sql` (`app.retention_cutoff(regclass)` en
  `app.audit_log_guard_delete()`, beide `intern`), nieuw `db/tests/retention.sql`, `db/tests/rate_limits.sql` (nieuwe policy-assert);
  `scripts/kit/templates/migratie.sql.tmpl` en `test/rails/new-resource.test.ts`; `docs/framework.md` §6 (bullet bewaarcatalogus; "append-only"
  in de bullet audit log, `:215`, wordt "append-only, behalve verwijderen na de termijn") en `.claude/rules/database.md:43` (idem).
- **Deel B:** `db/init/01-roles.sql`; `.env.example`; `db/test.env`; `compose.yaml`; `scripts/check-image.sh`; `src/core/api/env.ts`
  (+ tests); `db/tests/functies.sql`, `db/tests/invarianten.sql`; `docs/framework.md` §6 (rollenlijst `:180`, timeouts `:184`,
  "Systeemjobs krijgen een aparte rol" `:176`, runbook `:182`, functiecatalogus `:210`). Niet beschermd: `docs/operations/rollen.md` (nieuw),
  `CHANGELOG.md` met een notitie onder "Bij een update" (`:75`): `JOBS_DATABASE_URL` toevoegen aan de eigen `.env.local` (een bestaande
  checkout start anders niet), en rol `app_jobs` lokaal aanmaken of het databasevolume opnieuw maken.
- **Wijzigings-ADR (vóór deel C):** nieuw ADR (volgende vrije nummer uit `node scripts/kit/feiten.mjs`, status `voorgesteld`) dat ADR 0020
  punt 1/2 (inclusief "langste venster" = 60 s) en context, ADR 0021 punt 6 en Tests (delete binnen de termijn: 0 rijen onder FORCE RLS) en
  ADR 0022 punt 5, en ADR 0018 punt 2, punt 4 en Gevolgen (readiness met de jobs-verbinding, OV-C4) wijzigt zoals onder "Afwijkingen van de ADR's";
  de tekst van 0018, 0020, 0021 en 0022 blijft (spoor 1).
- **Deel C:** `src/core/api/db/{index,pool}.ts` en nieuw `with-job.ts`, nieuw `src/core/api/jobs/`; `src/core/shared/limits.ts`
  (`JOBS_INTERVAL_SECONDS`); `src/api/server.ts`; de exportlijst van `src/core/api/db` (nu met `withJob()`, ook de wachtende variant) in
  `AGENTS.md` (sectie Lagen), `docs/framework.md` §1 (`:11`) en §2 (tabel, `:42`), en `.claude/rules/database.md:44`;
  mogelijk `.dependency-cruiser.mjs:73` (`db-alleen-via-index` als `with-job.ts` niet via `index.ts` loopt). Readiness (OV-C4):
  `src/core/api/db/pool.ts` (`createPing` met `options`) en `index.ts` (tweede ping, `closeDatabase()`), `test/datapad/ping.int.test.ts`
  (nieuwe asserts erbij; bestaande blijven), `src/core/api/db/testing.ts` (export `pingAll`), nieuw `src/core/api/db/ping-all.test.ts`, en
  de notitie in `CHANGELOG.md` (readiness wordt 503 zonder werkende `app_jobs`). Framework §1/§2 en de exportlijsten noemen `pingDatabase()`
  alleen als readiness; daar wijzigt niets.
- **Deel D:** `src/core/api/auth/` (nieuw `purge.ts`, `index.ts`, `options.ts:171`), `src/core/shared/limits.ts` (`MAX_PURGE_BATCH`,
  `MAX_PURGE_BATCHES_PER_ROUND`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_RATE_LIMIT_KEEP_SECONDS`), `db/tests/functies.sql` (`app.purge_expired(regclass, integer)` en
  `app.retention_targets()`, beide `job`), nieuw `db/tests/purge_expired.sql`.

Niet beschermd, wel mee: `db/schema.snapshot.sql` en `src/api/db/schema.ts` (gegenereerd, `pnpm db:generate`), `db/ids.json` als
een nieuwe kolom het vraagt, `CHANGELOG.md`, `docs/roadmap.md` ST-03/ST-05 (stand per deel; vinkje alleen met akkoord),
`docs/specs/rate-limit.md:40` (opruimen is nu besloten).

## Buiten scope

- Mail-outbox, `app.enqueue_mail` en de worker: spec [mail-outbox](mail-outbox.md) (ADR 0020 stap 9).
- FK-invariant (stap 10), export (stap 11), verwijderen (stap 12) en het privacy-sjabloon (stap 13): ADR 0022, eigen specs.
- Een adapter in `deploy/<host>/` en de uitzondering in framework §3 (ADR 0020 punt 7): bij de provider-ADR van een app.
- Rijen voor de clientfouten-tabel: komen met die tabel (ADR 0022 punt 5).
- Indexen op `better_auth` voor het opruimen (OV-D2): pas na meting.
- Een scherm of metriek voor taken (ST-10).

## Open vragen voor de eigenaar

**Specwijziging 2026-10-19 na Codex-review op #209:** de readiness met de jobs-verbinding (deel C, OV-C4, jobs/AC-44 en AC-45, de afwijking
van ADR 0018 en twee randgevallen) is een aanpassing van de architect/hoofdsessie ter beoordeling door de eigenaar met de merge; geen
eigenaarbesluit, behalve dat de eigenaar vroeg de Codex-reviews op te pakken. Voor OV-C4 geldt bij merge (a); de eigenaar kan in de PR (b)
of (c) kiezen, dan vervalt AC-45 en de afwijking van ADR 0018.

- **OV-C4 — Readiness en de jobs-verbinding (bij merge geldt (a), zie hierboven).** Codex-review op #209: `src/api/server.ts:41` geeft alleen
  `pingDatabase` (pool van `DATABASE_URL`) aan readiness; de pool van `withJob` is lui, dus bij een fout die alleen `app_jobs` raakt blijft
  readiness 200 en blijft uitnodigen slagen terwijl elke mail blijft hangen. (a) `pingDatabase()` controleert ook `app_jobs` (voorstel in
  deel C): een instantie zonder werkende jobs-verbinding krijgt geen verkeer, maar een storing die alleen `app_jobs` raakt haalt dan **alle**
  instanties uit de rotatie, ook voor routes die geen taak nodig hebben; (b) een aparte controle bij opstart (één verbinding als `app_jobs`
  vóór `startServer`; faalt → proces stopt): vangt verkeerde gegevens bij de uitrol, niet een latere storing; (c) alleen een logregel per
  mislukte ronde (bestaand, AC-26) en alarmering (ST-10). Voorstel: (a); kiest de eigenaar (b) of (c), dan vervallen AC-45 en de afwijking
  van ADR 0018, en blijft AC-44 alleen voor de opstartcontrole (b).

**Besluit van de eigenaar, 2026-10-19 (in de sessie, herkomst: opdracht "neem aanbevelingen over"):** alle vragen hieronder zijn beantwoord
met de aanbeveling of, waar een vraag alleen een voorstel noemt (OV-C3), met dat voorstel. De alternatieven blijven staan als herkomst
van de keuze. Dit besluit geeft geen akkoord op de beschermde paden uit "Raakt ook"; dat volgt apart. De gekozen waarden staan in de body.

- **OV-A1 — Termijn van `app.rate_limits`.** Een rij is na `RATE_LIMIT_WINDOW_SECONDS` (60 s) betekenisloos: de volgende request begint
  dan toch opnieuw (`db/schema.snapshot.sql:162`). Opties: (a) `keep` = het venster; (b) een langere termijn (bijv. 1 dag); (c) `keep` null,
  niet opruimen (groeit tot gebruikers × categorieën). Aanbeveling: (a), met een gelijkheidstest tegen `limits.ts`.
- **OV-A2 — Delete-policy op `app.rate_limits`.** `rate_limits_definer_all` (`using (true)`, voor alle commando's) maakt een
  termijn-policy zinloos, want permissieve policies tellen op. (a) een `as restrictive`-policy `rate_limits_definer_delete_expired` voor delete
  met de termijn erbij; (b) `rate_limits_definer_all` splitsen in select/insert/update en een eigen delete-policy. Aanbeveling: (a); geen
  wijziging aan wat `app.consume_rate_limit` nodig heeft. Invariant regel 4 telt dan ook een restrictieve policy.
- **OV-A3 — Welke `better_auth`-tabellen in de catalogus.** ADR 0022 noemt `session`, `verification` en `rateLimit`. Ook `user`, `account`
  en `twoFactor` met `keep` null (één register voor alle persoonsgegevens)? En `"rateLimit"."lastRequest"` is `bigint` (epoch-ms,
  `db/schema.snapshot.sql:462`), geen `timestamptz`: regel 4 van de invariant geldt daarom alleen voor `purger = 'app'`. Aanbeveling: alle zes, en de
  typecontrole alleen voor `app`.
- **OV-A4 — Termijn van `better_auth."rateLimit"`.** ADR 0020 punt 2 zegt "ouder dan het langste rate-limit-venster, uit `limits.ts`", maar dat
  venster staat niet in `limits.ts`: Better Auth 1.7.7 gebruikt zijn standaard (`rateLimit.window` 10 s,
  `better-auth/dist/context/create-context.mjs:173`) plus eigen regels per pad. Bovendien ruimt Better Auth 1.7.7 zelf rijen op die ouder zijn dan
  het langste geziene venster (`better-auth/dist/api/rate-limiter/index.mjs:174`), maar alleen als er verkeer is. Opties: (a) een constante
  `AUTH_RATE_LIMIT_WINDOW_SECONDS` in `limits.ts`, expliciet als `rateLimit.window` in `src/core/api/auth/options.ts:171`, en `purgeExpired()`
  ruimt op na het langste venster dat Better Auth gebruikt (test op de geconfigureerde regels); (b) `"rateLimit"` niet opruimen (Better Auth
  doet het) en alleen een rij met reden. Aanbeveling: (a); de ADR-tekst "wordt nooit kleiner" (context) klopt voor 1.7.7 niet meer.
- **OV-A5 — Rij in het generator-template.** Welke `keep` en `reason` krijgt een nieuwe resource? Aanbeveling: `keep` null, `purger` `app`,
  reden "verdwijnt met het account (owner_id, on delete cascade)"; een app wijzigt dat met een eigen migratie.
- **OV-A6 — Hoe weet `app_jobs` welke tabellen hij moet opruimen.** ADR 0022 punt 5 zegt "alleen `app_definer` en `app_jobs` lezen"
  `app.retention`; ADR 0020 punt 4 geeft `app_jobs` alleen `execute` op functies van klasse `job`. (a) een functie
  `app.retention_targets() returns setof regclass` (klasse `job`: tabellen met `purger = 'app'` en `keep` niet null); (b) `select` op
  `app.retention` aan `app_jobs` met een policy. Aanbeveling: (a), want `app_jobs` houdt dan geen enkel tabelrecht; ADR 0022 punt 5 krijgt dan een
  correctie (procedure "Correctie aan een geaccepteerd ADR", `docs/operations/agent-doorloop.md`).
- **OV-B1 — `JOBS_DATABASE_URL` verplicht of optioneel.** Verplicht (zoals `DATABASE_URL`; zonder geen opstart) of optioneel (zonder draait geen
  runner). Aanbeveling: verplicht; een API zonder opruimen en zonder mail valt anders niet op.
- **OV-B2 — Omvang van het runbook.** Framework §6 (`:182`) verwijst naar "het runbook" voor de rollen per omgeving, maar dat bestaat niet.
  Alleen `app_jobs`, of alle rollen uit `db/init/01-roles.sql`? Aanbeveling: alle rollen.
- **OV-B3 — Timeouts van `app_jobs`.** Aanbeveling: gelijk aan `api_user` (`statement_timeout = '5s'`, `idle_in_transaction_session_timeout = '10s'`).
- **OV-C1 — Interval.** ADR 0020 zegt "bijv. elke minuut". Een vaste waarde in `limits.ts`, of per taak? Draait de eerste ronde direct na de
  start of na één interval? Aanbeveling: `JOBS_INTERVAL_SECONDS = 60` als standaard per taak (de mail-taak kiest in de spec mail-outbox een eigen
  waarde), eerste ronde direct na de start.
- **OV-C2 — Locknamespace en taaknummers.** Welke vaste `int4` voor `<namespace>`, en welk bereik voor core en app? Aanbeveling: één
  constante in `src/core/api/jobs/`, nummers 1–99 voor core en vanaf 100 voor de app (zoals ADR-nummers, `feiten.mjs`).
- **OV-C3 — Vorm van `withJob`.** ADR 0020 noemt `withJob(name, work)`. Voorstel: `withJob({ name, key }, work)` met resultaat
  `{ ran: false } | { ran: true, value }`, zodat overslaan zichtbaar is zonder exception. Akkoord?
- **OV-D1 — Batchgrootte.** ADR 0020 zegt "bijv. 1000". Aanbeveling: `MAX_PURGE_BATCH = 1000` en hooguit 100 batches per tabel per ronde, zodat
  een ronde begrensd blijft.
- **OV-D2 — Indexen op `better_auth`.** `session."expiresAt"`/`"createdAt"`, `verification."expiresAt"` en `"rateLimit"."lastRequest"` hebben geen
  index (`db/schema.snapshot.sql:654`–`:682`); opruimen wordt dan een volledige scan per batch. Een migratie met deze indexen in schema
  `better_auth` (buiten de SQL van `scripts/auth-schema.mjs`), of eerst meten? Aanbeveling: eerst meten; pas bij de eerste app met volume.

## Testplan

Bewijsmatrix (tester schrijft rood vóór de developer; bij een migratie één `pnpm test:db`-run, ADR 0025 punt 9).

| Bewijs | Soort | Plaats | AC |
|---|---|---|---|
| tabel, grants, policy op naam (`retention_definer_select: …`), rijen, cutoff | pgTAP + `check-policies` | `db/tests/retention.sql` | AC-1 t/m AC-3, AC-5 |
| invariant bewaarcatalogus, elke regel met opzettelijke fout | pgTAP | `db/tests/invarianten.sql` | AC-4 |
| `audit_log_definer_delete: …` (0 rijen binnen de termijn, ook als `app_migrator`), rij-trigger zonder FORCE in teruggedraaide transactie, update/truncate dicht, allowlists | pgTAP | `db/tests/audit_log.sql`, `db/tests/invarianten.sql` | AC-6, AC-7 |
| `rate_limits_definer_delete_expired: …` | pgTAP | `db/tests/rate_limits.sql` | AC-8 |
| `app.retention` gelijk aan `limits.ts` | integratie | `test/datapad/retention-limits.int.test.ts` | AC-9, AC-35, AC-41 |
| generator maakt rij | unit | `test/rails/new-resource.test.ts` | AC-10 |
| rolattributen, rechten, `better_auth` dicht, verboden rechten | pgTAP | `db/tests/invarianten.sql` | AC-11, AC-12 |
| klasse `job` in de catalogus, met opzettelijke fouten | pgTAP | `db/tests/functies.sql` | AC-13 |
| `app_jobs` geweigerd op client-functies en tabellen | pgTAP | `db/tests/app_jobs.sql` | AC-14 |
| env-schema `JOBS_DATABASE_URL` en demo-wachtwoord | unit | `src/core/api/env.test.ts`, `src/core/api/env-schema.test.ts` | AC-15, AC-16 |
| image start met de nieuwe env | script | `scripts/check-image.sh` | AC-17 |
| `withJob`: rol, commit, try-race, wachtende variant met timeout, geen botsing met hashtext-lock, rollback | integratie (twee verbindingen) | `test/jobs/with-job.int.test.ts` | AC-19 t/m AC-23 |
| register, nummerbereik, geen overlap, fout gelogd, `runJobsOnce`, fixture-app | unit (nep-`withJob`) | `src/core/api/jobs/*.test.ts` | AC-24 t/m AC-26, AC-28, AC-29 |
| stopvolgorde met lopende batch | integratie | `test/jobs/shutdown.int.test.ts` | AC-27 |
| jobs-ping: slaagt als `app_jobs`, faalt bij geweigerde login en bij een andere rol; ping zonder `options` ongewijzigd | integratie | `test/datapad/ping.int.test.ts` | AC-44 |
| `pingAll` faalt als één van de pings faalt, slaagt als alle slagen, settled pas na beide; bestaande readiness-tests groen | unit (nep-pings) + bestaande unit | `src/core/api/db/ping-all.test.ts`, `src/core/api/http/readiness.test.ts` | AC-45 |
| `pingDatabase()` opent een verbinding als `app_jobs` met `application_name = 'readiness-jobs'` (`pg_stat_activity`) | integratie | `test/datapad/ping.int.test.ts` | AC-45 |
| `app.retention_targets`, `app.purge_expired`: termijn, batch, weigeringen, rechten | pgTAP | `db/tests/purge_expired.sql` | AC-30 t/m AC-33 |
| `MAX_PURGE_BATCH` gelijk aan de grens in `app.purge_expired` | integratie | `test/jobs/purge.int.test.ts` | AC-40 |
| `purgeExpired()`: sessies (beide regels), verificaties, rateLimit, 1001 rijen in twee batches, race | integratie | `test/jobs/purge-auth.int.test.ts` | AC-34, AC-35, AC-37 (integratiedeel), AC-38 |
| ronde stopt na `MAX_PURGE_BATCHES_PER_ROUND` batches | unit (nep-batches) | `src/core/api/jobs/purge.test.ts` | AC-37 (unitdeel) |
| `rateLimit.window`, versiepin `better-auth` 1.7.7 | unit | `src/core/api/auth/purge.test.ts` | AC-36 |
| 60-s-regel blijft gelden na opruimen (`/api/auth/forget-password/x`) | integratie | `test/jobs/purge-auth.int.test.ts` | AC-36 |
| taak `core.purge` via `app.retention_targets()`, overslaan bij `{ ran: false }` | integratie | `test/jobs/purge.int.test.ts` | AC-39, AC-43 |
| secdef, snapshot, policies | `pnpm check:secdef`, `pnpm check:snapshot`, `pnpm test:db` | — | AC-42 |

Gates per deel: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm ratchet`, `pnpm test:unit`, `pnpm check:migrations` (A, B, D),
`pnpm check:secdef` (A, D), `pnpm test:db` en `pnpm check:snapshot` (alle delen), `pnpm ui:check` (C: de server start met de runner).
