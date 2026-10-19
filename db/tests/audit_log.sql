-- app.audit_log en wie erin schrijft (spec audit-log, deel A en B: AC-5 t/m AC-20; ADR 0021): tabel, CHECKs, grants,
-- exact vier policies op naam, de guard-triggers (append-only, behalve verwijderen na de termijn), app.request_id(), app.audit, app.audit_account_action en de
-- regels van app.assign_role en app.set_account_blocked. Alles in één transactie die terugdraait.
-- Alles wat de nieuwe objecten raakt staat als tekst in een assert of in een hulpfunctie die fouten vangt, zodat een
-- ontbrekende migratie als falende assert verschijnt en niet als afgebroken script.
-- Test: de hulpfuncties draaien als app_migrator en wisselen per aanroep van rol (zoals de testkit); pgTAP zelf wordt nooit
-- als app_definer of app_authenticated aangeroepen.
begin;
set search_path = tap, public;
select plan(93);

-- Zet de actor zoals withUser() hem zet (set_config met is_local = true), inclusief de requestId van de server.
create procedure pg_temp.act(p_user text, p_strength text, p_request text) language sql as $$
  select set_config('app.user_id', p_user, true),
         set_config('app.session_strength', p_strength, true),
         set_config('app.request_id', p_request, true)
$$;

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

-- Een jsonb-object van precies p_bytes bytes in tekstvorm (140 sleutels van 14 bytes, plus één opvulwaarde van 9 + m bytes),
-- met alleen korte waarden zonder spaties of @ (ook als details later per waarde bewaakt worden).
create function pg_temp.details_of_size(p_bytes integer) returns jsonb language sql as $$
  select (select jsonb_object_agg('k' || lpad(i::text, 4, '0'), 'v') from generate_series(1, 140) i)
         || jsonb_build_object('p', repeat('x', p_bytes - 1969))
$$;

-- Testgebruikers (better_auth heeft geen RLS; app_migrator is eigenaar). al-promote en al-invited hebben geen
-- credential-account en tellen dus niet mee als admin (ADR 0026, besluit 4).
insert into better_auth."user" (id, name, email, "emailVerified") values
  ('al-admin', 'Admin Een', 'al-admin@test.local', true),
  ('al-admin2', 'Admin Twee', 'al-admin2@test.local', true),
  ('al-promote', 'Wordt admin', 'al-promote@test.local', true),
  ('al-user', 'Gebruiker', 'al-user@test.local', true),
  ('al-victim', 'Slachtoffer', 'al-victim@test.local', true),
  ('al-invited', 'Uitgenodigd', 'al-invited@test.local', false);
insert into better_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values
  ('alacc-1', 'al-admin', 'credential', 'al-admin', 'hash', now(), now()),
  ('alacc-2', 'al-admin2', 'credential', 'al-admin2', 'hash', now(), now()),
  ('alacc-3', 'al-user', 'credential', 'al-user', 'hash', now(), now()),
  ('alacc-4', 'al-victim', 'credential', 'al-victim', 'hash', now(), now());
-- Als script (app_migrator, geen actor, geen requestId): AC-12.
do $$ begin
  perform app.assign_role('al-admin', 'admin');
  perform app.assign_role('al-admin2', 'admin');
  perform app.assign_role('al-promote', 'user');
  perform app.assign_role('al-user', 'user');
  perform app.assign_role('al-victim', 'user');
  perform app.assign_role('al-invited', 'user');
end $$;

-- AC-5: de tabel, RLS, kolommen, CHECKs, indexen.
select is(to_regclass('app.audit_log')::text, 'app.audit_log', 'app.audit_log: de tabel bestaat in schema app');
select results_eq(
  $$select c.relrowsecurity, c.relforcerowsecurity, c.relowner::regrole::text
    from pg_catalog.pg_class c where c.oid = to_regclass('app.audit_log')$$,
  $$values (true, true, 'app_migrator')$$,
  'app.audit_log: RLS aan en geforceerd, eigenaar app_migrator (AC-5)'
);
select results_eq(
  $$select a.attname::text collate "default", pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull,
           a.attidentity::text collate "default"
    from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('app.audit_log') and a.attnum > 0 and not a.attisdropped order by a.attnum$$,
  $$values ('id', 'bigint', true, 'a'), ('at', 'timestamp with time zone', true, ''), ('actor_id', 'text', false, ''),
           ('db_role', 'text', true, ''), ('action', 'text', true, ''), ('target_type', 'text', false, ''),
           ('target_id', 'text', false, ''), ('request_id', 'text', false, ''), ('details', 'jsonb', true, '')$$,
  'app.audit_log: kolommen en types uit de spec (id generated always as identity, actor_id zonder foreign key)'
);
select results_eq(
  $$select a.attname::text collate "default",
           case a.attname::text
             when 'at' then e ~* '^(pg_catalog\.)?now\(\)$'
             when 'db_role' then e ~* '^session_user$'
             when 'details' then e ~ '^''\{\}''::jsonb$'
             else false end
    from (select a.attname, pg_catalog.pg_get_expr(d.adbin, d.adrelid) as e
          from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
          where d.adrelid = to_regclass('app.audit_log')) a order by 1$$,
  $$values ('at', true), ('db_role', true), ('details', true)$$,
  'app.audit_log: defaults at = now(), db_role = session_user, details = {}'
);
select results_eq(
  $$select count(*)::integer from pg_catalog.pg_constraint
    where conrelid = to_regclass('app.audit_log') and contype = 'f'$$,
  $$values (0)$$,
  'app.audit_log: geen foreign keys (ADR 0022 punt 4)'
);
select results_eq(
  $$select (select count(*)::integer from pg_catalog.pg_indexes
            where schemaname = 'app' and tablename = 'audit_log' and indexdef ~ '\(target_type, target_id, at\)'),
          (select count(*)::integer from pg_catalog.pg_indexes
            where schemaname = 'app' and tablename = 'audit_log' and indexdef ~ '\(actor_id, at\)')$$,
  $$values (1, 1)$$,
  'app.audit_log: indexen op (target_type, target_id, at) en (actor_id, at)'
);
select results_eq(
  $$select r.rowtype, left(pg_temp.try_as('app_definer', r.stmt), 5)
    from (values
      ('action hoofdletter', $s$insert into app.audit_log (action) values ('Bad.x')$s$),
      ('action zonder punt', $s$insert into app.audit_log (action) values ('nodot')$s$),
      ('action met cijfer', $s$insert into app.audit_log (action) values ('note.archive2')$s$),
      ('target_type hoofdletter', $s$insert into app.audit_log (action, target_type) values ('a.b', 'Acc')$s$),
      ('target_id met @', $s$insert into app.audit_log (action, target_id) values ('a.b', 'a@b')$s$),
      ('target_id met spatie', $s$insert into app.audit_log (action, target_id) values ('a.b', 'a b')$s$),
      ('target_id van 129 tekens', $s$insert into app.audit_log (action, target_id) values ('a.b', repeat('a', 129))$s$),
      ('details een array', $s$insert into app.audit_log (action, details) values ('a.b', '[]'::jsonb)$s$),
      ('details van 2049 bytes', format($s$insert into app.audit_log (action, details) values ('a.b', %L::jsonb)$s$, pg_temp.details_of_size(2049)))
    ) r (rowtype, stmt) order by r.rowtype collate "C"$$,
  $$values ('action hoofdletter', '23514'), ('action met cijfer', '23514'), ('action zonder punt', '23514'),
           ('details een array', '23514'), ('details van 2049 bytes', '23514'), ('target_id met @', '23514'),
           ('target_id met spatie', '23514'), ('target_id van 129 tekens', '23514'), ('target_type hoofdletter', '23514')$$,
  'app.audit_log: de CHECKs op action, target_type, target_id en details weigeren met 23514 (AC-5)'
);
select is(octet_length(pg_temp.details_of_size(2048)::text), 2048, 'voorbereiding: details_of_size(2048) is 2048 bytes in tekstvorm');
select results_eq(
  $$select left(pg_temp.try_as('app_definer', format($s$insert into app.audit_log (action, details) values ('a.b', %L::jsonb)$s$, pg_temp.details_of_size(2048))), 5),
          left(pg_temp.try_as('app_definer', $s$insert into app.audit_log (action, target_id) values ('a.b', repeat('a', 128))$s$), 5)$$,
  $$values ('00000', '00000')$$,
  'app.audit_log: details van precies 2048 bytes en target_id van precies 128 tekens slagen (AC-5, AC-16)'
);
select results_eq(
  $$select coalesce(g.rolname, 'PUBLIC')::text collate "default", a.privilege_type::text
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where c.oid = to_regclass('app.audit_log') and a.grantee <> c.relowner order by 1, 2$$,
  $$values ('app_authenticated', 'SELECT'), ('app_definer', 'DELETE'), ('app_definer', 'SELECT')$$,
  'app.audit_log: tabelgrants zijn select voor app_authenticated en select en delete voor app_definer (AC-5, jobs/AC-7)'
);
select results_eq(
  $$select g.rolname::text collate "default", a.privilege_type::text, att.attname::text collate "default"
    from pg_catalog.pg_attribute att
    cross join lateral pg_catalog.aclexplode(att.attacl) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where att.attrelid = to_regclass('app.audit_log') and att.attacl is not null
    order by att.attname::text collate "C"$$,
  $$values ('app_definer', 'INSERT', 'action'), ('app_definer', 'INSERT', 'actor_id'), ('app_definer', 'INSERT', 'details'),
           ('app_definer', 'INSERT', 'request_id'), ('app_definer', 'INSERT', 'target_id'), ('app_definer', 'INSERT', 'target_type')$$,
  'app.audit_log: app_definer mag alleen de kolommen actor_id, action, target_type, target_id, request_id en details invoegen (OV-B2)'
);
select results_eq(
  $$select p.policyname::text collate "default", p.cmd::text collate "default", p.roles::text collate "default"
    from pg_catalog.pg_policies p where p.schemaname = 'app' and p.tablename = 'audit_log' order by 1$$,
  $$values ('audit_log_definer_delete', 'DELETE', '{app_definer}'), ('audit_log_definer_insert', 'INSERT', '{app_definer}'),
           ('audit_log_definer_select', 'SELECT', '{app_definer}'), ('audit_log_select_admin', 'SELECT', '{app_authenticated}')$$,
  'app.audit_log: precies vier policies (audit_log_definer_delete, audit_log_definer_insert, audit_log_definer_select, audit_log_select_admin; jobs/AC-7)'
);
select results_eq(
  $$select t.tgname::text collate "default", t.tgtype::integer, t.tgenabled::text collate "default",
           t.tgfoid::regproc::text collate "default"
    from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('app.audit_log') and not t.tgisinternal order by 1$$,
  $$values ('audit_log_delete_expired_only', 11, 'O', 'app.audit_log_guard_delete'), ('audit_log_no_truncate', 34, 'O', 'app.audit_log_guard'),
           ('audit_log_no_update', 18, 'O', 'app.audit_log_guard')$$,
  'app.audit_log: guard-triggers before update en truncate op statement-niveau (app.audit_log_guard) en before delete per rij (app.audit_log_guard_delete), aan (jobs/AC-7)'
);
select results_eq(
  $$select p.proowner::regrole::text, p.prosecdef, p.proconfig @> array['search_path=""'], p.prorettype::regtype::text
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('app.audit_log_guard()')$$,
  $$values ('app_definer', false, true, 'trigger')$$,
  'app.audit_log_guard: eigenaar app_definer, geen security definer, search_path leeg, returns trigger'
);
select results_eq(
  $$select (select count(*)::integer from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = 'audit'),
          p.proowner::regrole::text, p.prosecdef, p.proconfig @> array['search_path=""'], p.prorettype::regtype::text,
          pg_catalog.pg_get_function_arguments(p.oid)
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('app.audit(text, text, text, jsonb)')$$,
  $$values (1, 'app_definer', true, true, 'void', 'p_action text, p_target_type text, p_target_id text, p_details jsonb')$$,
  'app.audit: één functie, security definer, eigenaar app_definer, search_path leeg, geen parameter voor de actor'
);
select results_eq(
  $$select (select count(*)::integer from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app' and p.proname = 'audit_account_action'),
          p.proowner::regrole::text, p.prosecdef, p.proconfig @> array['search_path=""'], p.prorettype::regtype::text,
          pg_catalog.pg_get_function_arguments(p.oid)
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('app.audit_account_action(text, text)')$$,
  $$values (1, 'app_definer', true, true, 'void', 'p_action text, p_target_id text')$$,
  'app.audit_account_action: één functie, security definer, eigenaar app_definer, search_path leeg'
);
select results_eq(
  $$select f.functie, r.rolname,
           pg_catalog.has_function_privilege(r.rolname, to_regprocedure(f.functie), 'execute')
    from (values ('app.audit(text, text, text, jsonb)'), ('app.audit_account_action(text, text)'), ('app.request_id()')) f (functie)
    cross join (values ('app_authenticated'), ('app_definer'), ('api_user'), ('auth_service'), ('public')) r (rolname)
    order by f.functie collate "C", r.rolname collate "C"$$,
  $$values ('app.audit(text, text, text, jsonb)', 'api_user', false),
           ('app.audit(text, text, text, jsonb)', 'app_authenticated', true),
           ('app.audit(text, text, text, jsonb)', 'app_definer', true),
           ('app.audit(text, text, text, jsonb)', 'auth_service', false),
           ('app.audit(text, text, text, jsonb)', 'public', false),
           ('app.audit_account_action(text, text)', 'api_user', false),
           ('app.audit_account_action(text, text)', 'app_authenticated', true),
           ('app.audit_account_action(text, text)', 'app_definer', true),
           ('app.audit_account_action(text, text)', 'auth_service', false),
           ('app.audit_account_action(text, text)', 'public', false),
           ('app.request_id()', 'api_user', false),
           ('app.request_id()', 'app_authenticated', false),
           ('app.request_id()', 'app_definer', true),
           ('app.request_id()', 'auth_service', false),
           ('app.request_id()', 'public', false)$$,
  'app.audit, app.audit_account_action en app.request_id: execute alleen voor de bedoelde rollen, nooit PUBLIC'
);
select results_eq(
  $$select l.lanname::text collate "default", p.provolatile::text collate "default", p.prosecdef, p.proowner::regrole::text, p.prorettype::regtype::text
    from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure('app.request_id()')$$,
  $$values ('sql', 's', false, 'app_migrator', 'text')$$,
  'app.request_id: language sql, stable, geen security definer, eigenaar app_migrator (AC-1)'
);

-- Deel A: app.request_id() geeft de requestId van de server, een lege waarde als null.
call pg_temp.act('al-user', 'password', 'R-fn-1');
select is(pg_temp.query_as('app_definer', 'select app.request_id()'), 'R-fn-1', 'app.request_id: geeft app.request_id uit de transactie (AC-1)');
call pg_temp.act('al-user', 'password', '');
select is(pg_temp.query_as('app_definer', 'select app.request_id()'), null, 'app.request_id: een lege waarde is null (script zonder request)');

-- AC-12 (script): de setup hierboven draaide als app_migrator zonder actor en zonder requestId.
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where action = 'core.role.assign' and target_id = 'al-victim'$$),
  '1',
  'app.assign_role: een nieuw account met rol schrijft één regel core.role.assign (AC-12)'
);
select is(
  pg_temp.query_as('app_definer', $$select (to_jsonb(a) - 'id' - 'at')::text from app.audit_log a
    where a.action = 'core.role.assign' and a.target_id = 'al-victim'$$)::jsonb,
  '{"actor_id": null, "db_role": "app_migrator", "action": "core.role.assign", "target_type": "account", "target_id": "al-victim", "request_id": null, "details": {"role": "user"}}'::jsonb,
  'app.assign_role: als app_migrator zonder actor: actor_id null, db_role app_migrator, previous weggelaten bij een nieuw account (AC-12, OV-B3)'
);
call pg_temp.act('', 'none', 'req-nochange');
select is(pg_temp.try_as('app_migrator', $$select app.assign_role('al-user', 'user')$$), '00000', 'voorbereiding: dezelfde rol toekennen is geen fout');
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id = 'req-nochange'$$),
  '0',
  'app.assign_role: een rol gelijk aan de huidige schrijft geen regel (OV-B3)'
);

-- AC-6: audit_log_definer_insert.
select is(
  left(pg_temp.try_as('app_definer', $$insert into app.audit_log (actor_id, action, target_type, target_id) values ('al-user', 'note.archive', 'note', 'n1')$$), 5),
  '00000',
  'audit_log_definer_insert: app_definer mag een regel invoegen'
);
select is(
  left(pg_temp.try_as('app_definer', $$insert into app.audit_log (actor_id, action, target_type, target_id) values ('al-admin', 'core.role.assign', 'account', 'al-user')$$), 5),
  '00000',
  'voorbereiding: tweede regel, met de user als doel'
);
call pg_temp.act('al-admin', 'mfa', 'req-6');
select is(
  left(pg_temp.try_as('app_authenticated', $$insert into app.audit_log (action) values ('a.b')$$), 5),
  '42501',
  'audit_log_definer_insert: app_authenticated (ook een admin met MFA) kan niet invoegen (42501)'
);
select is(
  left(pg_temp.try_as('app_definer', $$insert into app.audit_log (id, action) overriding system value values (999999, 'a.b')$$), 5),
  '42501',
  'audit_log_definer_insert: app_definer kiest id niet zelf (kolomgrant, OV-B2)'
);
select is(
  left(pg_temp.try_as('app_definer', $$insert into app.audit_log (at, action) values ('2020-01-01', 'a.b')$$), 5),
  '42501',
  'audit_log_definer_insert: app_definer kiest at niet zelf (kolomgrant, OV-B2)'
);
select is(
  left(pg_temp.try_as('app_definer', $$insert into app.audit_log (db_role, action) values ('app_migrator', 'a.b')$$), 5),
  '42501',
  'audit_log_definer_insert: app_definer kiest db_role niet zelf (kolomgrant, OV-B2)'
);

-- AC-7: audit_log_select_admin.
call pg_temp.act('al-admin', 'mfa', 'req-7');
select ok(
  (select case when v ~ '^[0-9]+$' then v::integer > 2 else false end
   from (select pg_temp.query_as('app_authenticated', 'select count(*)::text from app.audit_log') as v) s),
  'audit_log_select_admin: een admin met MFA ziet de regels'
);
select is(
  pg_temp.query_as('app_authenticated', 'select count(*)::text from app.audit_log'),
  pg_temp.query_as('app_definer', 'select count(*)::text from app.audit_log'),
  'audit_log_select_admin: een admin met MFA ziet alle regels'
);
call pg_temp.act('al-admin', 'password', 'req-7');
select is(
  pg_temp.query_as('app_authenticated', 'select count(*)::text from app.audit_log'),
  '0',
  'audit_log_select_admin: een admin met sessie password ziet 0 regels'
);
call pg_temp.act('al-user', 'password', 'req-7');
select is(
  pg_temp.query_as('app_authenticated', 'select count(*)::text from app.audit_log'),
  '0',
  'audit_log_select_admin: een user ziet 0 regels, ook niet die met hemzelf als actor of doel'
);
call pg_temp.act('al-user', 'mfa', 'req-7');
select is(
  pg_temp.query_as('app_authenticated', 'select count(*)::text from app.audit_log'),
  '0',
  'audit_log_select_admin: een user met sessie mfa ziet ook 0 regels'
);
call pg_temp.act('', 'none', 'req-7');
select is(
  pg_temp.query_as('app_authenticated', 'select count(*)::text from app.audit_log'),
  '0',
  'audit_log_select_admin: zonder actor 0 regels'
);

-- AC-8: audit_log_definer_select.
select ok(
  (select case when v ~ '^[0-9]+$' then v::integer > 2 else false end
   from (select pg_temp.query_as('app_definer', 'select count(*)::text from app.audit_log') as v) s),
  'audit_log_definer_select: app_definer ziet alle regels'
);

-- AC-9: app_authenticated schrijft nooit; api_user en auth_service hebben geen enkel recht.
call pg_temp.act('al-admin', 'mfa', 'req-9');
select results_eq(
  $$select p.stmt, left(pg_temp.try_as('app_authenticated', p.stmt), 5)
    from (values
      ($s$insert into app.audit_log (action) values ('a.b')$s$),
      ($s$update app.audit_log set action = 'a.b'$s$),
      ($s$delete from app.audit_log$s$),
      ($s$truncate app.audit_log$s$)
    ) p (stmt) order by 1$$,
  $$values ('delete from app.audit_log', '42501'), ('insert into app.audit_log (action) values (''a.b'')', '42501'),
           ('truncate app.audit_log', '42501'), ('update app.audit_log set action = ''a.b''', '42501')$$,
  'app_authenticated: insert, update, delete en truncate op app.audit_log falen met 42501, ook als admin met MFA (AC-9)'
);
select is(
  (select count(*)::integer
   from (values ('api_user'), ('auth_service')) r (rolname)
   cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (recht)
   where coalesce(pg_catalog.has_table_privilege(r.rolname, to_regclass('app.audit_log'), p.recht), true)
      or case when p.recht in ('select', 'insert', 'update', 'references')
              then coalesce(pg_catalog.has_any_column_privilege(r.rolname, to_regclass('app.audit_log'), p.recht), true)
              else false end),
  0,
  'api_user en auth_service: geen enkel recht op app.audit_log (AC-9)'
);
select is(
  (select count(*)::integer
   from (values ('app_authenticated'), ('app_definer')) r (rolname)
   cross join (values ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (recht)
   where not (r.rolname = 'app_definer' and p.recht = 'delete') -- sinds jobs/AC-6 mag app_definer verwijderen (binnen de termijn-policy)
     and coalesce(pg_catalog.has_table_privilege(r.rolname, to_regclass('app.audit_log'), p.recht), true)
      or (p.recht = 'update' and coalesce(pg_catalog.has_any_column_privilege(r.rolname, to_regclass('app.audit_log'), 'update'), true))),
  0,
  'app_authenticated en app_definer: geen update, delete, truncate, references of trigger op app.audit_log (AC-9)'
);

-- AC-10: niemand wijzigt of verwijdert, ook de eigenaar niet, ook als de where 0 rijen raakt.
select results_eq(
  $$select r.rol, p.stmt, left(pg_temp.try_as(r.rol, p.stmt), 5)
    from (values ('app_definer')) r (rol)
    cross join (values
      ($s$update app.audit_log set action = 'a.b'$s$), ($s$update app.audit_log set action = 'a.b' where false$s$),
      ($s$delete from app.audit_log$s$), ($s$delete from app.audit_log where false$s$), ($s$truncate app.audit_log$s$)
    ) p (stmt) order by 2$$,
  $$values ('app_definer', 'delete from app.audit_log', '00000'), ('app_definer', 'delete from app.audit_log where false', '00000'),
           ('app_definer', 'truncate app.audit_log', '42501'), ('app_definer', 'update app.audit_log set action = ''a.b''', '42501'),
           ('app_definer', 'update app.audit_log set action = ''a.b'' where false', '42501')$$,
  'app_definer: update en truncate op app.audit_log falen met 42501, ook met where false; delete raakt 0 rijen zolang geen regel verlopen is (AC-10, jobs/AC-6)'
);
select results_eq(
  $$select p.stmt, pg_temp.try_as('app_migrator', p.stmt)
    from (values
      ($s$update app.audit_log set action = 'a.b'$s$), ($s$update app.audit_log set action = 'a.b' where false$s$),
      ($s$delete from app.audit_log$s$), ($s$delete from app.audit_log where false$s$), ($s$truncate app.audit_log$s$)
    ) p (stmt) order by 1$$,
  $$values ('delete from app.audit_log', '00000'),
           ('delete from app.audit_log where false', '00000'),
           ('truncate app.audit_log', '42501|audit log is append-only'),
           ('update app.audit_log set action = ''a.b''', '42501|audit log is append-only'),
           ('update app.audit_log set action = ''a.b'' where false', '42501|audit log is append-only')$$,
  'app_migrator (eigenaar): update en truncate falen met 42501 door de guard-trigger, ook met where false; delete raakt 0 rijen onder FORCE RLS (AC-10, jobs/AC-6)'
);

-- AC-11: app.assign_role door een admin met MFA, user -> admin.
call pg_temp.act('al-admin', 'mfa', 'req-11');
select is(pg_temp.try_as('app_authenticated', $$select app.assign_role('al-promote', 'admin')$$), '00000', 'voorbereiding: de admin maakt al-promote admin');
select is(
  pg_temp.query_as('app_definer', $$select jsonb_build_object('n', count(*),
      'rows', jsonb_agg(jsonb_build_object('actor_id', actor_id, 'db_role_is_session_user', db_role = session_user,
        'action', action, 'target_type', target_type, 'target_id', target_id, 'details', details, 'request_id', request_id)))::text
    from app.audit_log where request_id = 'req-11'$$)::jsonb,
  '{"n": 1, "rows": [{"actor_id": "al-admin", "db_role_is_session_user": true, "action": "core.role.assign", "target_type": "account", "target_id": "al-promote", "details": {"role": "admin", "previous": "user"}, "request_id": "req-11"}]}'::jsonb,
  'app.assign_role: schrijft precies één regel met actor, db_role, doel, details en request_id (AC-11)'
);

-- AC-14: blokkeren en deblokkeren schrijven alleen bij een echte wijziging.
call pg_temp.act('al-admin', 'mfa', 'req-14a');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-victim', true)$$), '00000', 'voorbereiding: blokkeren');
select is(
  pg_temp.query_as('app_definer', $$select jsonb_build_object('n', count(*), 'actions', jsonb_agg(action), 'actors', jsonb_agg(actor_id),
      'types', jsonb_agg(target_type), 'targets', jsonb_agg(target_id), 'details', jsonb_agg(details))::text
    from app.audit_log where request_id = 'req-14a'$$)::jsonb,
  '{"n": 1, "actions": ["core.account.block"], "actors": ["al-admin"], "types": ["account"], "targets": ["al-victim"], "details": [{}]}'::jsonb,
  'app.set_account_blocked: blokkeren schrijft één regel core.account.block met details {} (AC-14)'
);
call pg_temp.act('al-admin', 'mfa', 'req-14b');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-victim', true)$$), '00000', 'voorbereiding: opnieuw blokkeren is geen fout');
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id = 'req-14b'$$),
  '0',
  'app.set_account_blocked: opnieuw blokkeren van een geblokkeerd account schrijft geen tweede regel (AC-14)'
);
call pg_temp.act('al-admin', 'mfa', 'req-14c');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-victim', false)$$), '00000', 'voorbereiding: deblokkeren');
select is(
  pg_temp.query_as('app_definer', $$select jsonb_build_object('n', count(*), 'actions', jsonb_agg(action), 'details', jsonb_agg(details))::text
    from app.audit_log where request_id = 'req-14c'$$)::jsonb,
  '{"n": 1, "actions": ["core.account.unblock"], "details": [{}]}'::jsonb,
  'app.set_account_blocked: deblokkeren schrijft één regel core.account.unblock (AC-14)'
);
call pg_temp.act('al-admin', 'mfa', 'req-14d');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-victim', false)$$), '00000', 'voorbereiding: opnieuw deblokkeren is geen fout');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-user', false)$$), '00000', 'voorbereiding: deblokkeren van een niet-geblokkeerd account is geen fout');
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id = 'req-14d'$$),
  '0',
  'app.set_account_blocked: deblokkeren van een niet-geblokkeerd account schrijft niets (AC-14)'
);

-- AC-16: app.audit weigert en slaagt op de grenzen.
call pg_temp.act('', 'none', 'req-16');
select is(
  left(pg_temp.try_as('app_authenticated', $$select app.audit('note.archive', 'note', 'n16', '{}'::jsonb)$$), 5),
  '42501',
  'app.audit: zonder actor 42501 (AC-16)'
);
call pg_temp.act('al-user', 'password', 'req-16');
select results_eq(
  $$select r.omschrijving, left(pg_temp.try_as('app_authenticated', r.stmt), 5)
    from (values
      ('action met core.-voorvoegsel', $s$select app.audit('core.x.y', 'note', 'n16', '{}'::jsonb)$s$),
      ('target_type account', $s$select app.audit('note.archive', 'account', 'n16', '{}'::jsonb)$s$),
      ('target_id met @', $s$select app.audit('note.archive', 'note', 'a@b', '{}'::jsonb)$s$),
      ('target_id met spatie', $s$select app.audit('note.archive', 'note', 'a b', '{}'::jsonb)$s$),
      ('target_id van 129 tekens', $s$select app.audit('note.archive', 'note', repeat('a', 129), '{}'::jsonb)$s$),
      ('details geen object', $s$select app.audit('note.archive', 'note', 'n16', '[]'::jsonb)$s$),
      ('details van 2049 bytes', format($s$select app.audit('note.archive', 'note', 'n16', %L::jsonb)$s$, pg_temp.details_of_size(2049)))
    ) r (omschrijving, stmt) order by r.omschrijving collate "C"$$,
  $$values ('action met core.-voorvoegsel', '22023'), ('details geen object', '23514'), ('details van 2049 bytes', '23514'),
           ('target_id met @', '23514'), ('target_id met spatie', '23514'), ('target_id van 129 tekens', '23514'),
           ('target_type account', '22023')$$,
  'app.audit: core.-actie en target_type account geven 22023; een ongeldig target_id of details geven 23514 (AC-16)'
);
select results_eq(
  $$select left(pg_temp.try_as('app_authenticated', format($s$select app.audit('note.archive', 'note', 'n16', %L::jsonb)$s$, pg_temp.details_of_size(2048))), 5),
          left(pg_temp.try_as('app_authenticated', $s$select app.audit('note.archive', 'note', repeat('a', 128), '{}'::jsonb)$s$), 5)$$,
  $$values ('00000', '00000')$$,
  'app.audit: details van precies 2048 bytes en target_id van 128 tekens slagen (AC-16)'
);
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id = 'req-16'$$),
  '2',
  'app.audit: alleen de twee geldige aanroepen hebben een regel achtergelaten (AC-16)'
);

-- AC-17: de actor is altijd app.current_user_id().
call pg_temp.act('al-user', 'password', 'req-17');
select is(
  pg_temp.try_as('app_authenticated', $$select app.audit('note.archive', 'note', 'n17', '{"actor_id": "al-admin"}'::jsonb)$$),
  '00000',
  'voorbereiding: app.audit met een actor_id in details'
);
select is(
  pg_temp.query_as('app_definer', $$select jsonb_build_object('n', count(*), 'actors', jsonb_agg(actor_id), 'requests', jsonb_agg(request_id),
      'types', jsonb_agg(target_type))::text from app.audit_log where request_id = 'req-17'$$)::jsonb,
  '{"n": 1, "actors": ["al-user"], "requests": ["req-17"], "types": ["note"]}'::jsonb,
  'app.audit: actor_id is de actor van de sessie en request_id komt uit app.request_id(); geen parameter kiest de actor (AC-17)'
);

-- AC-18: app.audit_account_action.
call pg_temp.act('al-user', 'mfa', 'req-18');
select is(left(pg_temp.try_as('app_authenticated', $$select app.audit_account_action('core.account.invite', 'al-victim')$$), 5), '42501', 'app.audit_account_action: een user (ook met MFA) krijgt 42501 (AC-18)');
call pg_temp.act('al-admin', 'password', 'req-18');
select is(left(pg_temp.try_as('app_authenticated', $$select app.audit_account_action('core.account.invite', 'al-victim')$$), 5), '42501', 'app.audit_account_action: een admin zonder MFA krijgt 42501 (AC-18)');
call pg_temp.act('al-admin', 'mfa', 'req-18');
select results_eq(
  $$select r.actie, left(pg_temp.try_as('app_authenticated', format($s$select app.audit_account_action(%L, 'al-victim')$s$, r.actie)), 5)
    from (values ('core.account.block'), ('core.account.unblock'), ('core.role.assign'), ('note.archive'), ('core.account.delete')) r (actie)
    order by 1$$,
  $$values ('core.account.block', '22023'), ('core.account.delete', '22023'), ('core.account.unblock', '22023'),
           ('core.role.assign', '22023'), ('note.archive', '22023')$$,
  'app.audit_account_action: een actie buiten invite, reinvite, revoke en reset_link geeft 22023 (AC-18)'
);
select results_eq(
  $$select r.actie, left(pg_temp.try_as('app_authenticated', format($s$select app.audit_account_action(%L, 'al-victim')$s$, r.actie)), 5)
    from (values ('core.account.invite'), ('core.account.reinvite'), ('core.account.revoke'), ('core.account.reset_link')) r (actie)
    order by 1$$,
  $$values ('core.account.invite', '00000'), ('core.account.reinvite', '00000'), ('core.account.reset_link', '00000'),
           ('core.account.revoke', '00000')$$,
  'app.audit_account_action: een admin met MFA mag de vier acties vastleggen (AC-18)'
);
select is(
  pg_temp.query_as('app_definer', $$select jsonb_build_object('n', count(*), 'types', jsonb_agg(distinct target_type), 'targets', jsonb_agg(distinct target_id),
      'details', jsonb_agg(distinct details), 'actors', jsonb_agg(distinct actor_id), 'requests', jsonb_agg(distinct request_id))::text
    from app.audit_log where request_id = 'req-18'$$)::jsonb,
  '{"n": 4, "types": ["account"], "targets": ["al-victim"], "details": [{}], "actors": ["al-admin"], "requests": ["req-18"]}'::jsonb,
  'app.audit_account_action: schrijft target_type account, details {} en de actor en request_id van de sessie (AC-18)'
);
select is(
  left(pg_temp.try_as('app_authenticated', $$select app.audit_account_action('core.account.invite', 'a@b')$$), 5),
  '23514',
  'app.audit_account_action: een ongeldig target_id geeft 23514'
);

-- AC-20: een regel van een actie die daarna faalt, draait mee terug.
call pg_temp.act('al-user', 'password', 'req-20a');
select is(
  left(pg_temp.try_as('app_authenticated', $sql$do $x$ begin
    perform app.audit('note.archive', 'note', 'n20', '{}'::jsonb);
    raise exception 'boem';
  end $x$$sql$), 5),
  'P0001',
  'voorbereiding: app.audit gevolgd door een fout in dezelfde transactie'
);
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id = 'req-20a'$$),
  '0',
  'app.audit: na een fout ná het schrijven draait de regel mee terug (AC-20)'
);
call pg_temp.act('al-user', 'password', 'req-20b');
select is(
  pg_temp.try_as('app_authenticated', $$select app.audit('note.archive', 'note', 'n20', '{}'::jsonb)$$),
  '00000',
  'voorbereiding: controle zonder fout'
);
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id = 'req-20b'$$),
  '1',
  'controle: zonder fout blijft de regel staan'
);

-- Laatste-admin-regel (AC-13, AC-15). Eerst al-admin2 degraderen: al-admin is dan de enige telbare admin (al-promote is
-- admin zonder credential-account).
call pg_temp.act('al-admin', 'mfa', 'req-13a');
select is(pg_temp.try_as('app_authenticated', $$select app.assign_role('al-admin2', 'user')$$), '00000', 'voorbereiding: een van twee telbare admins degraderen');
select is(
  pg_temp.query_as('app_definer', $$select (to_jsonb(a) - 'id' - 'at' - 'db_role')::text from app.audit_log a where a.request_id = 'req-13a'$$)::jsonb,
  '{"actor_id": "al-admin", "action": "core.role.assign", "target_type": "account", "target_id": "al-admin2", "request_id": "req-13a", "details": {"role": "user", "previous": "admin"}}'::jsonb,
  'app.assign_role: een degradatie schrijft role en previous (AC-11)'
);
call pg_temp.act('al-promote', 'mfa', 'req-13b');
select is(
  pg_temp.try_as('app_authenticated', $$select app.assign_role('al-admin', 'user')$$),
  'P0001|LAST_ADMIN',
  'app.assign_role: de enige telbare admin degraderen faalt met LAST_ADMIN (AC-13)'
);
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id = 'req-13b'$$),
  '0',
  'app.assign_role: een mislukte actie laat geen regel achter (AC-13)'
);
call pg_temp.act('al-promote', 'mfa', 'req-15');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-admin', true)$$), 'P0001|LAST_ADMIN', 'app.set_account_blocked: de enige telbare admin blokkeren faalt met LAST_ADMIN (AC-15)');
call pg_temp.act('al-admin', 'mfa', 'req-15');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-admin', true)$$), 'P0001|OWN_ACCOUNT', 'app.set_account_blocked: jezelf blokkeren faalt met OWN_ACCOUNT (AC-15)');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-invited', true)$$), 'P0001|ACCOUNT_INVITED', 'app.set_account_blocked: een uitgenodigd account blokkeren faalt met ACCOUNT_INVITED (AC-15)');
select is(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-bestaat-niet', true)$$), 'P0001|NOT_FOUND', 'app.set_account_blocked: een onbekend account blokkeren faalt met NOT_FOUND (AC-15)');
call pg_temp.act('al-user', 'password', 'req-15');
select is(left(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-victim', true)$$), 5), '42501', 'app.set_account_blocked: een user krijgt 42501 (AC-15)');
call pg_temp.act('al-admin', 'password', 'req-15');
select is(left(pg_temp.try_as('app_authenticated', $$select app.set_account_blocked('al-victim', true)$$), 5), '42501', 'app.set_account_blocked: een admin zonder MFA krijgt 42501 (AC-15)');
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id = 'req-15'$$),
  '0',
  'app.set_account_blocked: een mislukte blokkade laat geen regel achter (AC-15)'
);


-- jobs/AC-6 (spec achtergrondtaken, deel A): audit_log_definer_delete. Regels met een eigen tijdstip zet de eigenaar erin;
-- app_definer mag de kolom at niet invoegen. app_migrator valt als lid van app_definer onder dezelfde policy (FORCE RLS).
select lives_ok(
  $$insert into app.audit_log (at, action, request_id) values
      (pg_catalog.now() - interval '2 years', 'ret.old', 'ret-old'),
      (pg_catalog.now() - interval '364 days', 'ret.nearly', 'ret-364'),
      (pg_catalog.now(), 'ret.new', 'ret-new')$$,
  'voorbereiding: een regel van 2 jaar, een van 364 dagen en een van vandaag'
);
select is(
  pg_temp.query_as('app_migrator', $$with d as (delete from app.audit_log where request_id = 'ret-new' returning 1) select count(*)::text from d$$),
  '0',
  'audit_log_definer_delete: als app_migrator (lid van app_definer, onder FORCE RLS) raakt delete van een regel van vandaag 0 rijen'
);
select is(
  pg_temp.query_as('app_definer', $$with d as (delete from app.audit_log where request_id = 'ret-new' returning 1) select count(*)::text from d$$),
  '0',
  'audit_log_definer_delete: als app_definer raakt delete van een regel van vandaag 0 rijen'
);
select is(
  pg_temp.query_as('app_definer', $$with d as (delete from app.audit_log where request_id = 'ret-364' returning 1) select count(*)::text from d$$),
  '0',
  'audit_log_definer_delete: als app_definer blijft een regel van 364 dagen oud staan'
);
select is(
  pg_temp.query_as('app_definer', $$with d as (delete from app.audit_log where request_id = 'ret-old' returning 1) select count(*)::text from d$$),
  '1',
  'audit_log_definer_delete: als app_definer verwijdert delete een regel met at ouder dan 1 jaar'
);
select is(
  pg_temp.query_as('app_definer', $$select count(*)::text from app.audit_log where request_id like 'ret-%'$$),
  '2',
  'audit_log_definer_delete: na de deletes staan alleen de regel van 364 dagen en die van vandaag nog in de tabel'
);

-- jobs/AC-7: audit_log_delete_expired_only. Wie RLS omzeilt (de eigenaar na no force) komt tegen de rij-trigger aan. Alles
-- binnen deze teruggedraaide transactie.
select lives_ok($$alter table app.audit_log no force row level security$$, 'voorbereiding: FORCE RLS uit als eigenaar, alleen in deze transactie');
select is(
  pg_temp.try_as('app_migrator', $$delete from app.audit_log where request_id = 'ret-new'$$) ~ '^42501\|',
  true,
  'audit_log_delete_expired_only: zonder FORCE weigert de rij-trigger het verwijderen van een regel van vandaag met 42501'
);
select is(
  pg_temp.try_as('app_migrator', $$delete from app.audit_log where request_id = 'ret-364'$$) ~ '^42501\|',
  true,
  'audit_log_delete_expired_only: ook een regel van 364 dagen (binnen de termijn) wordt geweigerd'
);
select lives_ok(
  $$insert into app.audit_log (at, action, request_id) values (pg_catalog.now() - interval '366 days', 'ret.expired', 'ret-366')$$,
  'voorbereiding: een regel van 366 dagen'
);
select is(
  pg_temp.query_as('app_migrator', $$with d as (delete from app.audit_log where request_id = 'ret-366' returning 1) select count(*)::text from d$$),
  '1',
  'audit_log_delete_expired_only: een regel van 366 dagen mag wel weg (zonder FORCE, via de trigger)'
);
select results_eq(
  $$select p.stmt, pg_temp.try_as('app_migrator', p.stmt)
    from (values ($s$update app.audit_log set action = 'a.b'$s$), ($s$truncate app.audit_log$s$)) p (stmt) order by 1$$,
  $$values ('truncate app.audit_log', '42501|audit log is append-only'),
           ('update app.audit_log set action = ''a.b''', '42501|audit log is append-only')$$,
  'audit_log_delete_expired_only: update en truncate blijven ook zonder FORCE geweigerd voor de eigenaar (42501)'
);
select is(
  pg_temp.query_as('app_migrator', $$select count(*)::text from app.audit_log where request_id in ('ret-364', 'ret-new')$$),
  '2',
  'audit_log_delete_expired_only: de geweigerde regels staan er nog'
);

select * from finish();
rollback;
