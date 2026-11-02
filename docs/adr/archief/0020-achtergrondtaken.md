# 0020 — Achtergrondtaken: opruimen en mail-outbox

Status: vervangen door 0050

## Context

Roadmap (Beslissingen, stuk 7) vraagt een besluit over achtergrondtaken: opruimen van verlopen rijen en mail via een outbox,
met een eigen databaserol voor systeemjobs (framework §6: "Systeemjobs krijgen een aparte rol").

Wat er nu groeit of misgaat:

- `better_auth.session`, `better_auth.verification` (uitnodigings- en resetlinks) en `better_auth."rateLimit"`: Better Auth ruimt
  verlopen rijen alleen op als het ze tegenkomt. `rateLimit` krijgt een rij per IP en pad en wordt nooit kleiner. Een sessie
  verloopt absoluut na 7 dagen (ADR 0003), maar dat controleert alleen `authGateway().getSession()` bij gebruik; `expiresAt` is
  het idle-venster, dus een ongebruikte sessie blijft tot dan staan, met `ipAddress` en `userAgent`.
- Uitnodigen stuurt de mail binnen de request (`sendResetPassword` → `sendInvitation` → SMTP). Valt SMTP even weg, dan faalt de
  uitnodiging voor de gebruiker, terwijl het account al bestaat. Herstel is nu `reinviteRoute` met de hand.
- Een app krijgt meer mails (melding, e-mail wijzigen) en eigen opruimwerk (bewaartermijnen, ADR 0022).
- Grenzen die vastliggen: alleen `src/core/api/db` maakt databaseverbindingen (en `src/core/api/auth` voor Better Auth) en
  exporteert alleen `withUser()`, `pingDatabase()` en `closeDatabase()` (AGENTS.md, framework §1/§2); `auth_service` leest en
  schrijft alleen schema `better_auth` (framework §2, ADR 0010).

## Besluit (voorstel)

1. **Runner in het API-proces, coördinatie in Postgres.** `startJobs()` in `src/core/api/jobs/` draait elke taak op een interval
   (bijv. elke minuut) vanuit `src/api/server.ts`. De runner maakt zelf geen verbinding: hij krijgt bij het starten twee functies
   geïnjecteerd (punt 2). Een taak werkt in batches; **elke batch is één transactie** die eerst
   `pg_try_advisory_xact_lock(<namespace>, <taak>)` neemt (twee-sleutelvorm, twee `int4`'s). Lukt de lock niet, dan slaat deze
   instantie de batch over; met meerdere instanties draait een batch er hooguit één tegelijk. Opruimen is idempotent, dus een lock
   per batch is genoeg. `<namespace>` is één vaste waarde voor jobs, `<taak>` een vast nummer uit het register in
   `src/core/api/jobs/` (een app-taak krijgt een nummer bij registratie; een dubbel nummer faalt bij opstart). De twee-sleutelvorm
   valt in een andere lockruimte dan de één-sleutelvorm met `hashtext(…)` (bijv. de laatste-admin-lock op `public.user_roles`),
   dus ze botsen nooit. Stoppen: `src/api/server.ts` stopt eerst de runner (wacht op een lopende batch, binnen
   `SHUTDOWN_TIMEOUT_MS`) en sluit daarna de pools (`closeDatabase()`, `auth.closePool()`). Geen extra proces, geen queue-dienst:
   werkt op elke containerhost (ADR 0002, ADR 0019). Hosts die naar nul schalen: punt 7.
2. **Verbindingen blijven waar ze horen.**
   - `src/core/api/db` krijgt een export `withJob(name, work)`: een eigen kleine pool als `app_jobs` (`JOBS_DATABASE_URL`), één
     transactie met de advisory lock van punt 1; zonder lock komt `work` niet aan de beurt. Binnen `work` alleen de functies van
     klasse `job` (punt 4). `closeDatabase()` sluit ook deze pool.
   - `src/core/api/auth` krijgt een export `purgeExpired()`: opruimen van `better_auth` als `auth_service` op de pool van Better
     Auth (die rol beheert dat schema al, ADR 0010), in batches van bijv. 1000 rijen, elke batch een eigen transactie met dezelfde
     lockvorm: sessies met `expiresAt` verstreken **of** `createdAt < now() - 7 dagen` (de absolute termijn, `SESSION_ABSOLUTE_SECONDS`),
     verificaties met `expiresAt` verstreken, en `rateLimit`-rijen ouder dan het langste rate-limit-venster. De termijnen komen uit
     `limits.ts`; ze staan ook als rij in `app.retention` (ADR 0022, punt 5), en een integratietest bewijst dat die gelijk zijn.
   - Gevolg: de exportlijst van `src/core/api/db` in AGENTS.md en framework §1 en §2 (tabel "Database-toegang") wijzigt
     (beschermd, akkoord van de eigenaar).
3. **Mail-outbox** in `app.mail_outbox` (RLS aan en geforceerd), **zonder token**:
   - Kolommen: `id`, `kind`, `user_id text references better_auth."user"(id) on delete cascade` (een verwijderd account neemt zijn
     mails mee), `recipient text` (alleen voor app-mails naar een adres dat geen account is, bijv. een nieuw e-mailadres; leeg
     voor core-mails), `send_after`, `attempts`, `locked_until`, `sent_at`, `failed_at`, `last_error` (foutcode, geen SMTP-tekst
     met adressen), `created_at`. Geen payload met link of token.
   - **Erin** via `app.enqueue_mail(kind, user_id)` (security definer van `app_definer`, klasse `client`): eist een actor
     (`app.current_user_id()` niet null → anders 42501) en heeft een allowlist van soorten; de core-soorten (`core.invitation`,
     `core.password_reset`) eisen bovendien `app.is_mfa_admin()`. De route roept hem aan in zijn eigen `withUser()`-transactie,
     zodat mail en auditregel (ADR 0021) samen committen of samen terugdraaien. Een app-soort krijgt een eigen definer-functie
     van de app met eigen actor-check, die in dezelfde tabel schrijft (zoals `app.audit` naast de core-acties). `auth_service`
     schrijft niets in schema `app`: framework §2 en §3 en ADR 0010 blijven intact.
   - **Verzenden** met een lease, at-least-once: (1) claimen in een `withJob`-transactie via een functie van klasse `job`
     (`for update skip locked`, `locked_until = now() + lease`, `attempts + 1`), commit; (2) versturen buiten de transactie;
     (3) markeren in een nieuwe transactie (`sent_at`, of bij een fout `last_error` en `send_after` met backoff; na N pogingen
     `failed_at`). Valt de worker weg tussen (2) en (3), dan claimt een andere worker de rij na `locked_until` opnieuw: de mail
     kan dan twee keer gaan, nooit nul keer.
   - **Een core-mail maakt de link pas bij verzenden**: de worker zoekt het adres via Better Auth op (`user_id`), verwijdert oude
     reset-tokens van die gebruiker (zoals `reinviteUser` nu) en roept `auth.api.requestPasswordReset` aan; `sendResetPassword`
     mailt dan direct vanuit de worker via SMTP. Alleen de nieuwste link werkt, ook na een dubbele verzending.
   - **Na verzenden of definitief mislukken** wordt `recipient` leeggemaakt. De rij blijft tot de termijn in `app.retention`
     (ADR 0022; standaard 30 dagen op `created_at`).
   - **Status voor de admin** via de view `app.accounts` (laatste uitnodiging: in de rij, verstuurd of mislukt); daarvoor krijgt
     `app.mail_outbox` een policy `for select to app_definer`. Geen policy voor `app_authenticated`.
4. **Eigen rol `app_jobs`** (login, `noinherit`), aangemaakt in `db/init/01-roles.sql` en per omgeving via een nieuw runbook
   `docs/operations/rollen.md`: `connect` op de database, `usage` op schema `app`, `statement_timeout` en
   `idle_in_transaction_session_timeout` (zoals `api_user`), en alleen `execute` op de functies van een nieuwe klasse **`job`** in de
   functiecatalogus (`db/tests/functies.sql`): uitvoerbaar voor `app_jobs`, voor geen enkele API-rol. De invarianten
   (`db/tests/invarianten.sql`) nemen `app_jobs` op in de rollen zonder TRUNCATE, REFERENCES of TRIGGER en zonder rechten op
   `better_auth`. Nieuwe env-variabele `JOBS_DATABASE_URL` (env-schema, demo-wachtwoord in de lijst van `src/core/api/env.ts` met
   een test, demo-waarde in `.env.example`). Framework §6 noemt de rol in de rollenlijst en bij de timeouts.
5. Elke taak heeft een integratietest: opruimen verwijdert alleen verlopen rijen (roadmap stuk 7, **Klaar als**), ook een sessie
   ouder dan 7 dagen met een latere `expiresAt`; de outbox claimt een rij nooit twee keer bij twee gelijktijdige workers
   (racetest), claimt hem opnieuw na een verlopen lease, probeert opnieuw na een SMTP-fout en zet na N pogingen `failed_at`; na
   verzenden staat er geen adres meer in de rij; `app.enqueue_mail` weigert een onbekende soort, een lege actor en (voor een
   core-soort) een admin zonder MFA.
6. **Volgorde bij stoppen**: zie punt 1 (runner eerst, dan de pools); een test bewijst dat een lopende batch zijn transactie afmaakt.
7. **Hosts die naar nul schalen of serverless draaien** hebben geen proces dat elke minuut wakker is. Daar roept de adapter in
   `deploy/<host>/` op de cron van de host één ronde van de runner aan (`runJobsOnce()` uit `src/core/api/jobs/`). Kan de host alleen
   een HTTP-pad aanroepen, dan registreert de adapter dat pad zelf, alleen met een geheim van de host. Dat is een nieuwe
   uitzondering in framework §3 (een route buiten `defineRoute` en zonder login, alleen in `deploy/<host>/`) en verruimt "een
   adapter importeert de app en doet verder niets" (framework §2); beide beschermd, akkoord van de eigenaar. De template levert
   geen adapter: de app legt het vast in zijn provider-ADR.

## Besluiten op de open punten (agent, 2026-10-11)

- OV-1: eigen rol `app_jobs`, zoals framework §6 vraagt.
- OV-2: `JOBS_DATABASE_URL` met demo-waarde in `.env.example` en de rol in `db/init/01-roles.sql` (beschermde paden, onder het mandaat).
- OV-3: outbox; de accountlijst toont een mislukte verzending.

## Open punten voor de eigenaar (oorspronkelijk)

- **OV-1: eigen rol `app_jobs` (aanbeveling) of geen nieuwe rol.** Alternatief zonder nieuwe rol: grant `execute` op de interne
  functies rechtstreeks aan `api_user`. Binnen `withUser()` is de rol `app_authenticated` (en `api_user` is `noinherit`), dus een
  route kan ze niet aanroepen; alleen core-code met een eigen verbinding kan het. Scheelt een rol, een env-variabele en een
  runbookstap, maar wijkt af van framework §6 en maakt één gelekte `DATABASE_URL` krachtiger. Aanbeveling: eigen rol.
- **OV-2: `.env.example` en `db/init/` zijn beschermd.** De demo-waarde voor `JOBS_DATABASE_URL` en de nieuwe rol vragen akkoord.
- **OV-3: uitnodiging synchroon blijven tonen of niet.** Met de outbox meldt "uitnodigen" succes zodra de mail in de rij staat;
  een mislukte verzending ziet de admin pas later (status in de accountlijst). Aanbeveling: outbox, met status in de lijst.

## Alternatieven

- **Queue-bibliotheek (pg-boss, graphile-worker).** Volwassen, maar een nieuwe dependency met eigen schema en rechten die niet
  door onze RLS-invarianten en functiecatalogus gaan; meer dan nodig voor opruimen en één soort mail.
- **Cron van de host of een aparte worker-container als standaard.** Per provider anders (ADR 0002) en een tweede deploy-eenheid;
  alleen als uitweg voor hosts die naar nul schalen (punt 7).
- **Geen outbox, wel opnieuw proberen in de request.** Houdt de request lang vast en lost het gat "account bestaat, mail niet
  verstuurd" niet op.
- **Link (token) in de outbox, enqueue door `auth_service`.** Eerste versie van dit besluit; verworpen na review: een token in een
  tabel buiten `better_auth` en `auth_service` die in schema `app` schrijft (framework §2, ADR 0010).

## Gevolgen

- Nieuwe map `src/core/api/jobs/` (runner, register, `runJobsOnce()`), `withJob()` in `src/core/api/db`, `purgeExpired()` in
  `src/core/api/auth`; migraties voor `app.mail_outbox` en de functies; pgTAP voor de functiecatalogus (klasse `job`), RLS en de
  invarianten; runbook `docs/operations/rollen.md`.
- `inviteUser` maakt alleen nog het account; de route zet de mail in de outbox (`app.enqueue_mail`) in zijn eigen transactie.
  `reinviteUser` wordt "oude tokens weg en enqueue". De SMTP-mailer en `sendResetPassword` draaien voortaan in de worker.
- AGENTS.md (exportlijst `src/core/api/db`), framework §1, §2, §3 (bij punt 7) en §6 (rollen, timeouts) wijzigen: beschermd,
  akkoord van de eigenaar.

## Bouwvolgorde

Kleine PR's, elk met eigen spec waar AGENTS.md dat eist (migratie, route, permissie). Tussen haakjes: waar hij op wacht.

1. **requestId van de server**: de request-log en de foutresponse gebruiken een server-gegenereerde ID; een `X-Request-Id` van de
   client wordt niet overgenomen (ADR 0021, voorwaarde).
2. **`app.request_id`**: `withUser()` zet hem met `set_config(…, true)`, `app.request_id()` leest hem (1).
3. **Audit log**: `app.audit_log`, triggers, `app.audit`, `app.audit_account_action`, auditregel in `app.assign_role`; invariant
   en policy-allowlist (ADR 0021) (2).
4. **Auditregels in routes**: `ctx.audit`, `defineAuditActions`, de accountroutes schrijven hun regel (3).
5. **Bewaarcatalogus**: `app.retention`, `app.retention_cutoff(regclass)`, invariant, rij voor elke bestaande tabel, generator-template
   (ADR 0022) (3, voor de rij van de audit log).
6. **Rol `app_jobs`**: `db/init/01-roles.sql`, runbook, env-schema met demo-wachtwoord, invarianten, klasse `job`, framework §6.
7. **Runner**: `src/core/api/jobs/`, `withJob()`, register, stopvolgorde in `src/api/server.ts` (6).
8. **Opruimen**: `app.purge_expired` (klasse `job`) en `purgeExpired()` in `src/core/api/auth` (5, 7).
9. **Outbox zonder token**: `app.mail_outbox`, `app.enqueue_mail`, worker met lease, status in `app.accounts` (3, 5, 7).
10. **FK-invariant**: elke foreign key naar `better_auth."user"` kiest `cascade` of `set null` (ADR 0022).
11. **Export**: `GET /api/me/export`, definer-functies voor `better_auth` en de audit log, `privacy.exporters` (3, 5).
12. **Verwijderen**: `app.delete_account`, `privacy.erasers`, route en scherm (3, 9, 10).
13. **Privacy-sjabloon**: `docs/privacy/_template.md` (5).

## Correcties na review (2026-10-11)

- **Token uit de outbox, `auth_service` niet in schema `app`** (A3): de route zet `{kind, user_id}` via `app.enqueue_mail` in zijn
  eigen transactie; de worker maakt de link pas bij verzenden via `auth.api.requestPasswordReset` (punt 3). Was: payload met link,
  enqueue door `auth_service`.
- **Jobs-verbinding** (A4): `withJob()` in `src/core/api/db` en `purgeExpired()` in `src/core/api/auth`, geïnjecteerd in de runner;
  AGENTS.md en framework §1/§2 wijzigen als gevolg (punt 2).
- **Lease en at-least-once** (B1): claimen, committen, versturen, markeren; de racetest bewijst "nooit twee keer geclaimd", niet
  "precies één keer verstuurd" (punt 3, 5).
- **Outbox-kolommen** (B2): `user_id` met FK `on delete cascade`, geen token, `recipient` leeg na verzenden of definitief mislukken,
  rij in `app.retention`, status via `app.accounts` met een select-policy `to app_definer` (punt 3).
- **Rol `app_jobs` volledig** (B4): `connect`, `usage` op `app`, beide timeouts, demo-wachtwoord in de env-check, invarianten,
  klasse `job`, runbook `docs/operations/rollen.md`, framework §6 (punt 4).
- **Advisory lock per batch, twee-sleutelvorm** (B6): geen lock over een hele run; geen botsing met `hashtext`-locks (punt 1).
- **Sessies ook op `createdAt`** (C7): de absolute termijn van 7 dagen; de `better_auth`-termijnen staan in `app.retention` (punt 2).
- **Hosts die naar nul schalen** (C8): adapter in `deploy/<host>/` op de cron van de host, nieuwe uitzondering in framework §3 (punt 7).
- **Stopvolgorde** (D): runner eerst, dan de pools (punt 1, 6).
- **Bouwvolgorde** toegevoegd.
