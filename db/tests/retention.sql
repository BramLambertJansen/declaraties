-- app.retention en app.retention_cutoff (spec achtergrondtaken, deel A: AC-1, AC-2, AC-3, AC-5; ADR 0022 punt 5): tabel,
-- CHECKs, grants, policy op naam, de rijen van de bewaarcatalogus en de cutoff-functie. Alles in één transactie die
-- terugdraait. Alles wat de nieuwe objecten raakt staat als tekst in een assert, zodat een ontbrekende migratie als
-- falende assert verschijnt en niet als afgebroken script. De hulpfuncties wisselen per aanroep van rol (zoals de testkit);
-- pgTAP zelf wordt nooit als app_definer of app_authenticated aangeroepen.
begin;
set search_path = tap, public;
select plan(18);

-- Voert SQL uit als een rol en geeft '00000' (gelukt) of 'sqlstate|melding' terug; de fout draait alleen dit statement terug.
create function pg_temp.try_as(p_role text, p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v_result := '00000';
  exception when others then
    v_result := sqlstate || '|' || sqlerrm;
  end;
  reset role;
  return v_result;
end $$;

-- Idem voor een query met één waarde; een fout geeft 'ERROR sqlstate'.
create function pg_temp.query_as(p_role text, p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_result := 'ERROR ' || sqlstate;
  end;
  reset role;
  return v_result;
end $$;

-- Een tabel zonder rij in app.retention, voor de cutoff-weigering en de CHECK-tests.
create table app.retention_probe (id integer, t timestamptz);

-- AC-1: de tabel, RLS aan en geforceerd, de kolommen, de primaire sleutel.
select is(to_regclass('app.retention')::text, 'app.retention', 'app.retention: de tabel bestaat in schema app');
select results_eq(
  $$select c.relrowsecurity, c.relforcerowsecurity, c.relowner::regrole::text
    from pg_catalog.pg_class c where c.oid = to_regclass('app.retention')$$,
  $$values (true, true, 'app_migrator')$$,
  'app.retention: RLS aan en geforceerd, eigenaar app_migrator (AC-1)'
);
select results_eq(
  $$select a.attname::text collate "default", pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull
    from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('app.retention') and a.attnum > 0 and not a.attisdropped order by a.attnum$$,
  $$values ('table_name', 'regclass', true), ('time_column', 'text', false), ('keep', 'interval', false),
           ('purger', 'text', true), ('reason', 'text', true)$$,
  'app.retention: kolommen table_name regclass, time_column text, keep interval, purger text en reason text (AC-1)'
);
select results_eq(
  $$select a.attname::text collate "default"
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
    where k.conrelid = to_regclass('app.retention') and k.contype = 'p'$$,
  $$values ('table_name')$$,
  'app.retention: table_name is de primaire sleutel (AC-1)'
);

-- AC-1: alleen select voor app_definer; niets voor de API-rollen en PUBLIC.
select results_eq(
  $$select coalesce(g.rolname, 'PUBLIC')::text collate "default", a.privilege_type::text
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where c.oid = to_regclass('app.retention') and a.grantee <> c.relowner order by 1, 2$$,
  $$values ('app_definer', 'SELECT')$$,
  'app.retention: tabelgrants zijn alleen select voor app_definer (AC-1)'
);
select is(
  (select count(*)::integer
   from (values ('app_authenticated'), ('api_user'), ('auth_service')) r (rolname)
   cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (recht)
   where coalesce(pg_catalog.has_table_privilege(r.rolname, to_regclass('app.retention'), p.recht), true)
      or case when p.recht in ('select', 'insert', 'update', 'references')
              then coalesce(pg_catalog.has_any_column_privilege(r.rolname, to_regclass('app.retention'), p.recht), true)
              else false end),
  0,
  'app.retention: app_authenticated, api_user en auth_service hebben geen enkel recht (AC-1)'
);
select results_eq(
  $$select p.policyname::text collate "default", p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default", p.qual::text collate "default"
    from pg_catalog.pg_policies p where p.schemaname = 'app' and p.tablename = 'retention'$$,
  $$values ('retention_definer_select', 'SELECT', '{app_definer}', 'PERMISSIVE', 'true')$$,
  'retention_definer_select: exact één policy, for select to app_definer using (true) (AC-1)'
);

-- AC-2: wie ziet wat.
select is(
  pg_temp.query_as('app_definer', $q$select count(*)::text from app.retention
    where table_name = any (array['app.retention', 'public.user_roles', 'app.audit_log', 'app.rate_limits', 'better_auth.session', 'better_auth.verification', 'better_auth."rateLimit"', 'better_auth."user"', 'better_auth.account', 'better_auth."twoFactor"']::regclass[])$q$),
  '10',
  'retention_definer_select: als app_definer zijn de tien core-rijen zichtbaar (AC-2; een app voegt eigen rijen toe)'
);
select is(
  left(pg_temp.try_as('app_authenticated', 'select * from app.retention'), 5),
  '42501',
  'retention_definer_select: als app_authenticated faalt select met 42501 (AC-2)'
);

-- AC-3: precies de rijen uit de spec. keep wordt als leesbare tekst vergeleken (60 seconds is anders 00:01:00).
select is(
  pg_temp.query_as(
    'app_definer',
    $q$select string_agg(l, E'\n' order by l collate "C")
       from (select format('%I.%I|%s|%s|%s', n.nspname, c.relname, coalesce(r.time_column, '-'),
                    case when r.keep is null then 'null' when r.keep = interval '1 year' then '1 year'
                         when r.keep = interval '7 days' then '7 days' when r.keep = interval '60 seconds' then '60 seconds'
                         when r.keep = interval '0' then '0' else r.keep::text end, r.purger) as l
             from app.retention r
             join pg_catalog.pg_class c on c.oid = r.table_name
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             where r.table_name = any (array['app.retention', 'public.user_roles', 'app.audit_log', 'app.rate_limits', 'better_auth.session', 'better_auth.verification', 'better_auth."rateLimit"', 'better_auth."user"', 'better_auth.account', 'better_auth."twoFactor"']::regclass[])) s$q$
  ),
  (select string_agg(l, E'\n' order by l collate "C") from unnest(array[
    'app.retention|-|null|app',
    'public.user_roles|-|null|app',
    'app.audit_log|at|1 year|app',
    'app.rate_limits|window_start|60 seconds|app',
    'better_auth.session|createdAt|7 days|auth',
    'better_auth.verification|expiresAt|0|auth',
    'better_auth."rateLimit"|lastRequest|60 seconds|auth',
    'better_auth."user"|-|null|auth',
    'better_auth.account|-|null|auth',
    'better_auth."twoFactor"|-|null|auth'
  ]) l),
  'app.retention: de tien core-rijen uit de spec bestaan met die time_column, keep en purger (AC-3; rijen van een app tellen niet mee)'
);

-- AC-5: app.retention_cutoff.
select is(
  pg_temp.query_as('app_definer', $q$select (app.retention_cutoff('app.audit_log') = pg_catalog.now() - interval '1 year')::text$q$),
  'true',
  'app.retention_cutoff: voor app.audit_log is het now() - 1 year (AC-5)'
);
select is(
  pg_temp.query_as('app_definer', $q$select app.retention_cutoff('public.user_roles')::text$q$),
  '-infinity',
  'app.retention_cutoff: voor public.user_roles (keep null) is het -infinity (AC-5)'
);
select is(
  left(pg_temp.try_as('app_definer', $q$select app.retention_cutoff('app.retention_probe')$q$), 5),
  '22023',
  'app.retention_cutoff: een tabel zonder rij geeft 22023 (AC-5)'
);
select results_eq(
  $$select p.proowner::regrole::text collate "default", p.prosecdef, p.proconfig @> array['search_path=""'], p.provolatile::text collate "default",
           p.prorettype::regtype::text collate "default", l.lanname::text collate "default",
           (select count(*)::integer from pg_catalog.pg_proc o join pg_catalog.pg_namespace n on n.oid = o.pronamespace
            where n.nspname = 'app' and o.proname = 'retention_cutoff')
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure('app.retention_cutoff(regclass)')$$,
  $$values ('app_definer', true, true, 's', 'timestamp with time zone', 'plpgsql', 1)$$,
  'app.retention_cutoff: security definer van app_definer, search_path leeg, stable, plpgsql, geen overload'
);
select results_eq(
  $$select r.rolname, pg_catalog.has_function_privilege(r.rolname, to_regprocedure('app.retention_cutoff(regclass)'), 'execute')
    from (values ('app_authenticated'), ('api_user'), ('auth_service'), ('public'), ('app_definer')) r (rolname)
    order by r.rolname collate "C"$$,
  $$values ('api_user', false), ('app_authenticated', false), ('app_definer', true), ('auth_service', false), ('public', false)$$,
  'app.retention_cutoff: execute alleen voor app_definer, nooit PUBLIC (AC-5)'
);

-- AC-1: de CHECKs. Onder FORCE RLS kan zelfs de eigenaar niet schrijven (alleen een select-policy); in deze teruggedraaide
-- transactie zetten we FORCE uit, zoals audit/AC-10 dat voor de eigenaar doet.
select lives_ok($$alter table app.retention no force row level security$$, 'voorbereiding: FORCE RLS uit als eigenaar, alleen in deze transactie');
select results_eq(
  $$select r.rowtype, left(pg_temp.try_as('app_migrator', r.stmt), 5)
    from (values
      ('keep negatief', $s$insert into app.retention values ('app.retention_probe', 't', interval '-1 second', 'app', 'reden')$s$),
      ('time_column null met keep', $s$insert into app.retention values ('app.retention_probe', null, interval '1 year', 'app', 'reden')$s$),
      ('purger onbekend', $s$insert into app.retention values ('app.retention_probe', 't', interval '1 year', 'anders', 'reden')$s$),
      ('reden leeg', $s$insert into app.retention values ('app.retention_probe', 't', interval '1 year', 'app', '   ')$s$)
    ) r (rowtype, stmt) order by r.rowtype collate "C"$$,
  $$values ('keep negatief', '23514'), ('purger onbekend', '23514'), ('reden leeg', '23514'), ('time_column null met keep', '23514')$$,
  'app.retention: de CHECKs op keep, time_column, purger en reason weigeren met 23514 (AC-1)'
);
select is(
  pg_temp.try_as('app_migrator', $s$insert into app.retention values ('app.retention_probe', 't', interval '0', 'app', 'reden')$s$),
  '00000',
  'app.retention: keep van precies 0 is toegestaan (grens van de CHECK, AC-1)'
);

select * from finish();
rollback;
