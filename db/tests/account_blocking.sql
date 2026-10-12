-- app.set_account_blocked en wat eraan hangt (spec accountbeheer-uitbreiding AC-11 t/m AC-14 en AC-24, ADR 0026): de regels van
-- besluit 3 in volgorde, de telbare-admin-definitie van user_roles_keep_one_admin (besluit 4), de status 'blocked' in
-- app.accounts (besluit 5) en de grants (besluit 2). Alles in één transactie die terugdraait.
-- Alles wat de nieuwe kolom of functie raakt staat als tekst in een pgTAP-assert (of in een do-blok met een afgevangen
-- fout), zodat een ontbrekende migratie als falende assert verschijnt en niet als afgebroken script.
begin;
set search_path = tap, public;
select plan(47);

insert into better_auth."user" (id, name, email, "emailVerified") values
  ('b-admin', 'Admin Een', 'b-admin@test.local', true),
  ('b-admin2', 'Admin Twee', 'b-admin2@test.local', true),
  ('b-user', 'Gebruiker', 'b-user@test.local', true),
  ('b-invited', 'Uitgenodigd', 'b-invited@test.local', false),
  ('b-invadmin', 'Uitgenodigde admin', 'b-invadmin@test.local', false);
insert into better_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values
  ('bacc-1', 'b-admin', 'credential', 'b-admin', 'hash', now(), now()),
  ('bacc-2', 'b-admin2', 'credential', 'b-admin2', 'hash', now(), now()),
  ('bacc-3', 'b-user', 'credential', 'b-user', 'hash', now(), now());
do $$ begin
  perform app.assign_role('b-admin', 'admin');
  perform app.assign_role('b-admin2', 'admin');
  perform app.assign_role('b-invadmin', 'admin');
  perform app.assign_role('b-user', 'user');
  perform app.assign_role('b-invited', 'user');
end $$;

-- Grants en catalogus (besluit 2 en 3).
select results_eq(
  $$select count(*)::integer from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'set_account_blocked'$$,
  $$values (1)$$,
  'app.set_account_blocked: bestaat precies één keer (geen overload)'
);
select results_eq(
  $$select p.proowner::regrole::text, p.prosecdef, p.proconfig @> array['search_path=""'], p.prorettype::regtype::text
    from pg_catalog.pg_proc p where p.oid = 'app.set_account_blocked(text, boolean)'::regprocedure$$,
  $$values ('app_definer', true, true, 'void')$$,
  'app.set_account_blocked: security definer, eigenaar app_definer, search_path leeg, returns void'
);
select results_eq(
  $$select r.rolname::text,
           pg_catalog.has_function_privilege(r.rolname, 'app.set_account_blocked(text, boolean)'::regprocedure, 'execute')
    from (values ('app_authenticated'), ('api_user'), ('auth_service')) r (rolname) order by 1$$,
  $$values ('api_user', false), ('app_authenticated', true), ('auth_service', false)$$,
  'app.set_account_blocked: execute alleen voor app_authenticated'
);
select results_eq(
  $$select pg_catalog.has_function_privilege('public', 'app.set_account_blocked(text, boolean)'::regprocedure, 'execute')$$,
  $$values (false)$$,
  'app.set_account_blocked: PUBLIC heeft geen execute'
);
select results_eq(
  $$select pg_catalog.has_column_privilege('app_definer', 'better_auth."user"', 'blocked_at', 'select'),
           pg_catalog.has_column_privilege('app_definer', 'better_auth."user"', 'blocked_at', 'update')$$,
  $$values (true, true)$$,
  'app_definer: select en update op better_auth."user".blocked_at (ADR 0026, besluit 2)'
);
select results_eq(
  $$select pg_catalog.has_column_privilege('app_definer', 'better_auth."user"', 'name', 'update'),
           pg_catalog.has_column_privilege('app_definer', 'better_auth."user"', 'email', 'update'),
           pg_catalog.has_table_privilege('app_definer', 'better_auth.session', 'select, update, delete'),
           pg_catalog.has_table_privilege('app_definer', 'better_auth.account', 'update, delete')$$,
  $$values (false, false, false, false)$$,
  'app_definer: schrijft alleen blocked_at; geen update op andere kolommen, geen rechten op sessies of accounts'
);
select results_eq(
  $$select pg_catalog.has_column_privilege('app_authenticated', 'better_auth."user"', 'blocked_at', 'select'),
           pg_catalog.has_column_privilege('app_authenticated', 'better_auth."user"', 'blocked_at', 'update')$$,
  $$values (false, false)$$,
  'app_authenticated: leest en schrijft blocked_at nooit direct'
);
select results_eq(
  $$select c.reloptions::text[] @> array['security_barrier=true'], c.relowner::regrole::text
    from pg_catalog.pg_class c where c.oid = 'app.accounts'::regclass$$,
  $$values (true, 'app_definer')$$,
  'app.accounts: blijft security_barrier met eigenaar app_definer'
);

-- Fouten in de volgorde van besluit 3, als admin met MFA.
set local role app_authenticated;
do $$ begin perform set_config('app.user_id', 'b-admin', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select throws_ok($$select app.set_account_blocked('bestaat-niet', true)$$, 'P0001', 'NOT_FOUND', 'app.set_account_blocked: onbekend id bij blokkeren is NOT_FOUND');
select throws_ok($$select app.set_account_blocked('bestaat-niet', false)$$, 'P0001', 'NOT_FOUND', 'app.set_account_blocked: onbekend id bij deblokkeren is NOT_FOUND');
select throws_ok($$select app.set_account_blocked('b-admin', true)$$, 'P0001', 'OWN_ACCOUNT', 'app.set_account_blocked: jezelf blokkeren is OWN_ACCOUNT (AC-14)');
select throws_ok($$select app.set_account_blocked('b-invited', true)$$, 'P0001', 'ACCOUNT_INVITED', 'app.set_account_blocked: een account zonder credential blokkeren is ACCOUNT_INVITED');

-- Blokkeren (AC-11): blocked_at gezet, status blocked in app.accounts.
select lives_ok($$select app.set_account_blocked('b-user', true)$$, 'app.set_account_blocked: een admin met MFA blokkeert een actieve user');
select results_eq(
  $$select id, status from app.accounts where id like 'b-%' order by id$$,
  $$values ('b-admin', 'active'), ('b-admin2', 'active'), ('b-invadmin', 'invited'), ('b-invited', 'invited'), ('b-user', 'blocked')$$,
  'app.accounts: status blocked voor het geblokkeerde account, de andere statussen blijven'
);
reset role;
select results_eq(
  $$select id from better_auth."user" where id like 'b-%' and blocked_at is not null order by id$$,
  $$values ('b-user')$$,
  'app.set_account_blocked: zet blocked_at alleen bij het gekozen account'
);

-- Idempotent: al geblokkeerd laat het eerste tijdstip staan.
do $$ begin
  update better_auth."user" set blocked_at = timestamptz '2020-01-01 00:00:00+00' where id = 'b-user';
exception when undefined_column then null;
end $$;
set local role app_authenticated;
select lives_ok($$select app.set_account_blocked('b-user', true)$$, 'app.set_account_blocked: opnieuw blokkeren is geen fout (idempotent)');
reset role;
select results_eq(
  $$select blocked_at = timestamptz '2020-01-01 00:00:00+00' from better_auth."user" where id = 'b-user'$$,
  $$values (true)$$,
  'app.set_account_blocked: opnieuw blokkeren laat blocked_at op het eerste tijdstip staan'
);

-- Deblokkeren (AC-12), idempotent en zonder verdere controles (besluit 3, stap 3).
set local role app_authenticated;
select lives_ok($$select app.set_account_blocked('b-user', false)$$, 'app.set_account_blocked: een admin met MFA deblokkeert');
select results_eq(
  $$select status from app.accounts where id = 'b-user'$$,
  $$values ('active')$$,
  'app.accounts: na deblokkeren is de status weer active (AC-12)'
);
reset role;
select results_eq(
  $$select blocked_at is null from better_auth."user" where id = 'b-user'$$,
  $$values (true)$$,
  'app.set_account_blocked: deblokkeren zet blocked_at terug op null'
);
set local role app_authenticated;
select lives_ok($$select app.set_account_blocked('b-user', false)$$, 'app.set_account_blocked: deblokkeren van een actief account is geen fout (idempotent)');
select lives_ok($$select app.set_account_blocked('b-invited', false)$$, 'app.set_account_blocked: deblokkeren van een uitgenodigd account of het eigen account kent geen extra controles');
select lives_ok($$select app.set_account_blocked('b-admin', false)$$, 'app.set_account_blocked: deblokkeren van het eigen account is geen OWN_ACCOUNT');

-- app.accounts: blocked gaat vóór active en invited.
reset role;
do $$ begin
  update better_auth."user" set blocked_at = now() where id = 'b-invited';
exception when undefined_column then null;
end $$;
set local role app_authenticated;
select results_eq(
  $$select status from app.accounts where id = 'b-invited'$$,
  $$values ('blocked')$$,
  'app.accounts: blocked_at gezet wint van invited'
);
reset role;
do $$ begin
  update better_auth."user" set blocked_at = null where id = 'b-invited';
exception when undefined_column then null;
end $$;

-- Permissies: alleen een admin met MFA, ook bij een onbekend id (42501 gaat vóór NOT_FOUND).
set local role app_authenticated;
select lives_ok($$select app.set_account_blocked('b-user', true)$$, 'voorbereiding: de admin blokkeert b-user opnieuw');

do $$ begin perform set_config('app.user_id', 'b-user', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select throws_ok($$select app.set_account_blocked('b-admin2', true)$$, '42501', null, 'app.set_account_blocked: een user (ook met MFA) blokkeert niet');
select throws_ok($$select app.set_account_blocked('b-user', false)$$, '42501', null, 'app.set_account_blocked: een user deblokkeert niet');
select throws_ok($$select app.set_account_blocked('bestaat-niet', true)$$, '42501', null, 'app.set_account_blocked: een user krijgt 42501, geen NOT_FOUND (rechten vóór bestaan)');
select is((select count(*)::integer from app.accounts), 0, 'app.accounts: een user ziet ook geblokkeerde accounts niet');

do $$ begin perform set_config('app.user_id', 'b-admin', true); perform set_config('app.session_strength', 'password', true); end $$;
select throws_ok($$select app.set_account_blocked('b-admin2', true)$$, '42501', null, 'app.set_account_blocked: een admin zonder MFA blokkeert niet');
select throws_ok($$select app.set_account_blocked('b-user', false)$$, '42501', null, 'app.set_account_blocked: een admin zonder MFA deblokkeert niet');
select is((select count(*)::integer from app.accounts), 0, 'app.accounts: een admin zonder MFA ziet geen accounts, ook geen geblokkeerde');

do $$ begin perform set_config('app.user_id', '', true); perform set_config('app.session_strength', 'none', true); end $$;
select throws_ok($$select app.set_account_blocked('b-admin2', true)$$, '42501', null, 'app.set_account_blocked: zonder actor 42501');

-- Laatste-admin-regel met de telbare-admin-definitie (AC-13, AC-24).
do $$ begin perform set_config('app.user_id', 'b-admin', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select lives_ok($$select app.set_account_blocked('b-admin2', true)$$, 'app.set_account_blocked: één van twee telbare admins blokkeren mag');

do $$ begin perform set_config('app.user_id', 'b-admin2', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select throws_ok($$select app.set_account_blocked('b-admin', true)$$, 'P0001', 'LAST_ADMIN', 'app.set_account_blocked: de ander blokkeren als één admin al geblokkeerd is: LAST_ADMIN (AC-13)');
reset role;
select results_eq(
  $$select blocked_at is null from better_auth."user" where id = 'b-admin'$$,
  $$values (true)$$,
  'app.set_account_blocked: bij LAST_ADMIN draait de wijziging terug (blocked_at blijft null)'
);
select throws_ok($$select app.assign_role('b-admin', 'user')$$, 'P0001', 'LAST_ADMIN', 'user_roles_keep_one_admin: de ander degraderen als één admin geblokkeerd is: LAST_ADMIN (AC-13)');
select throws_ok($$delete from better_auth."user" where id = 'b-admin'$$, 'P0001', 'LAST_ADMIN', 'user_roles_keep_one_admin: de ander verwijderen (cascade) als één admin geblokkeerd is: LAST_ADMIN');

set local role app_authenticated;
do $$ begin perform set_config('app.user_id', 'b-admin', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select lives_ok($$select app.set_account_blocked('b-admin2', false)$$, 'voorbereiding: b-admin2 gedeblokkeerd');
reset role;
select lives_ok($$select app.assign_role('b-admin', 'user')$$, 'user_roles_keep_one_admin: een gedeblokkeerde admin telt weer mee, dus de ander degraderen mag');

-- Nu is b-admin2 de enige actieve admin naast de uitgenodigde admin b-invadmin (AC-24).
-- De set_config hieronder geldt alleen voor de set_account_blocked-aanroepen na 'set local role app_authenticated'.
-- De assign_role- en delete-asserts draaien na 'reset role' als app_migrator, zonder actorcontrole: die toetsen
-- uitsluitend de trigger. b-admin is hierboven gedegradeerd; b-admin2 is de actor voor de aanroepen daarna.
do $$ begin perform set_config('app.user_id', 'b-admin2', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select throws_ok($$select app.assign_role('b-admin2', 'user')$$, 'P0001', 'LAST_ADMIN', 'user_roles_keep_one_admin: degraderen van de enige actieve admin naast een uitgenodigde admin: LAST_ADMIN (AC-24)');
select throws_ok($$delete from better_auth."user" where id = 'b-admin2'$$, 'P0001', 'LAST_ADMIN', 'user_roles_keep_one_admin: verwijderen van de enige actieve admin naast een uitgenodigde admin: LAST_ADMIN (AC-24)');
set local role app_authenticated;
do $$ begin perform set_config('app.user_id', 'b-invadmin', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select throws_ok($$select app.set_account_blocked('b-admin2', true)$$, 'P0001', 'LAST_ADMIN', 'app.set_account_blocked: blokkeren van de enige actieve admin naast een uitgenodigde admin: LAST_ADMIN (AC-24)');
reset role;
select results_eq(
  $$select count(*)::integer from public.user_roles where role = 'admin'$$,
  $$values (2)$$,
  'user_roles_keep_one_admin: na de geweigerde wijzigingen zijn er nog steeds twee adminrijen (b-admin2 en b-invadmin)'
);

-- Regressie (B2): een upsert admin -> admin verandert niets en mag dus nooit LAST_ADMIN geven, ook niet als er geen
-- telbare admin is (zoals scripts/admin-create.mjs bij een tweede 'pnpm admin:create' voor een uitgenodigde admin).
select lives_ok($$select app.assign_role('b-admin2', 'admin')$$, 'user_roles_keep_one_admin: admin -> admin voor de enige telbare admin mag (geen wijziging)');
update better_auth."user" set blocked_at = now() where id = 'b-admin2';
select lives_ok($$select app.assign_role('b-invadmin', 'admin')$$, 'user_roles_keep_one_admin: admin -> admin voor een uitgenodigde admin mag ook als er geen telbare admin is (B2)');
select results_eq(
  $$select role::text from public.user_roles where user_id = 'b-invadmin'$$,
  $$values ('admin')$$,
  'user_roles_keep_one_admin: na admin -> admin is de rol nog admin'
);
update better_auth."user" set blocked_at = null where id = 'b-admin2';
-- Echte degradatie en verwijderen van de enige telbare admin blijven LAST_ADMIN geven: zie de AC-24-asserts hierboven.

select * from finish();
rollback;
