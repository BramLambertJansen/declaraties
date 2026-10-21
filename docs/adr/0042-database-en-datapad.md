# 0042 — Database en datapad

Status: geaccepteerd

Vervangt [0004](0004-database-tooling.md) en [0012](0012-datapad.md). Drempel: A4. Consolidatie zonder inhoudelijke wijziging
(eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen). Het bewijs en de meting van het datapad staan in 0012.

## Context

De database is gewone Postgres ([0039](0039-stack-provider-neutraal-en-toolchain.md)). Een fout in de API mag geen data van
een ander lekken: de API verbindt zonder eigen rechten en elke request draait onder de identiteit van de gebruiker, ook achter
een pooler in transaction mode zoals beheerde providers die bieden. FORCE RLS werkt alleen voor niet-superusers.

## Besluit

1. **Postgres 17** (was 0004), patch exact gepind in `db/docker/Dockerfile`; Renovate volgt patches. 18 pas als alle beoogde
   providers het standaard bieden.
2. **Rollen** (was 0004; schema was 0010). Clusterbreed, dus niet in migraties: lokaal in `db/init/01-roles.sql`, per omgeving
   via het runbook.

   | Rol | Doel |
   |---|---|
   | `app_migrator` | Eigenaar van de database, schema's en objecten; draait migraties. Geen superuser, zodat FORCE RLS lokaal net zo werkt als bij een provider |
   | `app_authenticated` | NOLOGIN-groep waarop grants en policies zich richten |
   | `api_user` | Login van de API; NOINHERIT, alleen `SET LOCAL ROLE app_authenticated`; statement- en idle-timeout |
   | `auth_service` | Login van Better Auth; alleen DML op schema `better_auth` |
   | `app_definer` | NOLOGIN-eigenaar van `security definer`-functies, met alleen de rechten die die functies nodig hebben |

3. **Alles per database in migraties** (was 0004): schema's, default privileges (`for role app_migrator`) en grants.
4. **dbmate** (was 0004, 0010). Gewone SQL, tijdstempelversies (geen botsing bij template-merges), draait als `app_migrator`.
   Geen down-migraties; een gecommitte migratie wijzig je nooit.
5. **Snapshot** (was 0004). `db/schema.snapshot.sql`, een dump van alleen het schema zonder `tap`, is het enige schemabestand.
6. **pgTAP** (was 0004) in een eigen image en eigen schema `tap`, alleen lokaal en in CI.
7. **RLS-invariant** (was 0004, 0010) voor alle tabellen in `public` en `app`, behalve `public.schema_migrations`. Schema
   `better_auth` is niet bereikbaar voor `app_authenticated` en valt onder een eigen invariant
   ([0041](0041-auth-in-de-api.md) punt 3).
8. **Driver** (was 0012 punt 1): `pg`, één kleine pool per proces in `src/core/api/db`.
9. **`withUser(actor, tx => …, { readOnly })`** (was 0012 punt 2) is de enige ingang naar data. Per aanroep één transactie
   (read only voor GET): controleer de actor, eis `current_user = session_user` (anders weigeren en de verbinding weggooien),
   `set local role app_authenticated`, `set_config(…, true)` voor `app.user_id` en `app.session_strength`, dan commit of
   rollback (faalt die, dan gaat de verbinding weg). Alles is transactie-lokaal, dus het werkt gelijk direct en via een
   pooler in transaction mode. Andere exports van `src/core/api/db` alleen per ADR; nu zijn dat `pingDatabase()` en
   `closeDatabase()` ([0018](0018-readiness.md), uitgebreid in [0020](0020-achtergrondtaken.md) en
   [0036](0036-achtergrondtaken-correcties.md)), `createAuditFn()` ([0021](0021-audit-log.md)) en `testing.ts` (punt 12).
10. **Contract** (was 0012 punt 3): `Actor = { userId: UserId; sessionStrength: 'password' | 'mfa' }`. `none` bestaat alleen
    in de database, buiten `withUser()`.
11. **`tx` is een Drizzle-transactie** over dezelfde verbinding (was 0012 punt 4).
12. **`testing.ts`** (was 0012 punt 5) alleen uit testbestanden, met een geïnjecteerde transactie per test (savepoint).
13. **Grens afgedwongen** (was 0012 punt 6). Dependency-cruiser: buiten `src/core/api/db` alleen de index; `pg` alleen in
    `src/core/api/{db,auth}`. ESLint blokkeert overal `SET ROLE` en `set_config(…, false)`, en buiten `src/core/api/db` ook
    `set_config` en `current_setting`.
14. **Pooler** (was 0012 punt 7): PgBouncer in transaction mode met `scram-sha-256`, op digest gepind, als compose-profiel
    lokaal en in de runner.
15. **Foutvertaling** (was 0012 punt 8) op één plek in core: 23505 → `ALREADY_EXISTS`, 23503 → `NOT_FOUND`, 42501 → `FORBIDDEN`.

## Alternatieven

- **Supabase CLI of drizzle-kit migrate** (was 0004): providergebonden, of een tweede bron voor het schema.
- **Migraties als superuser** (was 0004): FORCE RLS wordt lokaal genegeerd, dus lokaal is niet gelijk aan productie.
- **Testcontainers met kale Postgres** (was 0004): test een andere database dan we draaien.
- **Sessie-instellingen (`SET ROLE`, `set_config(…, false)`)** (was 0012): lekt op een gedeelde verbinding en werkt niet in
  transaction mode.
- **Rol per gebruiker in de database** (was 0012): geen pool mogelijk, en rollen zijn clusterbreed.
- **`pg`-client als blijvend `tx`-type** (was 0012): ongetypeerde SQL in elke handler; verworpen door de eigenaar.
- **Andere driver (`postgres.js`)** (was 0012): werkt ook, maar Drizzle en Better Auth ondersteunen `pg` het breedst.

## Gevolgen

- Een beheerde provider moet eigen rollen toestaan; dat is een keuzecriterium in de app-ADR (was 0004).
- Een app die een pooler kiest, herhaalt de lektest tegen de pooler van de provider (was 0002, 0012).
- Datamigraties onder FORCE RLS zien als `app_migrator` geen rijen; die lopen via een gereviewde `security definer`-functie of
  een tijdelijke policy in dezelfde migratie (was 0004).
