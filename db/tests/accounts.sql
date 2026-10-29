-- app.accounts (spec accountbeheer): alleen een admin met MFA ziet accounts; status uit het credential-account; app_definer
-- leest uit better_auth alleen de kolommen van de allowlist. Alles in één transactie die terugdraait.
begin;
set search_path = tap, public;
select plan(9);

insert into better_auth."user" (id, name, email, "emailVerified") values
  ('a-admin', 'Admin', 'a-admin@test.local', true),
  ('a-actief', 'Actief', 'a-actief@test.local', true),
  ('a-uitgenodigd', 'Uitgenodigd', 'a-uitgenodigd@test.local', false);
insert into better_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values
  ('acc-1', 'a-actief', 'credential', 'a-actief', 'hash', now(), now()),
  ('acc-2', 'a-admin', 'credential', 'a-admin', 'hash', now(), now());
-- Als app_migrator zonder actor (zoals de seed); perform, zodat er geen losse resultaatregels in de TAP-uitvoer komen.
do $$ begin
  perform app.assign_role('a-admin', 'admin');
  perform app.assign_role('a-actief', 'user');
  perform app.assign_role('a-uitgenodigd', 'user');
end $$;

set local role app_authenticated;
do $$ begin perform set_config('app.user_id', 'a-admin', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select results_eq(
  $$select id, name, email, role, status from app.accounts where id like 'a-%' order by id$$,
  $$values ('a-actief', 'Actief', 'a-actief@test.local', 'user', 'active'),
           ('a-admin', 'Admin', 'a-admin@test.local', 'admin', 'active'),
           ('a-uitgenodigd', 'Uitgenodigd', 'a-uitgenodigd@test.local', 'user', 'invited')$$,
  'een admin met MFA ziet alle accounts met rol en status (actief = wachtwoord ingesteld)'
);
select ok((select bool_and(created_at is not null) from app.accounts), 'aangemaakt komt uit better_auth');

do $$ begin perform set_config('app.user_id', 'a-admin', true); perform set_config('app.session_strength', 'password', true); end $$;
select is((select count(*)::integer from app.accounts), 0, 'een admin zonder MFA ziet geen accounts');

do $$ begin perform set_config('app.user_id', 'a-actief', true); perform set_config('app.session_strength', 'mfa', true); end $$;
select is((select count(*)::integer from app.accounts), 0, 'een user ziet geen accounts, ook met MFA');
select throws_ok($$select id from better_auth."user"$$, '42501', null, 'app_authenticated leest better_auth niet direct');
reset role;
select is(
  has_table_privilege('app_authenticated', 'app.accounts', 'insert, update, delete'),
  false,
  'app.accounts is alleen-lezen voor de API (alleen select)'
);

select is(has_column_privilege('app_definer', 'better_auth.account', 'password', 'select'), false, 'app_definer leest geen wachtwoord-hash');
select is(has_table_privilege('app_definer', 'better_auth.session', 'select'), false, 'app_definer leest geen sessies');
select is(has_table_privilege('app_definer', 'better_auth."twoFactor"', 'select'), false, 'app_definer leest geen TOTP-geheimen');

select * from finish();
rollback;
