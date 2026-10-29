# 0004 — Database: Postgres 17, rollen, dbmate, pgTAP

Status: vervangen door 0042
[ADR 0010](0010-schema-better-auth.md) (`better_auth`).

## Besluit

- **Postgres 17**, patch exact gepind in `db/docker/Dockerfile` (nu 17.11); Renovate volgt patches. 18 pas als
  alle beoogde providers het standaard bieden (Supabase nog niet, oktober 2026).
- **Rollen** (clusterbreed, dus niet in migraties): lokaal in `db/init/01-roles.sql`, per omgeving via het runbook.
  | Rol | Doel |
  |---|---|
  | `app_migrator` | Eigenaar van de database (en dus van schema `public`), schema's en objecten; draait migraties. Geen superuser, zodat FORCE RLS lokaal net zo werkt als bij een provider |
  | `app_authenticated` | NOLOGIN-groep waarop grants en policies zich richten |
  | `api_user` | Login van de API; NOINHERIT, alleen `SET LOCAL ROLE app_authenticated`; statement- en idle-timeout |
  | `auth_service` | Login van Better Auth; alleen DML op schema `auth` |
  | `app_definer` | NOLOGIN-eigenaar van `security definer`-functies, met alleen de rechten die die functies nodig hebben |
- **Alles per database staat in migraties**: schema's, default privileges (`for role app_migrator`), grants.
  De baseline-migratie zet dit neer.
- **dbmate** (gepind, nu 2.36.0) voor migraties: gewone SQL, tijdstempelversies (geen botsing bij template-merges),
  draait als `app_migrator` via `--env MIGRATOR_DATABASE_URL --no-dump-schema`. Geen down-migraties.
- **Snapshot**: `pg_dump --schema-only -N tap` in de container → `db/schema.snapshot.sql`; het enige schemabestand.
- **pgTAP** in een eigen image en eigen schema `tap`, alleen lokaal en in CI (`db/init/02-test-tools.sql`).
- **RLS-invariant** geldt voor alle tabellen in `public` en `app`, behalve `public.schema_migrations`; schema `auth`
  is niet bereikbaar voor `app_authenticated` en valt onder een aparte invariant (geen grants aan anderen dan `auth_service`).

## Alternatieven

- Supabase CLI / drizzle-kit migrate: providergebonden resp. tweede bron voor het schema.
- Migraties als superuser: FORCE RLS wordt lokaal genegeerd, dus lokaal ≠ productie.
- Testcontainers met kale Postgres: test een andere database dan we draaien.

## Gevolgen

- Een beheerde provider moet eigen rollen toestaan; dat is een keuzecriterium in de app-ADR.
- Datamigraties onder FORCE RLS zien als `app_migrator` geen rijen: die lopen via een expliciete,
  gereviewde `security definer`-functie of een tijdelijke policy in dezelfde migratie.
