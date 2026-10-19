import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { secdefFouten, secdefRegels, viewRegels } from '../../scripts/kit/check-secdef.mjs';

// check:secdef (AGENTS.md, framework §6): per overtreding een fixture in fixtures/secdef die faalt, plus een goede die groen is;
// de echte migraties zijn groen, en zonder hun `owner to app_definer` faalt de check (hij ziet de functies dus echt).
const FIXTURES = 'test/rails/fixtures/secdef';

function fixture(naam: string): string[] {
  return secdefRegels([{ naam, sql: readFileSync(path.join(FIXTURES, naam), 'utf8') }]);
}

test('goed: search_path leeg, namen met schema, eigenaar app_definer (ook een SQL-standaard-body)', () => {
  expect(fixture('goed.sql')).toStrictEqual([]);
});

test.each([
  [
    'geen-search-path.sql',
    ["db/migrations/geen-search-path.sql:2: app.is_owner is security definer zonder `set search_path = ''`"],
  ],
  [
    'verkeerde-search-path.sql',
    [
      "db/migrations/verkeerde-search-path.sql:2: app.a is security definer met search_path public; gebruik `set search_path = ''`",
      "db/migrations/verkeerde-search-path.sql:5: app.b is security definer met search_path pg_catalog, public; gebruik `set search_path = ''`",
      "db/migrations/verkeerde-search-path.sql:8: app.c is security definer met search_path from current; gebruik `set search_path = ''`",
      "db/migrations/verkeerde-search-path.sql:12: app.d is security definer zonder `set search_path = ''`",
    ],
  ],
  [
    'ongekwalificeerde-naam.sql',
    ['db/migrations/ongekwalificeerde-naam.sql:2: is_owner heeft geen schema; schrijf <schema>.is_owner'],
  ],
  [
    'ongekwalificeerde-tabel.sql',
    [
      'db/migrations/ongekwalificeerde-tabel.sql:2: app.is_admin noemt user_roles zonder schema; schrijf <schema>.user_roles (bijv. public.user_roles)',
      'db/migrations/ongekwalificeerde-tabel.sql:7: app.set_role noemt user_roles zonder schema; schrijf <schema>.user_roles (bijv. public.user_roles)',
      'db/migrations/ongekwalificeerde-tabel.sql:7: app.set_role noemt "Roles" zonder schema; schrijf <schema>."Roles" (bijv. public.user_roles)',
    ],
  ],
  [
    'ongekwalificeerde-functie.sql',
    [
      'db/migrations/ongekwalificeerde-functie.sql:2: app.is_admin roept current_user_id() aan zonder schema; schrijf <schema>.current_user_id() (bijv. app.current_user_id() of pg_catalog.now())',
      'db/migrations/ongekwalificeerde-functie.sql:2: app.is_admin roept now() aan zonder schema; schrijf <schema>.now() (bijv. app.current_user_id() of pg_catalog.now())',
      'db/migrations/ongekwalificeerde-functie.sql:6: app.oud roept now() aan zonder schema; schrijf <schema>.now() (bijv. app.current_user_id() of pg_catalog.now())',
    ],
  ],
  [
    'geen-eigenaar.sql',
    [
      'db/migrations/geen-eigenaar.sql:2: app.is_owner is security definer zonder eigenaar app_definer; zet `alter function app.is_owner(…) owner to app_definer` in dezelfde migratie',
    ],
  ],
  [
    'verkeerde-eigenaar.sql',
    [
      'db/migrations/verkeerde-eigenaar.sql:2: app.is_owner is security definer met eigenaar app_migrator; de eigenaar is app_definer',
    ],
  ],
  [
    'overload.sql',
    [
      'db/migrations/overload.sql:6: app.is_owner heeft een overload: (integer, boolean) naast (text); een security definer-functie mag geen overload hebben',
    ],
  ],
  [
    'do-blok.sql',
    [
      'db/migrations/do-blok.sql:3: security definer buiten een create function of procedure die de check leest (bijv. in een do-blok of dynamische SQL); schrijf een eigen create function',
      'db/migrations/do-blok.sql:10: security definer buiten een create function of procedure die de check leest (bijv. in een do-blok of dynamische SQL); schrijf een eigen create function',
    ],
  ],
])('%s faalt', (naam, fouten) => {
  expect(fixture(naam)).toStrictEqual(fouten);
});

test('elke fixture behalve goed.sql faalt (een nieuwe fixture zonder test valt op)', () => {
  const bestanden = readdirSync(FIXTURES).filter((naam) => naam.endsWith('.sql'));

  expect(bestanden.filter((naam) => (naam === 'goed.sql') === fixture(naam).length > 0)).toStrictEqual([]);
});

const CREATE = `create function app.f() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select true $$;
alter function app.f() owner to app_definer;
`;

test('create or replace in een latere migratie houdt de eigenaar; een latere andere eigenaar faalt', () => {
  const replace =
    "create or replace function app.f() returns boolean\n  language sql security definer set search_path = ''\n  as $$ select false $$;\n";

  expect(
    secdefRegels([
      { naam: '1.sql', sql: CREATE },
      { naam: '2.sql', sql: replace },
    ]),
  ).toStrictEqual([]);
  expect(
    secdefRegels([
      { naam: '1.sql', sql: CREATE },
      { naam: '2.sql', sql: 'alter function app.f() owner to app_migrator;\n' },
    ]),
  ).toStrictEqual([
    'db/migrations/2.sql:1: app.f is security definer met eigenaar app_migrator; de eigenaar is app_definer',
  ]);
});

test('security definer zetten via alter function faalt', () => {
  expect(
    secdefRegels([
      { naam: '1.sql', sql: CREATE },
      { naam: '2.sql', sql: 'alter function app.f() security definer;\n' },
    ]),
  ).toStrictEqual([
    'db/migrations/2.sql:1: app.f wordt security definer via alter; zet het in create function, met de search_path',
  ]);
});

test('een overload van een security definer-functie faalt, in beide volgordes en over migraties heen; na een drop niet', () => {
  const plain = 'create function app.f(p text) returns boolean language sql return true;\n';
  const plainInt = 'create function app.f(p integer) returns boolean language sql return true;\n';
  const secdef = `create or replace function app.f(p text) returns boolean
  language sql security definer set search_path = ''
  as $$ select true $$;
alter function app.f(text) owner to app_definer;
`;
  const fout =
    'db/migrations/2.sql:1: app.f heeft een overload: (integer) naast (text); een security definer-functie mag geen overload hebben';

  expect(
    secdefRegels([
      { naam: '1.sql', sql: CREATE.replace('app.f()', 'app.f(p text)') },
      { naam: '2.sql', sql: plainInt },
    ]),
  ).toStrictEqual([fout]);
  expect(
    secdefRegels([
      { naam: '1.sql', sql: plain + plainInt },
      { naam: '2.sql', sql: secdef },
    ]),
  ).toStrictEqual([
    'db/migrations/2.sql:1: app.f heeft een overload: (text) naast (integer); een security definer-functie mag geen overload hebben',
  ]);
  const drop = 'drop function app.f(integer);\n';
  expect(
    secdefRegels([
      { naam: '1.sql', sql: plain + plainInt + drop },
      { naam: '2.sql', sql: secdef },
    ]),
  ).toStrictEqual([]);
});

test('de migraties in db/migrations zijn groen, en zonder `owner to app_definer` niet', () => {
  expect(secdefFouten()).toStrictEqual([]);

  const dir = 'db/migrations';
  const zonderEigenaar = readdirSync(dir)
    .filter((naam) => naam.endsWith('.sql'))
    .sort()
    .map((naam) => ({
      naam,
      sql: readFileSync(path.join(dir, naam), 'utf8').replace(/^alter function .* owner to app_definer;$/gm, ''),
    }));

  expect(secdefRegels(zonderEigenaar).map((fout) => fout.split(' is ')[0])).toStrictEqual([
    'db/migrations/20261009194039_user_roles.sql:18: app.is_mfa_admin',
    'db/migrations/20261009194039_user_roles.sql:26: app.assign_role',
    'db/migrations/20261009194039_user_roles.sql:41: app.user_roles_keep_one_admin',
    'db/migrations/20261009195546_assign_role_actor.sql:4: app.assign_role',
    'db/migrations/20261011120000_rate_limits.sql:24: app.consume_rate_limit',
    'db/migrations/20261012200000_account_blocking.sql:18: app.user_roles_keep_one_admin',
    'db/migrations/20261012200000_account_blocking.sql:40: app.set_account_blocked',
    'db/migrations/20261013100000_audit_log.sql:68: app.audit',
    'db/migrations/20261013100000_audit_log.sql:88: app.audit_account_action',
    'db/migrations/20261013100000_audit_log.sql:111: app.assign_role',
    'db/migrations/20261013100000_audit_log.sql:139: app.set_account_blocked',
    'db/migrations/20261019070000_account_audit_idempotency.sql:3: app.set_account_blocked',
  ]);
});

// Views (roadmap stuk 4): een view zonder security_invoker leest met de rechten van zijn eigenaar, net als een definer-functie.
const VIEW_FIXTURES = 'test/rails/fixtures/secdef-views';

function viewFixture(naam: string): string[] {
  return viewRegels([{ naam, sql: readFileSync(path.join(VIEW_FIXTURES, naam), 'utf8') }]);
}

test('elke view-fixture behalve view-goed.sql faalt (een nieuwe fixture zonder test valt op)', () => {
  const bestanden = readdirSync(VIEW_FIXTURES).filter((naam) => naam.endsWith('.sql'));
  expect(bestanden.filter((naam) => (naam === 'view-goed.sql') === viewFixture(naam).length > 0)).toStrictEqual([]);
});

test('view goed: definer-view met barrier, actor-filter, namen met schema en eigenaar; invoker-view hoeft niets', () => {
  expect(viewFixture('view-goed.sql')).toStrictEqual([]);
});

test.each([
  [
    'view-zonder-barrier.sql',
    [
      'db/migrations/view-zonder-barrier.sql:1: app.v leest met de rechten van zijn eigenaar zonder `security_barrier`; schrijf `with (security_barrier)`',
    ],
  ],
  [
    'view-zonder-filter.sql',
    [
      'db/migrations/view-zonder-filter.sql:1: app.v filtert niet op de actor: de where roept geen functie uit schema app aan (bijv. `(select app.is_mfa_admin())`)',
    ],
  ],
  [
    'view-ongekwalificeerd.sql',
    [
      'db/migrations/view-ongekwalificeerd.sql:1: v heeft geen schema; schrijf <schema>.v',
      'db/migrations/view-ongekwalificeerd.sql:1: v noemt user_roles zonder schema; schrijf <schema>.user_roles (bijv. public.user_roles)',
    ],
  ],
  [
    'view-zonder-eigenaar.sql',
    [
      'db/migrations/view-zonder-eigenaar.sql:1: app.v leest met de rechten van zijn eigenaar, maar die is niet app_definer; zet `alter view app.v owner to app_definer` in dezelfde migratie',
    ],
  ],
  [
    'view-materialized.sql',
    [
      'db/migrations/view-materialized.sql:1: app.v is een materialized view: geen RLS en geen actor; gebruik een gewone view of tabel',
    ],
  ],
  [
    'view-invoker-uit.sql',
    [
      'db/migrations/view-invoker-uit.sql:3: app.v wijzigt view-opties via alter; doe het met create or replace view (security_invoker aan, of een definer-view met barrier, actorfilter en eigenaar app_definer)',
      'db/migrations/view-invoker-uit.sql:4: app.v wijzigt view-opties via alter; doe het met create or replace view (security_invoker aan, of een definer-view met barrier, actorfilter en eigenaar app_definer)',
    ],
  ],
  [
    'view-alter-opties.sql',
    [
      'db/migrations/view-alter-opties.sql:4: app.v wijzigt view-opties via alter; doe het met create or replace view (security_invoker aan, of een definer-view met barrier, actorfilter en eigenaar app_definer)',
      'db/migrations/view-alter-opties.sql:5: app.v wijzigt view-opties via alter; doe het met create or replace view (security_invoker aan, of een definer-view met barrier, actorfilter en eigenaar app_definer)',
    ],
  ],
  [
    'view-opties-quotes.sql',
    [
      'db/migrations/view-opties-quotes.sql:2: app.a leest met de rechten van zijn eigenaar zonder `security_barrier`; schrijf `with (security_barrier)`',
      'db/migrations/view-opties-quotes.sql:5: app.b leest met de rechten van zijn eigenaar zonder `security_barrier`; schrijf `with (security_barrier)`',
    ],
  ],
  [
    'view-hernoemen.sql',
    [
      'db/migrations/view-hernoemen.sql:4: app.v wordt hernoemd of verplaatst; drop de view en maak hem opnieuw onder de nieuwe naam',
      'db/migrations/view-hernoemen.sql:5: app.v wordt hernoemd of verplaatst; drop de view en maak hem opnieuw onder de nieuwe naam',
    ],
  ],
  [
    'view-onbewaakt.sql',
    [1, 4, 5].map(
      (regel) =>
        `db/migrations/view-onbewaakt.sql:${String(regel)}: maakt of wijzigt een view (of eigenaar en opties) op een plek die de check niet leest (bijv. in een do-blok of dynamische SQL); schrijf het als eigen statement`,
    ),
  ],
  [
    'view-unlogged-materialized.sql',
    [
      'db/migrations/view-unlogged-materialized.sql:1: app.m is een materialized view: geen RLS en geen actor; gebruik een gewone view of tabel',
    ],
  ],
  [
    'view-drop-meerdere.sql',
    [
      'db/migrations/view-drop-meerdere.sql:4: app.w leest met de rechten van zijn eigenaar, maar die is niet app_definer; zet `alter view app.w owner to app_definer` in dezelfde migratie',
    ],
  ],
  [
    'view-optie-in-string.sql',
    [
      'db/migrations/view-optie-in-string.sql:2: app.v leest met de rechten van zijn eigenaar zonder `security_barrier`; schrijf `with (security_barrier)`',
      'db/migrations/view-optie-in-string.sql:2: app.v filtert niet op de actor: de where roept geen functie uit schema app aan (bijv. `(select app.is_mfa_admin())`)',
      'db/migrations/view-optie-in-string.sql:2: app.v leest met de rechten van zijn eigenaar, maar die is niet app_definer; zet `alter view app.v owner to app_definer` in dezelfde migratie',
    ],
  ],
  [
    'view-union.sql',
    [
      'db/migrations/view-union.sql:1: app.v combineert selects (union, except of intersect): de check ziet niet of elke tak een actorfilter heeft; splits de view of gebruik security_invoker',
    ],
  ],
])('view fout: %s', (naam, verwacht) => {
  expect(viewFixture(naam)).toStrictEqual(verwacht);
});

test('app.accounts in de echte migraties is groen, en zonder `owner to app_definer` niet', () => {
  const dir = 'db/migrations';
  const migraties = readdirSync(dir)
    .filter((naam) => naam.endsWith('.sql'))
    .sort()
    .map((naam) => ({ naam, sql: readFileSync(path.join(dir, naam), 'utf8') }));
  expect(viewRegels(migraties)).toStrictEqual([]);
  const zonderEigenaar = migraties.map(({ naam, sql }) => ({
    naam,
    sql: sql.replace(/^alter view .* owner to app_definer;$/gm, ''),
  }));
  expect(viewRegels(zonderEigenaar).map((fout) => fout.split(' leest ')[0])).toStrictEqual([
    'db/migrations/20261009214212_accounts_view.sql:12: app.accounts',
    'db/migrations/20261012200000_account_blocking.sql:90: app.accounts',
  ]);
});
