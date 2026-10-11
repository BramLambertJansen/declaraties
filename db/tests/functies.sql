-- Functiecatalogus (framework §6, ADR 0011): elke functie in public en app is `client` (uitvoerbaar voor
-- app_authenticated) of `intern` (geen API-rol). Een nieuwe functie zonder klasse faalt hier. Elke client-functie
-- controleert de actor of heeft een vastgelegde reden waarom niet. Alles in één transactie die terugdraait.
begin;
set search_path = tap, public;
select plan(7);

-- Nieuwe functie: voeg hier een regel toe, in dezelfde PR als de migratie.
create temp table catalogus (functie text primary key, klasse text not null check (klasse in ('client', 'intern')), reden text);
insert into catalogus values
  ('app.current_user_id()', 'client', 'is zelf de bron van de actor: geeft alleen app.user_id terug'),
  ('app.session_strength()', 'client', 'geeft alleen de sessiesterkte van de eigen actor terug'),
  ('app.is_mfa_admin()', 'client', null),
  ('app.assign_role(text, text)', 'client', null),
  ('app.consume_rate_limit(text, integer, integer)', 'client', 'actor uit app.current_user_id(); zonder actor 42501 (spec rate-limit)'),
  ('app.user_roles_keep_one_admin()', 'intern', 'triggerfunctie van public.user_roles');

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

-- Client: app_authenticated mag hem uitvoeren. Intern: geen enkele API-rol.
create function pg_temp.verkeerde_grants() returns setof text language sql stable as $$
  select format('%s (%s): %s', f.functie, c.klasse, r.rolname)
  from functies f join catalogus c using (functie)
  cross join (values ('app_authenticated'), ('api_user'), ('auth_service')) r (rolname)
  where (c.klasse = 'client' and r.rolname = 'app_authenticated'
         and not pg_catalog.has_function_privilege(r.rolname, f.oid, 'execute'))
     or (c.klasse = 'intern' and pg_catalog.has_function_privilege(r.rolname, f.oid, 'execute'))
  order by 1
$$;

select is(array(select pg_temp.zonder_klasse()), '{}'::text[], 'elke functie in public en app staat in de catalogus');
select is(
  array(select functie from catalogus except select functie from functies order by 1),
  '{}'::text[],
  'de catalogus noemt geen functies die niet (meer) bestaan'
);
select is(array(select pg_temp.verkeerde_grants()), '{}'::text[], 'grants passen bij de klasse (client of intern)');
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

select * from finish();
rollback;
