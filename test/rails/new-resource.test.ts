import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  bestandsplan,
  controleerNaam,
  fase,
  hunk,
  namen,
  NewResourceError,
  parseRollen,
  pasToe,
  plan,
  routeTree,
} from '../../scripts/kit/new-resource.mjs';

// pnpm new:resource (ADR 0016): naam, fasen, rollen, weigeren zonder te schrijven, gate-wijzigingen die met Edit te zetten
// zijn, de route-tree zonder Vite en het bestandsplan in docs/gouden-pad.md. Dat de uitvoer gate:fast haalt, bewijst
// check:new-resource (OV-7).

// De bestanden die fase 2 leest, in een tijdelijke map: de echte repo blijft onaangeraakt.
const NODIG = [
  '.prettierrc.json',
  'db/ids.json',
  'db/migrations',
  'src/shared/permissions.ts',
  'src/shared/permissions.test.ts',
  'src/shared/contracts/index.ts',
  'src/shared/limits.ts',
  'src/api/app.ts',
  'src/web/copy/ui.ts',
  'src/web/lib/nav.ts',
  'src/web/routes.test.tsx',
];

function kopie(spec: string | null): string {
  const root = mkdtempSync(path.join(tmpdir(), 'new-resource-test-'));
  for (const pad of NODIG) cpSync(pad, path.join(root, pad), { recursive: true });
  mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
  if (spec !== null) writeFileSync(path.join(root, 'docs/specs/invoices.md'), spec);
  return root;
}

const goedgekeurd = '---\nstatus: goedgekeurd\nnamespace: invoices\n---\n\n# invoices\n';

// De regels van de menutest die het nieuwe menu-item noemen.
function menuRegels(tekst: string | undefined): string[] {
  return (tekst ?? '').split('\n').filter((regel) => regel.includes("'invoices'"));
}

function weigert(actie: () => unknown, melding: RegExp): void {
  expect(actie).toThrow(NewResourceError);
  expect(actie).toThrow(melding);
}

describe('naam (OV-5)', () => {
  test('afleidingen zonder verbuiging', () => {
    expect(namen('time-entries')).toStrictEqual({
      naam: 'time-entries',
      Naam: 'TimeEntries',
      naamCamel: 'timeEntries',
      tabel: 'time_entries',
      NAAM: 'TIME_ENTRIES',
    });
  });

  test.each(['Invoices', 'invoice_items', '-invoices', 'invoices-', 'in--voices', '1invoices', 'x'.repeat(41), ''])(
    "'%s' is geen geldige naam",
    (naam) => {
      weigert(() => {
        controleerNaam(naam);
      }, /geen geldige naam/);
    },
  );

  test.each(['api', 'auth', 'dev'])("'%s' is gereserveerd", (naam) => {
    weigert(() => {
      controleerNaam(naam);
    }, /gereserveerd/);
  });
});

describe('fase uit de spec (OV-2)', () => {
  test('zonder spec: het skelet; goedgekeurd: bouwen', () => {
    expect(fase(null, 'invoices')).toBe('skelet');
    expect(fase(goedgekeurd, 'invoices')).toBe('bouw');
  });

  test.each(['voorstel', 'gebouwd', 'vervallen'])('status %s: weigeren', (status) => {
    weigert(() => fase(`---\nstatus: ${status}\n---\n`, 'invoices'), /goedgekeurd/);
  });
});

describe('--rollen (OV-5)', () => {
  test('verplicht, zonder standaard', () => {
    weigert(() => parseRollen(undefined), /verplicht/);
    weigert(() => parseRollen(' '), /verplicht/);
  });

  test('in de volgorde van ROLES', () => {
    expect(parseRollen('admin,user')).toStrictEqual(['user', 'admin']);
    expect(parseRollen('admin')).toStrictEqual(['admin']);
  });

  test('een onbekende of dubbele rol: weigeren', () => {
    weigert(() => parseRollen('user,baas'), /onbekende rol: baas/);
    weigert(() => parseRollen('user,user'), /twee keer/);
  });
});

describe('plan', () => {
  test('fase 1 maakt alleen het spec-skelet, met status voorstel en de afgeleide namen', async () => {
    const root = kopie(null);
    const p = await plan(root, 'invoices');

    expect(p.fase).toBe('skelet');
    expect(p.gates).toStrictEqual([]);
    expect(p.bestanden.map(({ pad }) => pad)).toStrictEqual(['docs/specs/invoices.md']);
    const spec = p.bestanden[0]?.inhoud ?? '';
    expect(spec).toMatch(/^status: voorstel\b/m);
    expect(spec).toContain('| GET | /api/invoices | invoices:read |');
    expect(spec).toContain('invoices_select_own');
    expect(spec).toContain('ziet een admin rijen van anderen?');
    expect(spec).not.toContain('__');
    expect(existsSync(path.join(root, 'docs/specs/invoices.md'))).toBe(false);
  });

  test('fase 1 met --rollen: weigeren', async () => {
    await expect(plan(kopie(null), 'invoices', { rollen: ['user'] })).rejects.toThrow(/fase 2/);
  });

  test('een naam die al bestaat: weigeren en niets schrijven', async () => {
    await expect(plan('.', 'accounts')).rejects.toThrow(/bestaat al, er is niets geschreven/);
  });

  test('fase 2 zonder --rollen: weigeren', async () => {
    await expect(plan(kopie(goedgekeurd), 'invoices')).rejects.toThrow(/--rollen is verplicht/);
  });

  test('fase 2 volgt het bestandsplan, met een migratie na de laatste', async () => {
    const root = kopie(goedgekeurd);
    const p = await plan(root, 'invoices', { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });
    const laatste = readdirSync('db/migrations').sort().at(-1)?.slice(0, 14) ?? '';
    const versie = String(BigInt(laatste) + 1n);
    const verwacht = bestandsplan(namen('invoices'), versie);

    expect(p.fase).toBe('bouw');
    expect(p.bestanden.map(({ pad }) => pad).sort()).toStrictEqual([...verwacht.nieuw, ...verwacht.gewijzigd].sort());
    expect(p.gates.map(({ pad }) => pad)).toStrictEqual(verwacht.gates);
    expect(readdirSync(path.join(root, 'db/migrations'))).toStrictEqual(readdirSync('db/migrations'));
  });

  // Spec achtergrondtaken, jobs/AC-10 (OV-A5): elke nieuwe tabel krijgt een rij in de bewaarcatalogus, anders faalt de
  // invariant "bewaarcatalogus" (db/tests/invarianten.sql). Deze test bewijst de vorm van de rij; dat hij de invariant haalt,
  // bewijst alleen een migratie van een echte resource in pnpm test:db, en de lane-test (lane.test.ts) dat de lane hem doorlaat.
  test('de gegenereerde migratie registreert de tabel in app.retention (jobs/AC-10)', async () => {
    const root = kopie(goedgekeurd);
    const p = await plan(root, 'invoices', { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });
    const migratie = p.bestanden.find(({ pad }) => /^db\/migrations\/\d{14}_invoices\.sql$/.test(pad));
    const sql = migratie?.inhoud ?? '';
    const rij =
      /insert into app\.retention values \(\s*'public\.invoices',\s*null,\s*null,\s*'app',\s*'verdwijnt met het account \(owner_id, on delete cascade\)'\s*\);/;

    expect(migratie).toBeDefined();
    expect(sql).toMatch(rij);
    expect(sql).not.toContain('__');
    // Na het aanmaken van de tabel en vóór de down-sectie.
    expect(sql.search(rij)).toBeGreaterThan(sql.indexOf('create table public.invoices'));
    expect(sql.search(rij)).toBeLessThan(sql.indexOf('-- migrate:down'));
  });

  // De catalogus staat onder FORCE RLS: de migratie zet dat uit voor de insert en weer aan erna (jobs/AC-10).
  test('de gegenereerde migratie zet FORCE RLS op app.retention uit vóór en weer aan ná de insert', async () => {
    const root = kopie(goedgekeurd);
    const p = await plan(root, 'invoices', { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });
    const sql = p.bestanden.find(({ pad }) => /^db\/migrations\/\d{14}_invoices\.sql$/.test(pad))?.inhoud ?? '';
    const uit = sql.indexOf('alter table app.retention no force row level security');
    const rij = sql.indexOf('insert into app.retention');
    const aan = sql.indexOf('alter table app.retention force row level security');

    expect(uit).toBeGreaterThan(-1);
    expect(rij).toBeGreaterThan(uit);
    expect(aan).toBeGreaterThan(rij);
    expect(aan).toBeLessThan(sql.indexOf('-- migrate:down'));
  });

  // ADR 0029 punt 18: permissions.ts en app.ts zijn geen gate meer; het script schrijft ze zelf (bestanden), de tests blijven gate.
  test('permissions.ts en app.ts worden geschreven; alleen de tabeltest en de menutest blijven gate-wijziging', async () => {
    const root = kopie(goedgekeurd);
    const p = await plan(root, 'invoices', { rollen: ['user'] });
    const inhoud = (pad: string) => p.bestanden.find((bestand) => bestand.pad === pad);
    const na = Object.fromEntries(
      p.gates.map((wijziging) => [
        wijziging.pad,
        pasToe(readFileSync(path.join(root, wijziging.pad), 'utf8'), wijziging),
      ]),
    );

    expect(p.gates.map(({ pad }) => pad)).toStrictEqual(['src/shared/permissions.test.ts', 'src/web/routes.test.tsx']);
    expect(inhoud('src/shared/permissions.ts')).toMatchObject({ nieuw: false });
    expect(inhoud('src/shared/permissions.ts')?.inhoud).toContain("'invoices:read': { roles: ['user'] },");
    expect(inhoud('src/shared/permissions.ts')?.inhoud).toContain("'invoices:write': { roles: ['user'] },");
    expect(inhoud('src/api/app.ts')).toMatchObject({ nieuw: false });
    expect(inhoud('src/api/app.ts')?.inhoud).toContain("from './routes/invoices.ts';");
    expect(inhoud('src/api/app.ts')?.inhoud).toMatch(/invoicesDeleteRoute,?\s*\] as const;/);
    expect(na['src/shared/permissions.test.ts']).toContain("'invoices:read': ['user'],");
    // Alleen de verwachting van de user krijgt het menu-item; die van de admin (met Dashboard) blijft gelijk.
    expect(menuRegels(na['src/web/routes.test.tsx'])).toStrictEqual([expect.not.stringContaining("'Dashboard'")]);
  });

  test('het bestandsplan: permissions.ts en app.ts staan onder gewijzigd, niet onder gates', () => {
    const verwacht = bestandsplan(namen('invoices'), '20000101000000');

    expect(verwacht.gewijzigd).toEqual(expect.arrayContaining(['src/shared/permissions.ts', 'src/api/app.ts']));
    expect(verwacht.gates).toStrictEqual(['src/shared/permissions.test.ts', 'src/web/routes.test.tsx']);
  });

  test('de menutest met --rollen admin: alleen de verwachting van de admin', async () => {
    const root = kopie(goedgekeurd);
    const p = await plan(root, 'invoices', { rollen: ['admin'] });
    const wijziging = p.gates.find(({ pad }) => pad === 'src/web/routes.test.tsx');
    if (wijziging === undefined) throw new Error('geen wijziging van de menutest');

    const na = pasToe(readFileSync(path.join(root, wijziging.pad), 'utf8'), wijziging);
    expect(menuRegels(na)).toStrictEqual([expect.stringContaining("'Dashboard'")]);
  });

  test('een onveranderd bestand: gate-wijzigingen ongewijzigd, het plan schrijft niets in de map', async () => {
    const root = kopie(goedgekeurd);
    const voor = readFileSync(path.join(root, 'src/web/lib/nav.ts'), 'utf8');
    await plan(root, 'invoices', { rollen: ['user', 'admin'] });

    expect(readFileSync(path.join(root, 'src/web/lib/nav.ts'), 'utf8')).toBe(voor);
    expect(existsSync(path.join(root, 'src/shared/contracts/invoices.ts'))).toBe(false);
  });
});

describe('hunk', () => {
  test.each([
    ['een regel erbij', 'a\nb\nc\n', 'a\nb\nx\nc\n'],
    ['herhaalde regels', 'x\n};\ny\n};\n', 'x\n};\ny\n  z,\n};\n'],
    ['twee plekken', 'import a;\n\nconst l = [a];\n', 'import a;\nimport b;\n\nconst l = [a, b];\n'],
    ['aan het eind', 'a\n', 'a\nb\n'],
  ])('%s: precies één keer te vinden en terug te zetten', (_, oud, nieuw) => {
    const wijziging = hunk('f.ts', oud, nieuw);

    expect(oud.split(wijziging.zoek)).toHaveLength(2);
    expect(pasToe(oud, wijziging)).toBe(nieuw);
  });
});

test('de route-tree zonder Vite is gelijk aan de gecommitte (zelfde opties als vite.config.ts, OV-6)', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'route-tree-'));
  cpSync('src/web/routes', path.join(root, 'src/web/routes'), { recursive: true });
  await routeTree(root);

  expect(readFileSync(path.join(root, 'src/web/routeTree.gen.ts'), 'utf8')).toBe(
    readFileSync('src/web/routeTree.gen.ts', 'utf8'),
  );
});

test('docs/gouden-pad.md noemt elk bestand uit het bestandsplan (OV-3b)', () => {
  const pad = readFileSync('docs/gouden-pad.md', 'utf8');
  const plan = bestandsplan(namen('<naam>'), '<tijdstempel>');

  expect(pad).toContain('pnpm new:resource');
  expect([...plan.nieuw, ...plan.gewijzigd, ...plan.gates].filter((bestand) => !pad.includes(bestand))).toStrictEqual(
    [],
  );
});
