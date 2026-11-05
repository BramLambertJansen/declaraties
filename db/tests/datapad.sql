-- Fase 0, datapad (ADR 0042): FORCE RLS geldt ook voor de eigenaar app_migrator (geen superuser), app_definer ziet
-- rijen alleen via een eigen policy, en api_user heeft zonder withUser() geen enkel recht. Alles in één transactie
-- die terugdraait: de probe-tabel bestaat alleen tijdens de test.
begin;
set search_path = tap, public;
select plan(10);

select is(
  (select rolsuper or rolbypassrls from pg_catalog.pg_roles where rolname = current_user),
  false,
  'app_migrator is geen superuser en heeft geen BYPASSRLS'
);

create table app.datapad_probe (id integer primary key, owner text not null);
alter table app.datapad_probe enable row level security;
alter table app.datapad_probe force row level security;
grant select on app.datapad_probe to app_authenticated, app_definer;

select throws_ok(
  $$insert into app.datapad_probe values (1, 'a')$$,
  '42501', null,
  'FORCE RLS: de eigenaar kan zonder policy niet invoegen'
);

create policy datapad_probe_migrator_insert on app.datapad_probe for insert to app_migrator with check (true);
select lives_ok(
  $$insert into app.datapad_probe values (1, 'a'), (2, 'b')$$,
  'met een insert-policy kan de eigenaar invoegen'
);
select is((select count(*)::integer from app.datapad_probe), 0, 'FORCE RLS: de eigenaar ziet zonder select-policy geen rijen');

-- Het patroon voor datamigraties (framework §6): een security definer-functie van app_definer.
create function app.datapad_probe_count() returns integer
  language sql stable security definer set search_path = ''
  as $$ select count(*)::integer from app.datapad_probe $$;
alter function app.datapad_probe_count() owner to app_definer;

select is(app.datapad_probe_count(), 0, 'app_definer ziet zonder eigen policy geen rijen');
create policy datapad_probe_definer_select on app.datapad_probe for select to app_definer using (owner = 'a');
select is(app.datapad_probe_count(), 1, 'app_definer ziet alleen de rijen van zijn eigen policy');

select is(has_schema_privilege('api_user', 'app', 'usage'), false, 'api_user (NOINHERIT) heeft zonder withUser() geen toegang tot schema app');
select is(has_table_privilege('api_user', 'app.datapad_probe', 'select'), false, 'api_user kan de tabel niet lezen');
select is(has_table_privilege('app_authenticated', 'app.datapad_probe', 'select'), true, 'app_authenticated wel (na SET LOCAL ROLE in withUser)');
select is(
  (select count(*)::integer from information_schema.role_table_grants where grantee in ('api_user', 'PUBLIC') and table_schema in ('app', 'public')),
  0,
  'api_user en PUBLIC hebben geen enkele tabelgrant'
);

select * from finish();
rollback;
