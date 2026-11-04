-- app.integration_switches (spec koppelingsregister: koppelingsregister/AC-3, koppelingsregister/AC-6, koppelingsregister/AC-7,
-- koppelingsregister/AC-8; ADR 0077 punt 5 en 7): tabel, RLS, elke policy op
-- naam, grants per rol, retentierij, app.integration_enabled en app.set_integration_enabled (toegang, naamcontrole, upsert en
-- auditregel). Alles in één transactie die terugdraait. pgTAP verbindt als app_migrator: zonder actor is dat de scripttak
-- (OV-7); de andere takken wisselen naar app_authenticated met de actor zoals withUser hem zet (set_config, is_local true).
-- De race (AC-9) staat in test/integrations/race.int.test.ts.
begin;
set search_path = tap, public;
select plan(52);

insert into better_auth."user" (id, name, email, "emailVerified") values
  ('k-user', 'Gebruiker', 'k-user@test.local', true),
  ('k-admin', 'Admin', 'k-admin@test.local', true);
insert into better_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values
  ('k-acc-user', 'k-user', 'credential', 'k-user', 'hash', now(), now()),
  ('k-acc-admin', 'k-admin', 'credential', 'k-admin', 'hash', now(), now());
do $$ begin
  perform app.assign_role('k-user', 'user');
  perform app.assign_role('k-admin', 'admin');
end $$;

-- Hulp: het aantal auditregels voor een koppeling (als app_migrator, lid van app_definer).
create function pg_temp.audit_count(p_name text, p_action text) returns integer language sql as $$
  select count(*)::integer from app.audit_log
  where target_type = 'integration' and target_id = p_name and action = p_action
$$;

-- Hulp: een rechtstreekse insert als app_definer; geeft '00000' of de sqlstate (vorm van try_as in audit_log.sql).
create function pg_temp.try_insert(p_name text) returns text language plpgsql as $$
declare v_result text;
begin
  set local role app_definer;
  begin
    insert into app.integration_switches (name, enabled) values (p_name, true);
    v_result := '00000';
  exception when others then
    v_result := sqlstate || '|' || sqlerrm;
  end;
  reset role;
  return v_result;
end $$;

-- Tabel (AC-8).
select is(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid = to_regclass('app.integration_switches')),
  true,
  'app.integration_switches: RLS aan en geforceerd'
);
select results_eq(
  $$select a.attname::text collate "default", pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull
    from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('app.integration_switches') and a.attnum > 0 and not a.attisdropped order by a.attnum$$,
  $$values ('name', 'text', true), ('enabled', 'boolean', true), ('updated_at', 'timestamp with time zone', true)$$,
  'app.integration_switches: kolommen name text, enabled boolean not null, updated_at timestamptz not null'
);
select col_is_pk('app', 'integration_switches', 'name', 'app.integration_switches: name is de primaire sleutel');
select col_default_is('app', 'integration_switches', 'updated_at', 'now()', 'app.integration_switches: updated_at default now()');
select results_eq(
  $$select left(pg_temp.try_insert(n), 5) from unnest(array['A', 'a_b', '1a', repeat('a', 64)]) with ordinality u (n, i) order by i$$,
  $$values ('23514'), ('23514'), ('23514'), ('23514')$$,
  'app.integration_switches: de CHECK weigert een naam buiten het patroon of langer dan 63 tekens (23514)'
);

-- Policies (AC-8): precies select, insert en update voor app_definer; geen delete.
select policies_are(
  'app', 'integration_switches',
  array['integration_switches_definer_select', 'integration_switches_definer_insert', 'integration_switches_definer_update'],
  'app.integration_switches heeft precies deze policies (geen delete)'
);
select results_eq(
  $$select p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default",
           coalesce(p.qual, '-')::text collate "default", coalesce(p.with_check, '-')::text collate "default"
    from pg_catalog.pg_policies p
    where p.schemaname = 'app' and p.tablename = 'integration_switches' and p.policyname = 'integration_switches_definer_select'$$,
  $$values ('SELECT', '{app_definer}', 'PERMISSIVE', 'true', '-')$$,
  'integration_switches_definer_select: for select to app_definer using (true)'
);
select results_eq(
  $$select p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default",
           coalesce(p.qual, '-')::text collate "default", coalesce(p.with_check, '-')::text collate "default"
    from pg_catalog.pg_policies p
    where p.schemaname = 'app' and p.tablename = 'integration_switches' and p.policyname = 'integration_switches_definer_insert'$$,
  $$values ('INSERT', '{app_definer}', 'PERMISSIVE', '-', 'true')$$,
  'integration_switches_definer_insert: for insert to app_definer with check (true)'
);
select results_eq(
  $$select p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default",
           coalesce(p.qual, '-')::text collate "default", coalesce(p.with_check, '-')::text collate "default"
    from pg_catalog.pg_policies p
    where p.schemaname = 'app' and p.tablename = 'integration_switches' and p.policyname = 'integration_switches_definer_update'$$,
  $$values ('UPDATE', '{app_definer}', 'PERMISSIVE', 'true', 'true')$$,
  'integration_switches_definer_update: for update to app_definer using (true) with check (true)'
);

-- Grants per rol (AC-8).
select is(
  array(
    select r.rolname || ':' || p.privilege
    from (values ('app_authenticated'), ('api_user'), ('auth_service')) r (rolname)
    cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (privilege)
    where pg_catalog.has_table_privilege(r.rolname, 'app.integration_switches', p.privilege)
    order by 1
  ),
  '{}'::text[],
  'app_authenticated, api_user en auth_service hebben geen recht op de tabel'
);
select is(
  array(
    select p.privilege from (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (privilege)
    where pg_catalog.has_table_privilege('public', 'app.integration_switches', p.privilege)
  ),
  '{}'::text[],
  'PUBLIC heeft geen recht op de tabel'
);
select is(
  array(
    select p.privilege from (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (privilege)
    where pg_catalog.has_table_privilege('app_definer', 'app.integration_switches', p.privilege)
    order by 1
  ),
  array['insert', 'select', 'update'],
  'app_definer heeft precies select, insert en update op de tabel'
);

-- Retentierij (AC-8).
select results_eq(
  $$select time_column, keep, purger, reason from app.retention where table_name = to_regclass('app.integration_switches')$$,
  $$values (null::text, null::interval, 'app', 'configuratie per koppeling, geen persoonsgegevens')$$,
  'app.retention: rij voor app.integration_switches zonder termijn, purger app'
);

-- Functies (AC-8): security definer, eigenaar app_definer, search_path leeg; execute per rol.
select results_eq(
  $$select p.proowner::regrole::text, p.prosecdef, coalesce(p.proconfig @> array['search_path=""'], false), p.provolatile::text,
           p.prorettype::regtype::text
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('app.integration_enabled(text)')$$,
  $$values ('app_definer', true, true, 's', 'boolean')$$,
  'app.integration_enabled: security definer, stable, eigenaar app_definer, search_path leeg, returns boolean'
);
select results_eq(
  $$select p.proowner::regrole::text, p.prosecdef, coalesce(p.proconfig @> array['search_path=""'], false)
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('app.set_integration_enabled(text, boolean)')$$,
  $$values ('app_definer', true, true)$$,
  'app.set_integration_enabled: security definer, eigenaar app_definer, search_path leeg'
);
select results_eq(
  $$select r.rolname::text, pg_catalog.has_function_privilege(r.rolname, to_regprocedure('app.integration_enabled(text)'), 'execute')
    from (values ('app_authenticated'), ('auth_service'), ('public')) r (rolname) order by 1$$,
  $$values ('app_authenticated', true), ('auth_service', false), ('public', false)$$,
  'app.integration_enabled: execute voor app_authenticated, niet voor auth_service of PUBLIC'
);
select results_eq(
  $$select r.rolname::text, pg_catalog.has_function_privilege(r.rolname, to_regprocedure('app.set_integration_enabled(text, boolean)'), 'execute')
    from (values ('app_authenticated'), ('app_migrator'), ('auth_service'), ('public')) r (rolname) order by 1$$,
  $$values ('app_authenticated', true), ('app_migrator', true), ('auth_service', false), ('public', false)$$,
  'app.set_integration_enabled: execute voor app_authenticated en app_migrator, niet voor auth_service of PUBLIC (OV-5)'
);

-- AC-7: integration_enabled zonder actor 42501, ook vóór de naamcontrole.
set local role app_authenticated;
do $$ begin perform set_config('app.user_id', '', true); perform set_config('app.session_strength', '', true); end $$;
select throws_ok($$select app.integration_enabled('pg-een')$$, '42501', null, 'app.integration_enabled: zonder actor 42501 (AC-7)');
select throws_ok($$select app.integration_enabled('A')$$, '42501', null, 'app.integration_enabled: zonder actor eerst 42501, ook bij een ongeldige naam (AC-7)');
select throws_ok($$select * from app.integration_switches$$, '42501', null, 'app_authenticated leest de tabel niet rechtstreeks (AC-8)');

-- AC-3 en AC-7 met een actor: geen rij is false; ongeldige naam 22023.
do $$ begin perform set_config('app.user_id', 'k-user', true); perform set_config('app.session_strength', 'password', true); end $$;
select is(app.integration_enabled('pg-geen-rij'), false, 'app.integration_enabled: zonder rij false (AC-3, OV-2)');
select is(app.integration_enabled(repeat('a', 63)), false, 'app.integration_enabled: een naam van precies 63 tekens is geldig');
select throws_ok($$select app.integration_enabled('A')$$, '22023', null, 'app.integration_enabled: naam A is 22023 (AC-7)');
select throws_ok($$select app.integration_enabled('a_b')$$, '22023', null, 'app.integration_enabled: naam a_b is 22023 (AC-7)');
select throws_ok($$select app.integration_enabled(repeat('a', 64))$$, '22023', null, 'app.integration_enabled: naam van 64 tekens is 22023 (AC-7)');

-- AC-6: een gewone gebruiker en een admin zonder MFA krijgen 42501, ook vóór de naamcontrole.
select throws_ok($$select app.set_integration_enabled('pg-een', true)$$, '42501', null, 'app.set_integration_enabled: een gewone gebruiker 42501 (AC-6)');
select throws_ok($$select app.set_integration_enabled('A', true)$$, '42501', null, 'app.set_integration_enabled: een gewone gebruiker eerst 42501, ook bij een ongeldige naam');
do $$ begin perform set_config('app.user_id', 'k-admin', true); perform set_config('app.session_strength', 'password', true); end $$;
select throws_ok($$select app.set_integration_enabled('pg-een', true)$$, '42501', null, 'app.set_integration_enabled: een admin zonder MFA 42501 (AC-6)');

-- AC-6: een admin met MFA; één auditregel per echte wijziging.
do $$ begin perform set_config('app.user_id', 'k-admin', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select lives_ok($$select app.set_integration_enabled('pg-een', true)$$, 'integration_switches_definer_insert: een admin met MFA zet een nieuwe koppeling aan');
select is(app.integration_enabled('pg-een'), true, 'integration_switches_definer_select: daarna leest integration_enabled true');
select lives_ok($$select app.set_integration_enabled('pg-een', true)$$, 'app.set_integration_enabled: nog eens aan is geen fout (gelijk: niets schrijven)');
select lives_ok($$select app.set_integration_enabled('pg-een', false)$$, 'integration_switches_definer_update: een admin met MFA zet de koppeling uit');
select is(app.integration_enabled('pg-een'), false, 'app.integration_enabled: na uit false');
select lives_ok($$select app.set_integration_enabled('pg-twee', false)$$, 'app.set_integration_enabled: uit zonder rij is geen fout');
select throws_ok($$select app.set_integration_enabled('A', true)$$, '22023', null, 'app.set_integration_enabled: naam A is 22023 (AC-7)');
select throws_ok($$select app.set_integration_enabled('a_b', true)$$, '22023', null, 'app.set_integration_enabled: naam a_b is 22023 (AC-7)');
select throws_ok($$select app.set_integration_enabled(repeat('a', 64), true)$$, '22023', null, 'app.set_integration_enabled: naam van 64 tekens is 22023 (AC-7)');
reset role;

select results_eq(
  $$select name, enabled, updated_at = now() from app.integration_switches where name in ('pg-een', 'pg-twee') order by name$$,
  $$values ('pg-een', false, true)$$,
  'app.set_integration_enabled: één rij voor pg-een met updated_at; geen rij voor pg-twee (uit zonder rij)'
);
select is(pg_temp.audit_count('pg-een', 'core.integration.enable'), 1, 'app.set_integration_enabled: precies één auditregel voor aan, niet voor de herhaling (AC-6)');
select is(pg_temp.audit_count('pg-een', 'core.integration.disable'), 1, 'app.set_integration_enabled: precies één auditregel voor uit (AC-6)');
select is(
  (select count(*)::integer from app.audit_log where target_type = 'integration' and target_id = 'pg-twee'),
  0,
  'app.set_integration_enabled: false zonder rij schrijft geen auditregel (AC-6)'
);
select results_eq(
  $$select action, actor_id, target_type, target_id, details from app.audit_log
    where target_type = 'integration' and target_id = 'pg-een' order by id$$,
  $$values ('core.integration.enable', 'k-admin', 'integration', 'pg-een', '{}'::jsonb),
           ('core.integration.disable', 'k-admin', 'integration', 'pg-een', '{}'::jsonb)$$,
  'app.set_integration_enabled: auditregels met de admin als actor, doeltype integration, doel-ID de naam, details {}'
);

-- AC-6: app_migrator zonder actor (het script, OV-7).
do $$ begin perform set_config('app.user_id', '', true); perform set_config('app.session_strength', '', true); end $$;
select lives_ok($$select app.set_integration_enabled('pg-drie', true)$$, 'app.set_integration_enabled: app_migrator zonder actor zet een koppeling aan (AC-6)');
select lives_ok($$select app.set_integration_enabled('pg-drie', true)$$, 'app.set_integration_enabled: app_migrator nog eens aan: niets schrijven');
select lives_ok($$select app.set_integration_enabled('pg-vier', false)$$, 'app.set_integration_enabled: app_migrator uit zonder rij');
select results_eq(
  $$select action, actor_id, db_role from app.audit_log where target_type = 'integration' and target_id = 'pg-drie' order by id$$,
  $$values ('core.integration.enable', null::text, 'app_migrator')$$,
  'app.set_integration_enabled: app_migrator schrijft precies één auditregel, zonder actor en met db_role app_migrator (AC-6)'
);
select is(
  (select count(*)::integer from app.integration_switches where name = 'pg-vier')
    + (select count(*)::integer from app.audit_log where target_type = 'integration' and target_id = 'pg-vier'),
  0,
  'app.set_integration_enabled: app_migrator false zonder rij: geen rij en geen auditregel (AC-6)'
);
select throws_ok($$select app.set_integration_enabled('A', true)$$, '22023', null, 'app.set_integration_enabled: app_migrator met naam A is 22023 (AC-7)');
select throws_ok($$select app.set_integration_enabled('a_b', true)$$, '22023', null, 'app.set_integration_enabled: app_migrator met naam a_b is 22023 (AC-7)');
select throws_ok($$select app.set_integration_enabled(repeat('a', 64), true)$$, '22023', null, 'app.set_integration_enabled: app_migrator met naam van 64 tekens is 22023 (AC-7)');
select throws_ok($$select app.integration_enabled('pg-drie')$$, '42501', null, 'app.integration_enabled: ook app_migrator zonder actor krijgt 42501 (AC-7)');

-- Rij buiten het register: de database kent het register niet; een rij voor een onbekende naam stoort niets (Randgevallen).
select is(
  (select count(*)::integer from app.integration_switches where name like 'pg-%'),
  2,
  'app.integration_switches: alleen echte wijzigingen staan als rij (pg-een en pg-drie)'
);

select * from finish();
rollback;
