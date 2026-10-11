-- rate_limits (spec rate-limit): de policy op naam, de grants, en app.consume_rate_limit (actor, telling per gebruiker,
-- grens exact, venster, restduur, ongeldige parameters). Alles in één transactie die terugdraait; pg_catalog.now() staat
-- daarin stil, dus het venster laten we verlopen door window_start als app_migrator (lid van app_definer) te verschuiven.
begin;
set search_path = tap, public;
select plan(22);

select is(
  (select relpersistence::text from pg_catalog.pg_class where oid = 'app.rate_limits'::regclass),
  'u',
  'app.rate_limits is unlogged (OV-3)'
);
select is(
  array(
    select privilege from (values ('select'), ('insert'), ('update'), ('delete')) p (privilege)
    where pg_catalog.has_table_privilege('app_authenticated', 'app.rate_limits', privilege)
  ),
  '{}'::text[],
  'app_authenticated heeft geen rechten op app.rate_limits'
);
select is(
  pg_catalog.has_function_privilege('app_authenticated', 'app.consume_rate_limit(text, integer, integer)', 'execute'),
  true,
  'app_authenticated mag app.consume_rate_limit uitvoeren'
);

set local role app_authenticated;

-- Zonder actor (buiten withUser): geweigerd.
do $$ begin perform set_config('app.user_id', '', true); perform set_config('app.session_strength', 'none', true); end $$;
select throws_ok($$select app.consume_rate_limit('t', 60, 2)$$, '42501', null, 'zonder actor: 42501');

do $$ begin perform set_config('app.user_id', 'u-een', true); perform set_config('app.session_strength', 'password', true); end $$;
select throws_ok($$select key from app.rate_limits$$, '42501', null, 'app_authenticated leest app.rate_limits niet direct');
select throws_ok(
  $$insert into app.rate_limits (key, window_start, hits) values ('t:u-een', pg_catalog.now(), 1)$$,
  '42501', null, 'app_authenticated schrijft app.rate_limits niet direct'
);

-- Grens exact: max (2) toegestaan, max + 1 niet; de restduur is het hele venster (now() staat stil in de transactie).
select is(app.consume_rate_limit('t', 60, 2), 0, 'rate_limits_definer_all: de functie schrijft de teller van de actor (1e verzoek)');
select is(app.consume_rate_limit('t', 60, 2), 0, 'het maximum zelf is toegestaan');
select is(app.consume_rate_limit('t', 60, 2), 60, 'max + 1: geweigerd, met de seconden tot het venster afloopt');

-- Per gebruiker en per bucket een eigen teller.
do $$ begin perform set_config('app.user_id', 'u-twee', true); end $$;
select is(app.consume_rate_limit('t', 60, 2), 0, 'een andere gebruiker heeft een eigen teller');
do $$ begin perform set_config('app.user_id', 'u-een', true); end $$;
select is(app.consume_rate_limit('ander', 60, 2), 0, 'een andere bucket van dezelfde gebruiker heeft een eigen teller');

-- Ongeldige parameters.
select throws_ok($$select app.consume_rate_limit('t', 0, 2)$$, '22023', null, 'venster 0: 22023');
select throws_ok($$select app.consume_rate_limit('t', -1, 2)$$, '22023', null, 'negatief venster: 22023');
select throws_ok($$select app.consume_rate_limit('t', 60, 0)$$, '22023', null, 'maximum 0: 22023');
select throws_ok($$select app.consume_rate_limit('t', 60, -5)$$, '22023', null, 'negatief maximum: 22023');
select throws_ok($$select app.consume_rate_limit('a:b', 60, 2)$$, '22023', null, 'een bucket met : is ongeldig (de sleutel is bucket:actor)');

reset role;
select results_eq(
  $$select key, hits from app.rate_limits where key like '%:u-%' order by key$$,
  $$values ('ander:u-een', 1), ('t:u-een', 3), ('t:u-twee', 1)$$,
  'rate_limits_definer_all: app_definer ziet de tellers; de sleutel is bucket:actor'
);

-- Bijna verlopen: nog geweigerd, de restduur (0,5 s) wordt naar boven afgerond op 1.
update app.rate_limits set window_start = pg_catalog.now() - interval '59.5 seconds' where key = 't:u-een';
set local role app_authenticated;
select is(app.consume_rate_limit('t', 60, 2), 1, 'restduur naar boven afgerond en minstens 1');
reset role;

-- Verlopen: het venster begint opnieuw en de telling op 1.
update app.rate_limits set window_start = pg_catalog.now() - interval '60 seconds' where key = 't:u-een';
set local role app_authenticated;
select is(app.consume_rate_limit('t', 60, 2), 0, 'na het venster is een verzoek weer toegestaan');
reset role;
select results_eq(
  $$select hits, window_start = pg_catalog.now() from app.rate_limits where key = 't:u-een'$$,
  $$values (1, true)$$,
  'na het venster begint de telling op 1 met een nieuw venster'
);
select throws_ok(
  $$update app.rate_limits set hits = 0 where key = 't:u-een'$$,
  '23514', null, 'hits is altijd groter dan 0'
);
select is(
  (select count(*)::integer from pg_catalog.pg_policies where schemaname = 'app' and tablename = 'rate_limits'),
  1,
  'app.rate_limits heeft alleen de policy rate_limits_definer_all'
);

select * from finish();
rollback;
