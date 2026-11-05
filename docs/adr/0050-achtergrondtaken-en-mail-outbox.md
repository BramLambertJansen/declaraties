# 0050 — Achtergrondtaken en mail-outbox

Status: geaccepteerd

Vervangt [0020](0020-achtergrondtaken.md) en [0036](0036-achtergrondtaken-correcties.md). Drempel: A4. Consolidatie met de
correcties uit 0036 punt 1–3 verwerkt (eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen). De correcties uit
0036 op readiness en de audit log staan in [0049](0049-readiness-en-productie-image.md) en [0051](0051-audit-log-en-avg.md).

## Context

0020 is op 2026-10-11 door de agent geaccepteerd onder mandaat van de eigenaar, ter herziening; de eigenaar koos "zelfde
besluiten, compact". De correcties van 0036 punt 1–3 volgen uit eigenaarbesluiten van 2026-10-19.

Better Auth ruimt verlopen sessies, verificaties en rate-limit-rijen alleen op als het ze tegenkomt; een ongebruikte sessie
blijft staan met `ipAddress` en `userAgent`, en `rateLimit` groeit zonder verkeer. Een mail binnen de request faalt voor de
gebruiker als SMTP even wegvalt, terwijl het account al bestaat. Framework §6 vraagt een aparte rol voor systeemjobs. Vast
staat: alleen `src/core/api/db` en `src/core/api/auth` maken databaseverbindingen, en `auth_service` werkt alleen in schema
`better_auth` (ADR 0010).

## Besluit

1. **Runner in het API-proces, coördinatie in Postgres** (was 0020 punt 1). `startJobs()` in `src/core/api/jobs/` draait elke taak
   op een interval vanuit `src/api/server.ts`. Een taak werkt in batches; elke batch is één transactie met een advisory lock in
   twee-sleutelvorm (`<namespace>, <taak>`): één vaste namespace voor jobs, een vast taaknummer uit het register (een dubbel
   nummer faalt bij opstart). Die lockruimte botst niet met de één-sleutelvorm van `hashtext(…)`-locks. Standaard is de
   try-lock: lukt hij niet, dan slaat deze instantie de batch over. Geen extra proces en geen queue-dienst. Bij stoppen stopt
   eerst de runner (een lopende batch maakt zijn transactie af, binnen `SHUTDOWN_TIMEOUT_MS`), daarna sluiten de pools.
2. **`withJob` in `src/core/api/db`** (was 0020 punt 2, gecorrigeerd door 0036 punt 1–2). `withJob({ name, key }, work, options?)`
   gebruikt een eigen kleine pool als `app_jobs` (`JOBS_DATABASE_URL`), één transactie met de lock van punt 1, en geeft
   `{ ran: false } | { ran: true, value }`: overslaan is zichtbaar zonder exception. `{ wait: true }` neemt de wachtende lock
   (`pg_advisory_xact_lock`) in plaats van de try-lock, voor het markeren van mail; die wacht begrensd door de
   `statement_timeout` van `app_jobs` en faalt daarna met terugdraaien. Binnen `work` alleen functies van klasse `job`.
   `closeDatabase()` sluit ook deze pool. De runner maakt zelf geen verbinding: hij krijgt `withJob` en `purgeExpired` mee.
3. **Opruimen van `better_auth`** (was 0020 punt 2, gecorrigeerd door 0036 punt 3). `purgeExpired()` in `src/core/api/auth` ruimt
   als `auth_service` op de pool van Better Auth op, in batches met dezelfde lockvorm: sessies met `expiresAt` verstreken of
   ouder dan de absolute termijn van 7 dagen op `createdAt`, verificaties met `expiresAt` verstreken, en `rateLimit`-rijen ouder
   dan `AUTH_RATE_LIMIT_KEEP_SECONDS` (60 s, het langste vaste venster van de gepinde Better Auth 1.7.7). Die termijn is een eigen
   constante in `limits.ts`, los van `AUTH_RATE_LIMIT_WINDOW_SECONDS` (10 s, expliciet gezet als `rateLimit.window`). Een
   versietest dwingt bij elke update van Better Auth een nieuwe vaststelling af; verandert die waarde, dan is dat een nieuw ADR.
   Blijkt bij het bouwen een regel langer dan 60 s, dan stopt de developer en vraagt het. De termijnen komen uit `limits.ts` en
   staan ook als rij in de bewaarcatalogus (0051); een integratietest bewijst dat die gelijk zijn.
4. **Mail-outbox `app.mail_outbox`, zonder token** (was 0020 punt 3). RLS aan en geforceerd. Kolommen voor soort, `user_id` met
   foreign key `on delete cascade`, een optionele `recipient` (alleen voor app-mail naar een adres dat geen account is),
   planning, pogingen, lease, uitkomst en een foutcode zonder adressen; geen payload met link of token.
   - **Erin** via `app.enqueue_mail(kind, user_id)` (security definer, klasse `client`): eist een actor, heeft een allowlist van
     soorten; core-soorten eisen `app.is_mfa_admin()`. De route roept hem aan in zijn eigen `withUser()`-transactie, zodat mail
     en auditregel samen committen. Een app-soort krijgt een eigen definer-functie met eigen actor-check.
   - **Verzenden** met een lease, at-least-once: claimen in een `withJob`-transactie (`for update skip locked`) en committen,
     versturen buiten de transactie, markeren in een nieuwe transactie met de wachtende lock (punt 2), met backoff en na N
     pogingen `failed_at`. Valt een worker weg na versturen, dan kan de mail twee keer gaan, nooit nul keer.
   - **Een core-mail maakt de link pas bij verzenden**: de worker verwijdert oude reset-tokens van de gebruiker en roept
     `auth.api.requestPasswordReset` aan. Alleen de nieuwste link werkt, ook na een dubbele verzending.
   - Na verzenden of definitief mislukken wordt `recipient` leeg; de rij blijft tot zijn termijn in de bewaarcatalogus (0051).
   - De admin ziet de status van de laatste uitnodiging in `app.accounts`, via een select-policy `to app_definer`; geen policy
     voor `app_authenticated`.
5. **Eigen rol `app_jobs`** (was 0020 punt 4 en OV-1). Login, `noinherit`, `connect` en `usage` op schema `app`, dezelfde
   timeouts als `api_user`, en alleen `execute` op functies van een nieuwe klasse `job` in de functiecatalogus, die voor geen
   API-rol uitvoerbaar zijn. Geen tabelrechten en geen rechten op `better_auth`. De rol staat lokaal in `db/init/` en per
   omgeving in een runbook; `JOBS_DATABASE_URL` heeft een demo-waarde in `.env.example` (was 0020 OV-2).
6. **Uitnodigen meldt succes zodra de mail in de outbox staat** (was 0020 OV-3); een mislukte verzending toont de accountlijst.
7. **Hosts die naar nul schalen of serverless draaien** (was 0020 punt 7). De adapter in `deploy/<host>/` roept op de cron van
   de host één ronde aan (`runJobsOnce()`). Kan de host alleen een HTTP-pad aanroepen, dan registreert de adapter dat pad zelf,
   alleen met een geheim van de host: een nieuwe uitzondering in framework §3. De template levert geen adapter; de app legt het
   vast in zijn provider-ADR.

## Alternatieven

- **Queue-bibliotheek (pg-boss, graphile-worker)** (was 0020): nieuwe dependency met eigen schema en rechten buiten onze
  RLS-invarianten en functiecatalogus.
- **Cron van de host of een worker-container als standaard** (was 0020): per provider anders; alleen de uitweg van punt 7.
- **Opnieuw proberen in de request** (was 0020): houdt de request vast en laat "account bestaat, mail niet" open.
- **Link in de outbox, enqueue door `auth_service`** (was 0020): een token buiten `better_auth` en `auth_service` in schema `app`.
- **Geen eigen rol: `execute` aan `api_user`** (was 0020 OV-1): wijkt af van framework §6 en maakt een gelekte `DATABASE_URL`
  krachtiger.
- **Markeren onder een eigen taaknummer met try-lock en opnieuw proberen** (was 0036): niet gekozen.
- **`rateLimit` niet opruimen** (was 0036): Better Auth ruimt alleen bij verkeer op.

## Gevolgen

- Nieuwe map `src/core/api/jobs/`, `withJob()` in `src/core/api/db` (ook de wachtende variant), `purgeExpired()` in
  `src/core/api/auth`; de exportlijst van `src/core/api/db` in `AGENTS.md` en framework §1 en §2 groeit, en framework §3 en §6
  wijzigen: beschermd, akkoord van de eigenaar in de PR die het bouwt.
- `inviteUser` maakt alleen nog het account; de route zet de mail in de outbox. SMTP en `sendResetPassword` draaien in de worker.
- Readiness controleert ook de `app_jobs`-verbinding, onder de voorwaarde van 0049 punt 3.
