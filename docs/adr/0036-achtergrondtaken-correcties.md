# 0036 — Achtergrondtaken: correcties op 0018, 0020, 0021 en 0022

Status: voorgesteld

Wijzigt [0020](0020-achtergrondtaken.md) punt 1, punt 2 en de context, [0021](0021-audit-log.md) punt 6 en de sectie Tests,
[0022](0022-avg.md) punt 5 en [0018](0018-readiness.md) punt 2, punt 4 en Gevolgen. De tekst van die vier ADR's blijft
ongewijzigd; hun statusregel ook. Normatieve wijziging, dus een nieuw ADR ([0031](0031-guard-en-pr-verify-bruikbaarder.md)
besluit 3 spoor 1; `docs/operations/agent-doorloop.md:141`, "Correctie aan een geaccepteerd ADR"). ADR-drempel
([0029](0029-snellere-beslisroute.md) punt 4): A4.

**Herkomst.** Elke afwijking hieronder staat in de spec [achtergrondtaken](../specs/achtergrondtaken.md), kop "Afwijkingen van
de ADR's" (r. 17–34) en "Raakt ook", bullet "Wijzigings-ADR (vóór deel C)" (r. 378–381). Die spec eist dit ADR als eigen PR
direct vóór deel C (kop "Deel-PR's", r. 43–44). Per afwijking staat erbij wie besliste:

- **Eigenaarbesluit 2026-10-19** (in de sessie, opdracht "neem aanbevelingen over"; vastgelegd in de spec onder "Open vragen voor
  de eigenaar", r. 423–425, en in de spec [mail-outbox](../specs/mail-outbox.md), r. 332–335): OV-A4, OV-A6 en OV-C3 van
  achtergrondtaken, en OV-2 van mail-outbox. Besluiten 1, 2, 3 en 4 hieronder volgen daaruit.
- **Vaststelling uit de bouw van deel A** (#212): besluit 5. Geen keuze, maar wat PostgreSQL doet; de spec legt het vast in
  jobs/AC-6 en AC-7.
- **Geen eigenaarbesluit**: besluit 6 (readiness, OV-C4). Volgens de spec (r. 409–412) is dat een aanpassing van de
  architect/hoofdsessie na de Codex-review op #209, ter beoordeling door de eigenaar. Bij de merge van de spec geldt optie (a);
  kiest de eigenaar (b) of (c), dan vervalt besluit 6.

Dit ADR voegt geen besluit toe dat niet in die specs staat.

## Context

ADR 0020 (stap 5 t/m 8 van de Bouwvolgorde) en ADR 0022 punt 5 zijn uitgewerkt in de spec achtergrondtaken, in vier deel-PR's
(A bewaarcatalogus, B rol `app_jobs`, C runner, D opruimen). Deel A is gebouwd in #212: `app.retention`, `app.retention_cutoff`,
de delete-policy `audit_log_definer_delete` en de rij-trigger `audit_log_delete_expired_only` op `app.audit_log`
(`db/schema.snapshot.sql:765`, `:828`).

Bij het uitwerken bleken vier ADR's op punten anders dan wat gebouwd wordt of is:

- **Vorm van `withJob`.** ADR 0020 punt 2 noemt `withJob(name, work)`; punt 1 kent alleen de try-lock ("Lukt de lock niet, dan
  slaat deze instantie de batch over"). De mail-outbox moet een geclaimde rij altijd markeren; achter een try-lock kan dat
  markeren worden overgeslagen terwijl een andere instantie claimt, en wordt de mail na de lease opnieuw verstuurd (mail-outbox
  OV-2).
- **Rate-limit-venster van Better Auth.** ADR 0020 punt 2 zegt dat `purgeExpired()` `rateLimit`-rijen opruimt "ouder dan het
  langste rate-limit-venster", met termijnen uit `limits.ts`. Dat venster staat niet in `limits.ts`. Better Auth 1.7.7 gebruikt
  een standaardvenster van 10 s (`better-auth/dist/context/create-context.mjs:173`) en vaste regels per pad, waarvan de langste
  60 s is (`better-auth/dist/api/rate-limiter/index.mjs:305`–`:318`). De context van ADR 0020 zegt dat `rateLimit` "nooit
  kleiner" wordt; Better Auth 1.7.7 ruimt zelf rijen op die ouder zijn dan het langste geziene venster, maar alleen als er
  verkeer is (`rate-limiter/index.mjs:82`, `:174`–`:184`).
- **Hoe `app_jobs` de catalogus leest.** ADR 0022 punt 5 zegt dat "alleen `app_definer` en `app_jobs`" `app.retention` lezen.
  ADR 0020 punt 4 geeft `app_jobs` alleen `execute` op functies van klasse `job`, geen tabelrecht.
- **Delete binnen de termijn op de audit log.** ADR 0021 punt 6 zegt dat `before delete` faalt tenzij de rij verlopen is, "ook
  voor de eigenaar `app_migrator` bij gewone DML", en Tests eist "`delete` van een rij binnen de termijn faalt voor iedereen".
  `app_migrator` is lid van `app_definer` (`db/init/01-roles.sql:34`), en de tabel heeft FORCE RLS
  (`db/schema.snapshot.sql:466`). De policy `audit_log_definer_delete` filtert een rij binnen de termijn dus weg vóórdat de
  trigger hem ziet.
- **Readiness en de jobs-verbinding.** `pingDatabase()` controleert alleen de verbinding als `api_user`
  (`src/core/api/db/index.ts:10`, `:14`; `createPing` in `src/core/api/db/pool.ts:46`); `src/api/server.ts:41` geeft alleen
  die aan readiness. De pool van `withJob` verbindt pas bij de eerste taak. Bij een fout die alleen `app_jobs` raakt (verkeerde
  `JOBS_DATABASE_URL`, wachtwoord niet geroteerd, verbindingslimiet van de rol) blijft `GET /api/ready` 200, terwijl elke taak
  en later elke mail faalt (Codex-review op #209, spec OV-C4).

## Besluit

1. **`withJob`: vorm en resultaat** (wijzigt 0020 punt 2; eigenaarbesluit OV-C3).
   - Was: `withJob(name, work)`; "zonder lock komt `work` niet aan de beurt".
   - Wordt: `withJob({ name, key }, work, options?)` met resultaat `{ ran: false } | { ran: true, value }`. Overslaan is zo
     zichtbaar zonder exception.
   - Ongewijzigd: eigen kleine pool als `app_jobs` (`JOBS_DATABASE_URL`), één transactie, de lock in twee-sleutelvorm uit punt 1,
     binnen `work` alleen functies van klasse `job`, en `closeDatabase()` sluit ook deze pool.
2. **`withJob`: wachtende variant naast de try-lock** (wijzigt 0020 punt 1 en 2; eigenaarbesluit OV-2 van mail-outbox, optie (a)).
   - Was (punt 1): elke batch neemt `pg_try_advisory_xact_lock(<namespace>, <taak>)`; "Lukt de lock niet, dan slaat deze
     instantie de batch over."
   - Wordt: dat blijft de standaard. Daarnaast geeft `{ wait: true }` een wachtende variant met `pg_advisory_xact_lock(…)`, voor
     het markeren van mail (spec mail-outbox). Die slaat de transactie niet over als de lock bezet is, maar wacht, begrensd door
     de `statement_timeout` van `app_jobs` (5 s). Verloopt die, dan faalt de aanroep (57014) en draait de transactie terug.
   - Ongewijzigd: dezelfde twee-sleutelvorm en lockruimte, dus geen botsing met `hashtext`-locks; opruimen gebruikt de try-lock.
3. **Termijn van `better_auth."rateLimit"`: 60 s, eigen constante** (wijzigt 0020 punt 2 en de context; eigenaarbesluit OV-A4,
   optie (a); de waarde 60 s volgt uit de regels van Better Auth 1.7.7).
   - Was (punt 2): opruimen "ouder dan het langste rate-limit-venster", uit `limits.ts`. Was (context): "`rateLimit` … wordt
     nooit kleiner".
   - Wordt: het langste venster van Better Auth 1.7.7 is 60 s (vaste regel, `better-auth/dist/api/rate-limiter/index.mjs:305`–
     `:318`), niet het standaardvenster van 10 s. De opruimtermijn is een eigen constante `AUTH_RATE_LIMIT_KEEP_SECONDS = 60` in
     `src/core/shared/limits.ts`, los van `rateLimit.window`. Daarnaast komt `AUTH_RATE_LIMIT_WINDOW_SECONDS = 10`, expliciet
     gezet als `rateLimit.window` (gelijk aan de huidige standaard, dus geen gedragswijziging).
   - De contextzin "wordt nooit kleiner" geldt niet voor Better Auth 1.7.7: die ruimt zelf op na het langste geziene venster,
     alleen bij verkeer. De groei zonder verkeer blijft de reden voor `purgeExpired()`.
   - Een unit-test eist dat de geïnstalleerde `better-auth` exact 1.7.7 is; bij een update moet de termijn opnieuw worden
     vastgesteld (spec, "Toetsbaarheid van de 60 s"). Blijkt bij het bouwen een regel langer dan 60 s, dan stopt de developer en
     vraagt het.
4. **`app_jobs` leest de catalogus via een functie** (wijzigt 0022 punt 5; eigenaarbesluit OV-A6, optie (a)).
   - Was: `app.retention` "RLS geforceerd, alleen `app_definer` en `app_jobs` lezen".
   - Wordt: alleen `app_definer` leest `app.retention` (grant `select`, policy `retention_definer_select`). `app_jobs` heeft geen
     tabelrecht en leest via `app.retention_targets() returns setof regclass`: security definer van `app_definer`,
     `set search_path = ''`, `stable`, klasse `job`, `execute` alleen aan `app_jobs`. Die geeft de tabellen met `purger = 'app'`
     en `keep` niet null, gesorteerd op naam.
   - Ongewijzigd: de rest van punt 5 (kolommen, invariant, `app.retention_cutoff`, `app.purge_expired`, `purger = 'auth'` voor
     `better_auth`). `app_jobs` houdt zo, zoals 0020 punt 4 zegt, alleen `execute` op functies van klasse `job`.
5. **Delete binnen de termijn op `app.audit_log`: 0 rijen onder FORCE RLS** (wijzigt 0021 punt 6 en Tests; vaststelling,
   jobs/AC-6 en AC-7, gebouwd in #212).
   - Was (punt 6): `before delete` faalt tenzij de rij verlopen is; "Dat geldt ook voor de eigenaar `app_migrator` bij gewone
     DML". Was (Tests): "`delete` van een rij binnen de termijn faalt voor iedereen".
   - Wordt: voor `app_definer` en `app_migrator` (lid van `app_definer`, onder FORCE RLS) filtert `audit_log_definer_delete`
     een rij binnen de termijn weg vóór de trigger. De `delete` slaagt dan met 0 rijen in plaats van te falen. De trigger
     `audit_log_delete_expired_only` weigert met 42501 alleen wie RLS omzeilt (de eigenaar na
     `alter table app.audit_log no force row level security`).
   - Ongewijzigd: een rij binnen de termijn verdwijnt niet; `update` en `truncate` falen altijd; de policy- en grant-allowlist
     en de invariant uit punt 6; en de rest van Tests, ook dat `delete` faalt voor `app_authenticated`, `api_user`,
     `auth_service` en `app_jobs`.
6. **Readiness controleert ook de jobs-verbinding** (wijzigt 0018 punt 2, punt 4 en Gevolgen; geen eigenaarbesluit: spec OV-C4,
   optie (a), geldt bij de merge van de spec, zie Herkomst).
   - Was (punt 2): de controle is `select 1` als `api_user` over één eigen verbinding. Was (punt 4): "ready raakt de database
     hooguit één keer per seconde". Was (Gevolgen): "Elke API-instantie heeft één extra databaseverbinding".
   - Wordt: `pingDatabase()` controleert naast `select 1` als `api_user` ook een tweede eigen verbinding als `app_jobs`
     (`JOBS_DATABASE_URL`, `application_name` `readiness-jobs`). Die ping vraagt `select session_user` en faalt als dat niet
     `app_jobs` is. Beide pings lopen tegelijk en `pingDatabase()` wacht op beide uitkomsten (`Promise.allSettled`) voordat hij
     faalt of slaagt. Readiness is pas 200 als beide slagen.
   - Punt 4 wordt: hooguit één controle per seconde, met twee verbindingen (één als `api_user`, één als `app_jobs`).
   - Gevolgen wordt: elke instantie heeft twee extra verbindingen in plaats van één. `closeDatabase()` sluit ook de jobs-ping.
   - Ongewijzigd: de rest van 0018 (200/503 zonder data, 900 ms per stap, 2 s, cache 1 s, single-flight). Beide pings zijn elk
     begrensd op 900 ms en lopen parallel, dus samen blijven ze binnen de 2 s van punt 3.
   - Gevolg van de keuze (spec OV-C4): een storing die alleen `app_jobs` raakt, haalt **alle** instanties uit de rotatie, ook
     voor routes die geen taak nodig hebben.

## Alternatieven

Uit de specs, per besluit; de eigenaar koos zoals in Herkomst.

- **Besluit 2 — markeren onder een eigen taaknummer met try-lock en opnieuw proberen** (mail-outbox OV-2 (b)): niet gekozen.
- **Besluit 3 — `"rateLimit"` niet opruimen** (OV-A4 (b)): Better Auth ruimt zelf op, alleen een rij met reden in
  `app.retention`. Niet gekozen; dat opruimen gebeurt alleen bij verkeer.
- **Besluit 4 — `select` op `app.retention` aan `app_jobs` met een policy** (OV-A6 (b)): niet gekozen; `app_jobs` houdt dan een
  tabelrecht.
- **Besluit 5:** geen alternatief in de spec. De tekst van 0021 laten staan zou een besluit vastleggen dat de gebouwde database
  niet doet.
- **Besluit 6 — (b) controle bij opstart** (één verbinding als `app_jobs` vóór `startServer`; faalt → proces stopt): vangt
  verkeerde gegevens bij de uitrol, niet een latere storing. **(c) alleen een logregel per mislukte ronde** (AC-26) en alarmering
  (ST-10). Kiest de eigenaar (b) of (c), dan vervalt besluit 6 (en jobs/AC-45); bij (b) blijft jobs/AC-44 alleen voor de
  opstartcontrole.

## Gevolgen

- **Volgorde.** Dit ADR is een eigen PR direct vóór deel C van de spec achtergrondtaken (ADR 0029: één PR per besluit); deel C
  en D verwijzen ernaar. Deel C bouwt besluit 1, 2 en 6, deel D besluit 3 en 4. Besluit 5 is gebouwd in #212.
- **Oude ADR's.** De tekst en statusregel van 0018, 0020, 0021 en 0022 blijven. Een verwijslink naar 0036 achter hun
  statuswaarde (spoor 2 van `docs/operations/agent-doorloop.md`) valt buiten dit ADR.
- **Bewijs** (uit de spec, kop "Testplan"): besluit 1 en 2 jobs/AC-19 t/m AC-23 (`test/jobs/with-job.int.test.ts`); besluit 3
  jobs/AC-35, AC-36 en AC-41; besluit 4 jobs/AC-30; besluit 5 jobs/AC-6 en AC-7 (`db/tests/audit_log.sql`); besluit 6 jobs/AC-44
  en AC-45 (`test/datapad/ping.int.test.ts`, `src/core/api/db/ping-all.test.ts`).
- **Paden** (spec, "Raakt ook"): deel C `src/core/api/db/{index,pool}.ts`, nieuw `with-job.ts` en `src/core/api/jobs/`; deel D
  `src/core/api/auth/` (`purge.ts`, `options.ts`) en `src/core/shared/limits.ts`; de exportlijst van `src/core/api/db` in
  `AGENTS.md`, `docs/framework.md` §1 en §2 en `.claude/rules/database.md` (nu met `withJob()`, ook de wachtende variant).
  Beschermde paden vragen eigenaarakkoord in hun eigen PR; dit ADR geeft dat akkoord niet.
- **Operationeel** (besluit 6): readiness wordt 503 zonder werkende `app_jobs`-verbinding; de spec zet daarvoor een notitie in
  `CHANGELOG.md`.
- **Herziening** (besluit 3): bij elke update van `better-auth` faalt de versietest; de termijn van 60 s wordt dan opnieuw
  vastgesteld, met een nieuw besluit als die verandert.
