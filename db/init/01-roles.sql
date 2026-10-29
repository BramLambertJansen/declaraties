-- Alleen lokaal: draait één keer bij de eerste start van een lege container.
-- Alleen clusterbrede rollen en database-instellingen; al het andere staat in db/migrations.
-- Per omgeving maakt het runbook dezelfde rollen met echte geheimen (docs/operations/).

-- Eigenaar van alle schema's en objecten; migraties draaien als deze rol. Geen superuser,
-- zodat FORCE ROW LEVEL SECURITY lokaal net zo werkt als bij een beheerde provider.
create role app_migrator login password 'app_migrator';

-- Groepsrol voor ingelogde gebruikers; policies en grants richten zich hierop.
create role app_authenticated nologin noinherit;

-- De API: geen eigen rechten, mag alleen SET LOCAL ROLE app_authenticated.
create role api_user login noinherit password 'api_user' in role app_authenticated;

-- Better Auth: alleen DML op schema better_auth (grants in de migratie).
create role auth_service login password 'auth_service';

-- Eigenaar van security definer-functies; krijgt alleen de rechten die die functies nodig hebben.
create role app_definer nologin;

alter role api_user set statement_timeout = '5s';
alter role api_user set idle_in_transaction_session_timeout = '10s';
alter role auth_service set statement_timeout = '5s';
alter role auth_service set idle_in_transaction_session_timeout = '10s';
alter role auth_service set search_path = better_auth;
-- Een migratie wacht niet eindeloos op een lock van de draaiende app.
alter role app_migrator set lock_timeout = '5s';

revoke all on database app from public;
grant connect on database app to app_migrator, api_user, auth_service;
-- Eigenaar van de database, dus via pg_database_owner ook van schema public (PG15+: PUBLIC heeft daar geen CREATE;
-- dbmate maakt public.schema_migrations aan en de baseline past de rechten op public aan).
alter database app owner to app_migrator;
grant app_definer to app_migrator;
