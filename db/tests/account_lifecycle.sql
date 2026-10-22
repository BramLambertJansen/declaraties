begin;
set search_path = tap, public;
select plan(48);

insert into better_auth."user" (id, name, email, "emailVerified") values
  ('lc-admin', 'Beheerder', 'lc-admin@test.local', true),
  ('lc-admin2', 'Tweede beheerder', 'lc-admin2@test.local', true),
  ('lc-user', 'Gebruiker', 'lc-user@test.local', true),
  ('lc-invited', 'Uitgenodigd', 'lc-invited@test.local', false),
  ('lc-invadmin', 'Uitgenodigde beheerder', 'lc-invadmin@test.local', false);
insert into better_auth.account (id, "accountId", "providerId", "userId", password, "updatedAt") values
  ('lc-credential1', 'lc-admin', 'credential', 'lc-admin', 'hash', now()),
  ('lc-credential2', 'lc-admin2', 'credential', 'lc-admin2', 'hash', now()),
  ('lc-credential3', 'lc-user', 'credential', 'lc-user', 'hash', now());
select app.assign_role('lc-admin', 'admin');
select app.assign_role('lc-admin2', 'admin');
select app.assign_role('lc-user', 'user');
select app.assign_role('lc-invited', 'user');
select app.assign_role('lc-invadmin', 'admin');

select results_eq(
  $$select last_login_at is null, deactivated_at is null, session_version from better_auth."user" where id = 'lc-user'$$,
  $$values (true, true, 0)$$,
  'account lifecycle: bestaande en nieuwe accounts beginnen zonder verzonnen login of deactivatie'
);
insert into better_auth.session (id, "expiresAt", token, "updatedAt", "userId")
  values ('lc-session', now() + interval '1 hour', 'lc-token', now(), 'lc-user');
select results_eq(
  $$select session_version from better_auth.session where id = 'lc-session'$$,
  $$values (0)$$,
  'account lifecycle: een sessie begint op versie nul'
);
select results_eq(
  $$select p.proowner::regrole::text, p.prosecdef, p.proconfig @> array['search_path=""'], p.prorettype::regtype::text
    from pg_catalog.pg_proc p where p.oid = 'app.set_account_deactivated(text, boolean)'::regprocedure$$,
  $$values ('app_definer', true, true, 'void')$$,
  'app.set_account_deactivated: security definer met lege search_path en juiste eigenaar'
);
select results_eq(
  $$select pg_catalog.has_function_privilege('app_authenticated', 'app.set_account_deactivated(text, boolean)', 'execute'),
           pg_catalog.has_function_privilege('api_user', 'app.set_account_deactivated(text, boolean)', 'execute'),
           pg_catalog.has_function_privilege('auth_service', 'app.set_account_deactivated(text, boolean)', 'execute'),
           pg_catalog.has_function_privilege('public', 'app.set_account_deactivated(text, boolean)', 'execute')$$,
  $$values (true, false, false, false)$$,
  'app.set_account_deactivated: execute uitsluitend voor app_authenticated'
);
select results_eq(
  $$select pg_catalog.has_column_privilege('app_definer', 'better_auth."user"', 'last_login_at', 'select'),
           pg_catalog.has_column_privilege('app_definer', 'better_auth."user"', 'last_login_at', 'update'),
           pg_catalog.has_column_privilege('app_definer', 'better_auth."user"', 'deactivated_at', 'update'),
           pg_catalog.has_column_privilege('app_definer', 'better_auth."user"', 'session_version', 'update'),
           pg_catalog.has_table_privilege('app_definer', 'better_auth.session', 'select, update, delete')$$,
  $$values (true, false, true, true, false)$$,
  'account lifecycle: minimale kolomrechten zonder login-schrijf- of sessietoegang voor app_definer'
);

update better_auth."user" set last_login_at = timestamptz '2026-10-20 10:00:00+00' where id = 'lc-user';
set local role app_authenticated;
do $$ begin
  perform set_config('app.user_id', 'lc-admin', true);
  perform set_config('app.session_strength', 'mfa', true);
  perform set_config('app.request_id', 'lc-request', true);
end $$;

select throws_ok($$select app.set_account_deactivated('onbekend', true)$$, 'P0001', 'NOT_FOUND', 'deactiveren: onbekend account');
select throws_ok($$select app.set_account_deactivated('onbekend', false)$$, 'P0001', 'NOT_FOUND', 'activeren: onbekend account');
select throws_ok($$select app.set_account_deactivated('lc-admin', true)$$, 'P0001', 'OWN_ACCOUNT', 'deactiveren: eigen account verboden');
select throws_ok($$select app.set_account_deactivated('lc-invited', true)$$, 'P0001', 'ACCOUNT_INVITED', 'deactiveren: uitnodiging blijft uitnodigingsbeheer');
select throws_ok($$select app.set_account_deactivated('lc-invited', false)$$, 'P0001', 'ACCOUNT_INVITED', 'activeren: uitnodiging blijft uitnodigingsbeheer');
select lives_ok($$select app.set_account_deactivated('lc-user', true)$$, 'deactiveren: beheerder met MFA schakelt ander account uit');
select results_eq(
  $$select status, deactivated_at is not null, blocked_at is null, last_login_at
    from app.accounts where id = 'lc-user'$$,
  $$values ('deactivated', true, true, timestamptz '2026-10-20 10:00:00+00')$$,
  'app.accounts: deactivatie zichtbaar en laatste login blijft bewaard'
);
select lives_ok($$select app.set_account_deactivated('lc-user', true)$$, 'deactiveren: herhaling is idempotent');
select results_eq(
  $$select count(*)::integer from app.audit_log where target_id = 'lc-user' and action = 'core.account.deactivate'$$,
  $$values (1)$$,
  'deactiveren: herhaling schrijft geen tweede auditregel'
);
select results_eq(
  $$select actor_id, target_type, request_id from app.audit_log
    where target_id = 'lc-user' and action = 'core.account.deactivate'$$,
  $$values ('lc-admin', 'account', 'lc-request')$$,
  'deactiveren: audit bevat actor, doel en request in dezelfde transactie'
);
reset role;
select results_eq(
  $$select session_version from better_auth."user" where id = 'lc-user'$$,
  $$values (1)$$,
  'deactiveren: versie stijgt precies eenmaal, ook bij herhaling'
);
update better_auth."user" set deactivated_at = timestamptz '2020-01-01 00:00:00+00' where id = 'lc-user';
set local role app_authenticated;
select lives_ok($$select app.set_account_deactivated('lc-user', true)$$, 'deactiveren: nogmaals blijft een no-op');
select results_eq(
  $$select deactivated_at from app.accounts where id = 'lc-user'$$,
  $$values (timestamptz '2020-01-01 00:00:00+00')$$,
  'deactiveren: oorspronkelijk deactivatietijdstip blijft behouden'
);
select lives_ok($$select app.set_account_blocked('lc-user', true)$$, 'blokkeren: kan naast deactivatie');
select results_eq(
  $$select status, deactivated_at is not null, blocked_at is not null from app.accounts where id = 'lc-user'$$,
  $$values ('blocked', true, true)$$,
  'app.accounts: blokkade en deactivatie zijn beide zichtbaar, blokkade heeft statusvoorrang'
);
select lives_ok($$select app.set_account_blocked('lc-user', true)$$, 'blokkeren: herhaling blijft idempotent');
select lives_ok($$select app.set_account_deactivated('lc-user', false)$$, 'activeren: deactivatie afzonderlijk opheffen');
select results_eq(
  $$select status, deactivated_at is null, blocked_at is not null from app.accounts where id = 'lc-user'$$,
  $$values ('blocked', true, true)$$,
  'activeren: blokkade blijft staan'
);
select lives_ok($$select app.set_account_deactivated('lc-user', false)$$, 'activeren: herhaling is idempotent');
select results_eq(
  $$select count(*)::integer from app.audit_log where target_id = 'lc-user' and action = 'core.account.activate'$$,
  $$values (1)$$,
  'activeren: alleen echte wijziging krijgt audit'
);
reset role;
select results_eq(
  $$select session_version from better_auth."user" where id = 'lc-user'$$,
  $$values (2)$$,
  'activeren: de sessieversie blijft na blokkeren en herstel op twee'
);
set local role app_authenticated;
select lives_ok($$select app.set_account_deactivated('lc-user', true)$$, 'deactiveren: opnieuw naast blokkade');
select lives_ok($$select app.set_account_blocked('lc-user', false)$$, 'deblokkeren: blokkade afzonderlijk opheffen');
select results_eq(
  $$select status, deactivated_at is not null, blocked_at is null from app.accounts where id = 'lc-user'$$,
  $$values ('deactivated', true, true)$$,
  'deblokkeren: deactivatie blijft staan'
);
select lives_ok($$select app.set_account_deactivated('lc-user', false)$$, 'activeren: beide maatregelen zijn nu opgeheven');
select results_eq(
  $$select status, last_login_at from app.accounts where id = 'lc-user'$$,
  $$values ('active', timestamptz '2026-10-20 10:00:00+00')$$,
  'herstel: account actief, laatste login behouden'
);
reset role;
select results_eq(
  $$select u.session_version, s.session_version from better_auth."user" u
    join better_auth.session s on s."userId" = u.id where s.id = 'lc-session'$$,
  $$values (3, 0)$$,
  'herstel: oude sessieversie wordt nooit gelijkgetrokken met het herstelde account'
);
set local role app_authenticated;
do $$ begin perform set_config('app.user_id', 'lc-user', true); end $$;
select throws_ok($$select app.set_account_deactivated('lc-admin2', true)$$, '42501', null, 'deactiveren: gewone gebruiker geweigerd');
select throws_ok($$select app.set_account_deactivated('lc-user', false)$$, '42501', null, 'activeren: gewone gebruiker geweigerd');
select throws_ok($$select app.set_account_deactivated('onbekend', true)$$, '42501', null, 'deactiveren: rechten voor bestaan');
select is((select count(*)::integer from app.accounts), 0, 'app.accounts: gewone gebruiker ziet ook nieuwe velden niet');
do $$ begin perform set_config('app.user_id', 'lc-admin', true); perform set_config('app.session_strength', 'password', true); end $$;
select throws_ok($$select app.set_account_deactivated('lc-user', true)$$, '42501', null, 'deactiveren: beheerder zonder MFA geweigerd');
select throws_ok($$select app.set_account_deactivated('lc-user', false)$$, '42501', null, 'activeren: beheerder zonder MFA geweigerd');
do $$ begin perform set_config('app.user_id', '', true); perform set_config('app.session_strength', 'none', true); end $$;
select throws_ok($$select app.set_account_deactivated('lc-user', true)$$, '42501', null, 'deactiveren: zonder actor geweigerd');
do $$ begin perform set_config('app.user_id', 'lc-admin', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select lives_ok($$select app.set_account_deactivated('lc-admin2', true)$$, 'laatste beheerder: tweede beheerder deactiveren toegestaan');
do $$ begin perform set_config('app.user_id', 'lc-invadmin', true); end $$;
select throws_ok($$select app.set_account_deactivated('lc-admin', true)$$, 'P0001', 'LAST_ADMIN', 'deactiveren: gedeactiveerde en uitgenodigde beheerders tellen niet');
select throws_ok($$select app.set_account_blocked('lc-admin', true)$$, 'P0001', 'LAST_ADMIN', 'blokkeren: gedeactiveerde en uitgenodigde beheerders tellen niet');
reset role;
select throws_ok($$select app.assign_role('lc-admin', 'user')$$, 'P0001', 'LAST_ADMIN', 'degraderen: gedeactiveerde beheerder telt niet');
select throws_ok($$delete from better_auth."user" where id = 'lc-admin'$$, 'P0001', 'LAST_ADMIN', 'verwijderen: gedeactiveerde beheerder telt niet');
select results_eq(
  $$select deactivated_at is null, blocked_at is null, session_version from better_auth."user" where id = 'lc-admin'$$,
  $$values (true, true, 0)$$,
  'LAST_ADMIN: maatregel en versieverhoging draaien samen terug'
);
select results_eq(
  $$select count(*)::integer from app.audit_log where target_id = 'lc-admin'
    and action in ('core.account.deactivate', 'core.account.block')$$,
  $$values (0)$$,
  'LAST_ADMIN: geweigerde mutatie laat geen auditregel achter'
);
set local role app_authenticated;
do $$ begin perform set_config('app.user_id', 'lc-admin', true); end $$;
select lives_ok($$select app.set_account_deactivated('lc-admin2', false)$$, 'laatste beheerder: andere beheerder herstellen');
reset role;
select lives_ok($$select app.assign_role('lc-admin', 'user')$$, 'laatste beheerder: herstelde beheerder telt weer mee');

select * from finish();
rollback;
