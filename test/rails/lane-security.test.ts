import { describe, expect, test } from 'vitest';
import { migratieOvertreding } from '../../scripts/kit/lane.mjs';

// Zelfstandige fixture: geen generator of implementatiehelper als waarheid voor veilige SQL.
const TABLE = `create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default app.current_user_id() references better_auth."user" (id) on delete cascade,
  created_at timestamptz not null default now(),
  body text not null
);`;
const ISOLATION = `alter table public.notes enable row level security;
alter table public.notes force row level security;
grant select, delete on public.notes to app_authenticated;
grant insert (body), update (body) on public.notes to app_authenticated;
create policy notes_select on public.notes for select to app_authenticated using (owner_id = (select app.current_user_id()));
create policy notes_insert on public.notes for insert to app_authenticated with check (owner_id = (select app.current_user_id()));
create policy notes_update on public.notes for update to app_authenticated using (owner_id = (select app.current_user_id())) with check (owner_id = (select app.current_user_id()));
create policy notes_delete on public.notes for delete to app_authenticated using (owner_id = (select app.current_user_id()));`;
const SAFE = `${TABLE}\n${ISOLATION}`;
const NO_FORCE = 'alter table app.retention no force row level security;';
const ROW = "insert into app.retention values ('public.notes', null, null, 'app', 'verdwijnt met het account');";
const FORCE = 'alter table app.retention force row level security;';

describe('feature-lane: veilige eigenaarisolatie', () => {
  test('een volledige owner-tabel met afzonderlijke kolomgrants wordt toegelaten', () => {
    expect(migratieOvertreding(SAFE)).toBeNull();
  });

  test('een index en extra scalaire velden met letterlijke defaults blijven toegestaan', () => {
    const sql = SAFE.replace(
      'body text not null',
      "body text not null, done boolean default false, count integer default 0, label text default 'a; -- b'",
    );
    expect(
      migratieOvertreding(`${sql}\ncreate index notes_owner_idx on public.notes (owner_id, created_at);`),
    ).toBeNull();
  });

  test.each([
    ['using true', SAFE.replace('using (owner_id = (select app.current_user_id()))', 'using (true)')],
    ['with check true', SAFE.replace('with check (owner_id = (select app.current_user_id()))', 'with check (true)')],
    [
      'een aanvullende permissieve policy',
      `${SAFE}\ncreate policy leak on public.notes for select to app_authenticated using (true);`,
    ],
    ['een policy zonder bekende rol', SAFE.replace('for select to app_authenticated', 'for select')],
    [
      'een policy met extra OR',
      SAFE.replace(
        'using (owner_id = (select app.current_user_id()))',
        'using (owner_id = (select app.current_user_id()) or true)',
      ),
    ],
    ['ontbrekend ENABLE RLS', SAFE.replace('alter table public.notes enable row level security;', '')],
    ['ontbrekend FORCE RLS', SAFE.replace('alter table public.notes force row level security;', '')],
    [
      'ontbrekende policies',
      `${TABLE}\nalter table public.notes enable row level security;\nalter table public.notes force row level security;`,
    ],
    ['ontbrekende grants', SAFE.replace(/grant [^;]+;/g, '')],
    ['tabelbrede insert-grant', `${SAFE}\ngrant insert on public.notes to app_authenticated;`],
    ['owner_id in een kolomgrant', `${SAFE}\ngrant update (owner_id) on public.notes to app_authenticated;`],
    ['rechtstreeks API-grant', `${SAFE}\ngrant select on public.notes to api_user;`],
    ['twee nieuwe tabellen', `${SAFE}\ncreate table public.more (id uuid);`],
    ['twee creates voor dezelfde naam', `${SAFE}\n${TABLE}`],
    [
      'quoted identifiers met hoofdletterbotsing',
      'create table better_auth."twofactor" (id text); alter table better_auth."twoFactor" enable row level security;',
    ],
    ['quoted nieuwe tabel', SAFE.replaceAll('public.notes', 'public."notes"')],
    ['een andere owner-default', SAFE.replace('default app.current_user_id()', "default 'somebody-else'")],
    ['een foreign key naar email', SAFE.replace('"user" (id)', '"user" (email)')],
    ['een uitvoerende kolomdefault', SAFE.replace('body text not null', 'body text default app.side_effect()')],
  ])('%s volgt de zwaardere route', (_name, sql) => {
    expect(migratieOvertreding(sql)).toBeTypeOf('string');
  });
});

describe('feature-lane: geordende retentionregistratie', () => {
  test('NO FORCE, eigen rij, FORCE na de owner-tabel wordt toegelaten', () => {
    expect(migratieOvertreding(`${SAFE}\n${NO_FORCE}\n${ROW}\n${FORCE}`)).toBeNull();
  });

  test.each([
    ['insert zonder NO FORCE', [ROW]],
    ['insert vóór NO FORCE', [ROW, NO_FORCE, FORCE]],
    ['insert na herstel van FORCE', [NO_FORCE, FORCE, ROW]],
    ['FORCE zonder NO FORCE', [FORCE]],
    ['NO FORCE zonder rij', [NO_FORCE, FORCE]],
    ['dubbele NO FORCE', [NO_FORCE, NO_FORCE, ROW, FORCE]],
    ['dubbele registratie', [NO_FORCE, ROW, ROW, FORCE]],
    [
      'tabelnaam als hoofdlettergevoelige tekstwaarde',
      [NO_FORCE, ROW.replace("'public.notes'", "'PUBLIC.NOTES'"), FORCE],
    ],
    ['geen herstel', [NO_FORCE, ROW]],
  ])('%s wordt geweigerd', (_name, parts) => {
    expect(migratieOvertreding(`${SAFE}\n${parts.join('\n')}`)).toBeTypeOf('string');
  });
});
