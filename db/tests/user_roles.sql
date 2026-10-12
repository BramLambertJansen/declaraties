-- user_roles (spec accountbeheer): elke policy op naam, de schrijffunctie, de laatste-admin-regel en de catalogus.
-- Alles in één transactie die terugdraait.
begin;
set search_path = tap, public;
select plan(17);

-- Testgebruikers (better_auth heeft geen RLS; app_migrator is eigenaar).
insert into better_auth."user" (id, name, email, "emailVerified") values
  ('u-user', 'Gebruiker', 'user@test.local', true),
  ('u-admin', 'Admin', 'admin@test.local', true),
  ('u-admin2', 'Admin 2', 'admin2@test.local', true);
-- Telbare admin (ADR 0026, besluit 4): een admin met credential-account en zonder blocked_at.
insert into better_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values
  ('u-acc-admin', 'u-admin', 'credential', 'u-admin', 'hash', now(), now()),
  ('u-acc-admin2', 'u-admin2', 'credential', 'u-admin2', 'hash', now(), now());

select lives_ok($$select app.assign_role('u-user', 'user')$$, 'app_migrator (seed, admin:create) mag een rol toekennen');
select lives_ok($$select app.assign_role('u-admin', 'admin')$$, 'app_migrator mag de eerste admin maken');
select throws_ok($$select app.assign_role('u-user', 'baas')$$, '23514', null, 'alleen de rollen user en admin bestaan');
select throws_ok($$select app.assign_role('onbekend', 'user')$$, '23503', null, 'een rol hoort bij een bestaande gebruiker');

-- Policies als app_authenticated, met de actor zoals withUser hem zet (set_config met is_local = true).
set local role app_authenticated;
do $$ begin perform set_config('app.user_id', 'u-user', true); perform set_config('app.session_strength', 'password', true); end $$;
select results_eq($$select user_id from public.user_roles$$, $$values ('u-user')$$, 'user_roles_select_own: een gebruiker ziet alleen zijn eigen rol');
select throws_ok($$select app.assign_role('u-user', 'admin')$$, '42501', null, 'een gebruiker kan zichzelf geen admin maken');
select throws_ok($$insert into public.user_roles values ('u-admin2', 'admin')$$, '42501', null, 'app_authenticated schrijft nooit direct');
select throws_ok($$delete from public.user_roles$$, '42501', null, 'app_authenticated verwijdert nooit direct');

do $$ begin perform set_config('app.user_id', 'u-admin', true); perform set_config('app.session_strength', 'password', true); end $$;
select results_eq($$select user_id from public.user_roles$$, $$values ('u-admin')$$, 'user_roles_select_admin: een admin zonder MFA ziet alleen zijn eigen rol');
select throws_ok($$select app.assign_role('u-user', 'admin')$$, '42501', null, 'een admin zonder MFA kent geen rollen toe');

do $$ begin perform set_config('app.user_id', 'u-admin', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select results_eq($$select user_id from public.user_roles where user_id like 'u-%' order by 1$$, $$values ('u-admin'), ('u-user')$$, 'user_roles_select_admin: een admin met MFA ziet ook de rollen van anderen');
select lives_ok($$select app.assign_role('u-admin2', 'admin')$$, 'user_roles_definer_all: een admin met MFA kent via app.assign_role rollen toe');

do $$ begin perform set_config('app.user_id', '', true); perform set_config('app.session_strength', 'none', true); end $$;
select is((select count(*)::integer from public.user_roles), 0, 'zonder actor (buiten withUser) geen rijen');
reset role;

-- Laatste-admin-regel (de race staat in test/auth/roles.int.test.ts).
select lives_ok($$select app.assign_role('u-admin2', 'user')$$, 'een van twee admins degraderen mag');
select throws_ok($$select app.assign_role('u-admin', 'user')$$, 'P0001', 'LAST_ADMIN', 'de laatste admin degraderen faalt');
select throws_ok($$delete from better_auth."user" where id = 'u-admin'$$, 'P0001', 'LAST_ADMIN', 'de laatste admin verwijderen faalt (cascade)');

-- Catalogus: alle security definer-functies hebben search_path = '' en eigenaar app_definer (framework §6).
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.prosecdef
     and (p.proowner <> 'app_definer'::regrole or not coalesce(p.proconfig @> array['search_path=""'], false))),
  null,
  'elke security definer-functie in app: eigenaar app_definer en search_path leeg'
);

select * from finish();
rollback;
