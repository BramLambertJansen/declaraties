-- Alleen lokaal en in CI: pgTAP in een eigen schema, buiten het schema-snapshot (pg_dump -N tap).
create schema tap;
create extension pgtap schema tap;
grant usage on schema tap to app_authenticated, app_migrator;
grant execute on all functions in schema tap to app_authenticated, app_migrator;
-- pgTAP-tests wisselen als app_migrator naar app_authenticated om policies te testen (alleen lokaal en in CI;
-- inherit false: app_migrator krijgt geen rechten van die rol, alleen SET ROLE).
grant app_authenticated to app_migrator with inherit false, set true;
