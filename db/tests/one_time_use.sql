-- one_time_use (ADR 0075, spec inloggat-dichten AC-10, AC-11): RLS, beide policies op naam, de grants per rol en
-- app.claim_one_time_use (eerste claim, tweede claim, verlopen claim, ongeldige invoer). Alles in één transactie die
-- terugdraait; pg_catalog.now() staat daarin stil, dus verlopen laten we de sleutel door expires_at als app_migrator (lid
-- van app_definer) te verschuiven. Dat auth_service de functie echt kan aanroepen, bewijst de integratietest.
begin;
set search_path = tap, public;
select plan(26);

select is(
  (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid = 'app.one_time_use'::regclass),
  true,
  'app.one_time_use: RLS aan en geforceerd'
);
select is(
  (select relpersistence::text from pg_catalog.pg_class where oid = 'app.one_time_use'::regclass),
  'p',
  'app.one_time_use is niet unlogged (een claim overleeft een crash)'
);
select policies_are(
  'app', 'one_time_use',
  array['one_time_use_definer_all', 'one_time_use_definer_delete_expired'],
  'app.one_time_use heeft precies deze policies'
);
select is(
  (select not polpermissive and polcmd = 'd' from pg_catalog.pg_policy
   where polrelid = 'app.one_time_use'::regclass and polname = 'one_time_use_definer_delete_expired'),
  true,
  'one_time_use_definer_delete_expired is restrictief en alleen voor delete'
);

-- Grants per rol (AC-10).
select is(
  array(
    select r.rolname || ':' || p.privilege
    from (values ('app_authenticated'), ('api_user'), ('auth_service')) r (rolname)
    cross join (values ('select'), ('insert'), ('update'), ('delete')) p (privilege)
    where pg_catalog.has_table_privilege(r.rolname, 'app.one_time_use', p.privilege)
    order by 1
  ),
  '{}'::text[],
  'app_authenticated, api_user en auth_service hebben geen recht op de tabel'
);
select is(
  array(
    select p.privilege from (values ('select'), ('insert'), ('update'), ('delete')) p (privilege)
    where pg_catalog.has_table_privilege('app_definer', 'app.one_time_use', p.privilege)
    order by 1
  ),
  array['delete', 'insert', 'select', 'update'],
  'app_definer heeft select, insert, update en delete op de tabel'
);
select is(
  pg_catalog.has_function_privilege('auth_service', 'app.claim_one_time_use(text, integer)', 'execute'),
  true,
  'auth_service mag app.claim_one_time_use uitvoeren'
);
select is(
  pg_catalog.has_function_privilege('app_authenticated', 'app.claim_one_time_use(text, integer)', 'execute'),
  false,
  'app_authenticated mag app.claim_one_time_use niet uitvoeren'
);
select is(
  pg_catalog.has_function_privilege('api_user', 'app.claim_one_time_use(text, integer)', 'execute'),
  false,
  'api_user mag app.claim_one_time_use niet uitvoeren'
);
select is(
  pg_catalog.has_function_privilege('public', 'app.claim_one_time_use(text, integer)', 'execute'),
  false,
  'PUBLIC mag app.claim_one_time_use niet uitvoeren'
);
select is(
  array(
    select p.privilege from (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) p (privilege)
    where pg_catalog.has_table_privilege('public', 'app.one_time_use', p.privilege)
  ),
  '{}'::text[],
  'PUBLIC heeft geen recht op de tabel'
);
select is(
  (select pg_catalog.pg_get_userbyid(proowner)::text from pg_catalog.pg_proc
   where oid = 'app.claim_one_time_use(text, integer)'::regprocedure),
  'app_definer',
  'app_definer is eigenaar van de functie'
);
select is(pg_catalog.has_schema_privilege('auth_service', 'app', 'usage'), true, 'auth_service heeft usage op schema app');

-- Claimen (AC-11): eerst true, dan false; een andere sleutel is los.
select is(app.claim_one_time_use('test:een', 60), true, 'one_time_use_definer_all: de eerste claim is nieuw');
select is(app.claim_one_time_use('test:een', 60), false, 'dezelfde sleutel nog eens: al in gebruik');
select is(app.claim_one_time_use('test:twee', 60), true, 'een andere sleutel is los');

-- Verlopen: de sleutel mag opnieuw, en krijgt een nieuwe vervaltijd.
update app.one_time_use set expires_at = pg_catalog.now() - interval '1 second' where key = 'test:een';
select is(app.claim_one_time_use('test:een', 60), true, 'een verlopen sleutel mag opnieuw geclaimd worden');
select is(
  (select expires_at from app.one_time_use where key = 'test:een'),
  pg_catalog.now() + interval '60 seconds',
  'de nieuwe claim krijgt een nieuwe vervaltijd'
);

-- Opruimen: alleen verlopen rijen (one_time_use_definer_delete_expired).
update app.one_time_use set expires_at = pg_catalog.now() - interval '1 second' where key = 'test:twee';
set local role app_definer;
delete from app.one_time_use where key in ('test:een', 'test:twee');
reset role;
select results_eq(
  $$select key from app.one_time_use where key like 'test:%' order by key$$,
  $$values ('test:een')$$,
  'one_time_use_definer_delete_expired: app_definer verwijdert alleen een verlopen sleutel'
);

-- Ongeldige invoer: 22023.
select throws_ok($$select app.claim_one_time_use('zonderprefix', 60)$$, '22023', null, 'sleutel zonder prefix: 22023');
select throws_ok($$select app.claim_one_time_use('test:' || repeat('x', 200), 60)$$, '22023', null, 'sleutel langer dan 200 tekens: 22023');
select throws_ok($$select app.claim_one_time_use('', 60)$$, '22023', null, 'lege sleutel: 22023');
select throws_ok($$select app.claim_one_time_use(null, 60)$$, '22023', null, 'sleutel null: 22023');
select throws_ok($$select app.claim_one_time_use('test:x', null)$$, '22023', null, 'geldigheid null: 22023');
select throws_ok($$select app.claim_one_time_use('test:x', 0)$$, '22023', null, 'geldigheid 0: 22023');
select throws_ok($$select app.claim_one_time_use('test:x', 3601)$$, '22023', null, 'geldigheid boven 3600: 22023');

select * from finish();
rollback;
