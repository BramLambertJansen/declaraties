-- Functiecatalogus (framework §6, ADR 0045, ADR 0075): elke functie in public en app is `client` (uitvoerbaar voor
-- app_authenticated), `intern` (geen API-rol) of `auth` (alleen auth_service, geen andere API-rol). Een nieuwe functie zonder klasse faalt hier. Elke client-functie
-- controleert de actor of heeft een vastgelegde reden waarom niet. Alles in één transactie die terugdraait.
begin;
set search_path = tap, public;
select plan(9);

-- Nieuwe functie: voeg hier een regel toe, in dezelfde PR als de migratie.
create temp table catalogus (functie text primary key, klasse text not null check (klasse in ('client', 'intern', 'auth')), reden text);
insert into catalogus values
  ('app.current_user_id()', 'client', 'is zelf de bron van de actor: geeft alleen app.user_id terug'),
  ('app.session_strength()', 'client', 'geeft alleen de sessiesterkte van de eigen actor terug'),
  ('app.is_mfa_admin()', 'client', null),
  ('app.assign_role(text, text)', 'client', null),
  ('app.set_account_blocked(text, boolean)', 'client', null),
  ('app.set_account_deactivated(text, boolean)', 'client', null),
  ('app.consume_rate_limit(text, integer, integer)', 'client', 'actor uit app.current_user_id(); zonder actor 42501 (spec rate-limit)'),
  ('app.user_roles_keep_one_admin()', 'intern', 'triggerfunctie van public.user_roles'),
  -- Audit log (spec audit-log, AC-19).
  ('app.request_id()', 'intern', 'alleen gelezen door security definer-functies van de audit log'),
  ('app.audit_log_guard()', 'intern', 'triggerfunctie van app.audit_log'),
  ('app.audit(text, text, text, jsonb)', 'client', null),
  ('app.audit_account_action(text, text)', 'client', null),
  -- Bewaarcatalogus (spec achtergrondtaken, deel A, AC-5 en AC-7).
  ('app.retention_cutoff(regclass)', 'intern', 'gelezen door policies en triggers met een termijn'),
  ('app.audit_log_guard_delete()', 'intern', 'triggerfunctie van app.audit_log'),
  -- Eenmalig gebruik (ADR 0075, spec inloggat-dichten).
  ('app.claim_one_time_use(text, integer)', 'auth', 'claim van een TOTP-code of e-maillink door Better Auth'),
  -- Register en schakelaar per koppeling (spec koppelingsregister, AC-8).
  ('app.integration_enabled(text)', 'client', null),
  ('app.set_integration_enabled(text, boolean)', 'client', null);

-- Functies van extensies tellen niet mee (pgTAP staat in schema tap).
create temp view functies as
  select n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as functie,
         p.oid, p.prosrc, p.prosecdef, p.proconfig, p.proowner
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app')
    and not exists (
      select 1 from pg_catalog.pg_depend d
      where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    );

create function pg_temp.zonder_klasse() returns setof text language sql stable as $$
  select functie from functies except select functie from catalogus order by 1
$$;

-- Client: app_authenticated mag hem uitvoeren. Intern: geen enkele API-rol. Auth: auth_service wel, de andere API-rollen niet.
create function pg_temp.verkeerde_grants() returns setof text language sql stable as $$
  select format('%s (%s): %s', f.functie, c.klasse, r.rolname)
  from functies f join catalogus c using (functie)
  cross join (values ('app_authenticated'), ('api_user'), ('auth_service')) r (rolname)
  where (c.klasse = 'client' and r.rolname = 'app_authenticated'
         and not pg_catalog.has_function_privilege(r.rolname, f.oid, 'execute'))
     or (c.klasse = 'intern' and pg_catalog.has_function_privilege(r.rolname, f.oid, 'execute'))
     or (c.klasse = 'auth' and r.rolname = 'auth_service'
         and not pg_catalog.has_function_privilege(r.rolname, f.oid, 'execute'))
     or (c.klasse = 'auth' and r.rolname <> 'auth_service'
         and pg_catalog.has_function_privilege(r.rolname, f.oid, 'execute'))
  order by 1
$$;

-- auth_service buiten better_auth (ADR 0075, R-LAAG-05): alleen usage op schema app en execute op de functies van klasse auth.
-- Geen recht op een tabel, view of reeks in public of app, geen ander schemarecht, geen andere functie.
create function pg_temp.auth_service_buiten_better_auth() returns setof text language sql stable as $$
  select v.regel from (
    select format('%s op %I.%I', p.recht, n.nspname, c.relname) as regel
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p (recht)
    where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname in ('public', 'app')
      and case when c.relkind in ('r', 'p', 'v', 'm', 'f') then pg_catalog.has_table_privilege('auth_service', c.oid, p.recht) else false end
    union all
    select format('kolomrecht %s op %I.%I', p.recht, n.nspname, c.relname)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p (recht)
    where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname in ('public', 'app')
      and case when c.relkind in ('r', 'p', 'v', 'm', 'f')
        then not pg_catalog.has_table_privilege('auth_service', c.oid, p.recht)
          and pg_catalog.has_any_column_privilege('auth_service', c.oid, p.recht)
        else false end
    union all
    select format('usage op reeks %I.%I', n.nspname, c.relname)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and n.nspname in ('public', 'app')
      -- CASE: anders kan de planner de functie op een niet-reeks aanroepen vóór het filter op relkind.
      and case when c.relkind = 'S' then pg_catalog.has_sequence_privilege('auth_service', c.oid, 'USAGE') else false end
    union all
    select format('%s op schema %s', s.recht, s.schema)
    from (values ('public', 'USAGE'), ('public', 'CREATE'), ('app', 'CREATE')) s (schema, recht)
    where pg_catalog.has_schema_privilege('auth_service', s.schema, s.recht)
    union all
    select 'execute op ' || f.functie
    from functies f left join catalogus c using (functie)
    where coalesce(c.klasse, '') <> 'auth' and pg_catalog.has_function_privilege('auth_service', f.oid, 'execute')
  ) v order by 1
$$;

select is(array(select pg_temp.zonder_klasse()), '{}'::text[], 'elke functie in public en app staat in de catalogus');
select is(
  array(select functie from catalogus except select functie from functies order by 1),
  '{}'::text[],
  'de catalogus noemt geen functies die niet (meer) bestaan'
);
select is(array(select pg_temp.verkeerde_grants()), '{}'::text[], 'grants passen bij de klasse (client, intern of auth)');
select is(
  array(select pg_temp.auth_service_buiten_better_auth()),
  '{}'::text[],
  'auth_service: buiten better_auth alleen usage op app en execute op de functies van klasse auth'
);
select is(
  array(
    select f.functie from functies f join catalogus c using (functie)
    where c.klasse = 'client' and c.reden is null
      and f.prosrc !~ 'app\.(current_user_id|is_mfa_admin)\(' order by 1
  ),
  '{}'::text[],
  'elke client-functie controleert de actor (app.current_user_id of app.is_mfa_admin) of heeft een reden'
);
select is(
  array(
    select functie from functies
    where prosecdef
      and (proowner <> 'app_definer'::regrole or not coalesce(proconfig @> array['search_path=""'], false))
    order by 1
  ),
  '{}'::text[],
  'elke security definer-functie in public en app: eigenaar app_definer en search_path leeg'
);

-- Controle: een nieuwe functie zonder klasse, en een interne functie met een grant aan app_authenticated, worden gevangen.
create function app.catalogus_probe() returns integer language sql return 1;
select is(array(select pg_temp.zonder_klasse()), array['app.catalogus_probe()'], 'controle: een functie zonder klasse wordt gevangen');

insert into catalogus values ('app.catalogus_probe()', 'intern', null);
grant execute on function app.catalogus_probe() to app_authenticated;
select is(
  array(select pg_temp.verkeerde_grants()),
  array['app.catalogus_probe() (intern): app_authenticated'],
  'controle: een interne functie die app_authenticated mag uitvoeren wordt gevangen'
);

-- Controle: een grant aan auth_service op een functie die niet in klasse auth staat, wordt gevangen.
revoke execute on function app.catalogus_probe() from app_authenticated;
grant execute on function app.catalogus_probe() to auth_service;
select is(
  array(select pg_temp.auth_service_buiten_better_auth()),
  array['execute op app.catalogus_probe()'],
  'controle: auth_service met execute op een functie buiten klasse auth wordt gevangen'
);

select * from finish();
rollback;
