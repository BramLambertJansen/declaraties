import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { plan } from '../../scripts/kit/new-resource.mjs';

// Het spec-skelet van `pnpm new:resource` (fase 1) volgt de geldende sjabloon docs/specs/_template.md: dezelfde ##-koppen
// in dezelfde volgorde, een sectie "Kopieer de vorm van" met een bestaand gouden voorbeeld, en onder "Open vragen" een
// expliciete `OV-1 ⚠ open`-regel, zodat een bewust onvolledig voorstel niet voor een besluit kan doorgaan.

// Bewuste afwijking: de generator zet "Open vragen" vooraan (de eigenaar beantwoordt ze eerst); het sjabloon zet ze
// achteraan. De volgorde van alle andere koppen is gelijk; "Open vragen" wordt apart gecontroleerd.
const UITZONDERING = 'Open vragen';

function koppen(tekst: string): string[] {
  return [...tekst.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1] ?? '');
}

function zonderUitzondering(lijst: string[]): string[] {
  return lijst.filter((kop) => kop !== UITZONDERING);
}

// De bestanden die plan() leest (zoals in new-resource.test.ts), in een tijdelijke map.
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

async function gegenereerd(): Promise<string> {
  const root = mkdtempSync(path.join(tmpdir(), 'new-resource-spec-vorm-'));
  for (const pad of NODIG) cpSync(pad, path.join(root, pad), { recursive: true });
  mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
  const p = await plan(root, 'invoices');
  return p.bestanden[0]?.inhoud ?? '';
}

function sectie(tekst: string, kop: string): string {
  const start = new RegExp(`^## ${kop}\\s*$`, 'm').exec(tekst);
  if (start === null) return '';
  const rest = tekst.slice(start.index + start[0].length);
  const einde = /^## /m.exec(rest);
  return einde === null ? rest : rest.slice(0, einde.index);
}

const sjabloon = readFileSync('docs/specs/_template.md', 'utf8');

describe('koppen (a)', () => {
  test('"Kopieer de vorm van" staat in de gegenereerde spec', async () => {
    expect(koppen(await gegenereerd())).toContain('Kopieer de vorm van');
  });

  test('dezelfde ##-koppen in dezelfde volgorde als docs/specs/_template.md (zonder "Open vragen")', async () => {
    expect(zonderUitzondering(koppen(await gegenereerd()))).toStrictEqual(zonderUitzondering(koppen(sjabloon)));
  });

  test('"Open vragen" komt precies één keer voor', async () => {
    expect(koppen(await gegenereerd()).filter((kop) => kop === UITZONDERING)).toHaveLength(1);
  });

  test('"Kopieer de vorm van" verwijst naar een bestaand pad in de repo', async () => {
    const paden = [...sectie(await gegenereerd(), 'Kopieer de vorm van').matchAll(/`([^`\n]+)`/g)].map((match) =>
      (match[1] ?? '').replace(/:\d+(-\d+)?$/, ''),
    );
    const bestaand = paden.filter((pad) => pad.includes('/') && existsSync(pad));
    expect(bestaand.length).toBeGreaterThan(0);
  });
});

describe('open vragen (b)', () => {
  test('een OV-1-regel in het formaat van _template.md', async () => {
    const open = sectie(await gegenereerd(), 'Open vragen');
    expect(open).toMatch(/^- \*\*OV-1 ⚠ open\*\* — \S/m);
  });
});

describe('status (c)', () => {
  test('voorstel: niet goedgekeurd of gebouwd', async () => {
    const spec = await gegenereerd();
    expect(spec).toMatch(/^status: voorstel\b/m);
    expect(spec).not.toMatch(/^status: (goedgekeurd|gebouwd)\b/m);
  });

  test('met status goedgekeurd zou check-docs de open vraag afkeuren', async () => {
    const spec = (await gegenereerd()).replace(/^status: voorstel/m, 'status: goedgekeurd');
    const keys = (await overtredingen(spec)).map((overtreding) => overtreding.key);
    expect(keys).toContain('docs:docs/specs/invoices.md:open-vraag');
  });
});

// Een repo met de gegenereerde spec en de paden die ze noemt (gekopieerd uit de echte repo).
async function overtredingen(spec: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'new-resource-spec-vorm-docs-'));
  const bestanden: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    'docs/specs/invoices.md': spec,
  };
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(root, pad)), { recursive: true });
    writeFileSync(path.join(root, pad), inhoud);
  }
  for (const match of sectie(spec, 'Kopieer de vorm van').matchAll(/`([^`\n]+)`/g)) {
    const pad = (match[1] ?? '').replace(/:\d+(-\d+)?$/, '');
    if (pad.includes('/') && existsSync(pad)) {
      mkdirSync(path.dirname(path.join(root, pad)), { recursive: true });
      cpSync(pad, path.join(root, pad));
    }
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return docsViolations(root);
}

describe('check-docs (d)', () => {
  test('geen overtredingen op de gegenereerde spec (koppen, vorm-paden, open vragen)', async () => {
    const eigen = (await overtredingen(await gegenereerd())).filter((overtreding) =>
      overtreding.key.includes('docs/specs/invoices.md'),
    );
    expect(eigen).toStrictEqual([]);
  });
});
