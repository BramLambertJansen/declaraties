import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { adrOverzicht, componentenTekst, faseOverzicht, nextAdr } from '../../scripts/kit/feiten-tekst.mjs';
import { describe, expect, test } from 'vitest';

// scripts/kit/feiten.mjs en feiten-tekst.mjs: leesbare componenten, ADR-filter met --alle, volgende nummer en de fase-sectie.
const REPO = path.join(import.meta.dirname, '../..');

function feiten(...args: string[]) {
  return spawnSync('node', ['scripts/kit/feiten.mjs', ...args], { cwd: REPO, encoding: 'utf8' });
}

const ADRS = [
  { nummer: '0001', titel: 'Oud', status: 'vervangen door 0039' },
  { nummer: '0039', titel: 'Stack', status: 'geaccepteerd' },
  { nummer: '0039', titel: 'Lintcache', status: 'vervallen' },
  { nummer: '0040', titel: 'Geparkeerd', status: 'voorgesteld' },
  { nummer: '0041', titel: 'Kapot', status: 'onbekend' },
];

describe('componenten', () => {
  test('varianten als prop=a|b, publiek/intern als label, importnaam alleen als die afwijkt', () => {
    expect(
      componentenTekst([
        {
          naam: 'Button',
          bron: 'src/core/web/ui/button.tsx',
          publiek: true,
          varianten: { variant: ['ghost', 'primary'], size: ['icon', 'md'] },
          importnamen: ['Button'],
        },
        { naam: 'Item', bron: 'src/core/web/ui/item.tsx', publiek: false, varianten: {}, importnamen: [] },
        { naam: 'Tab', bron: 'src/core/web/ui/tabs.tsx', publiek: true, varianten: {}, importnamen: ['Tabs', 'Tab'] },
      ]),
    ).toStrictEqual([
      'Button · publiek · src/core/web/ui/button.tsx · variant=ghost|primary · size=icon|md',
      'Item · intern · src/core/web/ui/item.tsx',
      'Tab · publiek · src/core/web/ui/tabs.tsx · import Tabs, Tab',
    ]);
  });

  test('in de echte repo: geen [object Object], geen kale true/false, de catalogus één keer in de sectiekop', () => {
    const r = feiten('componenten');
    const regels = r.stdout.trim().split('\n');

    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('[object Object]');
    expect(regels[0]).toMatch(/^## componenten \(catalogus \/design-system; /);
    expect(regels.slice(1).every((regel) => regel.startsWith('- ') && !regel.includes('/design-system'))).toBe(true);
    expect(regels.slice(1).some((regel) => / · (true|false)( · |$)/.test(regel))).toBe(false);
    expect(r.stdout).toMatch(/^- Button · publiek · \S+ · variant=[a-z|]+/m);
  });

  test('alle secties samen: nergens [object Object]', () => {
    const r = feiten();

    expect([r.status, r.stdout.includes('[object Object]')]).toStrictEqual([0, false]);
  });
});

describe('adr', () => {
  test('standaard alleen geaccepteerd, voorgesteld (en onbekend) plus één telregel', () => {
    const overzicht = adrOverzicht(ADRS, false);

    expect(overzicht.lijst.map((adr) => adr.titel)).toStrictEqual(['Stack', 'Geparkeerd', 'Kapot']);
    expect(overzicht).toHaveProperty('overig', '2 vervangen/vervallen (feiten adr --alle)');
  });

  test('--alle: de volledige lijst, zonder telregel', () => {
    const overzicht = adrOverzicht(ADRS, true);

    expect(overzicht.lijst).toStrictEqual(ADRS);
    expect(overzicht).not.toHaveProperty('overig');
  });

  test('het volgende nummer rekent over de volledige lijst, ook als de hoogste vervallen is', () => {
    const lijst = [...ADRS, { nummer: '0052', titel: 'Laatste', status: 'vervallen' }];

    expect(adrOverzicht(lijst, false).volgende).toBe('0053 (template, tot 0099) · 0100 (app, vanaf 0100)');
    expect(nextAdr([{ nummer: '0039' }, { nummer: '0039' }, { nummer: '0101' }])).toBe(
      '0040 (template, tot 0099) · 0102 (app, vanaf 0100)',
    );
  });

  test("in de echte repo: --alle toont meer ADR's dan standaard en hetzelfde volgende nummer", () => {
    const standaard = feiten('adr');
    const alles = feiten('adr', '--alle');
    const telling = (tekst: string) => tekst.split('\n').filter((regel) => regel.startsWith('- ')).length;
    const volgende = (tekst: string) => tekst.split('\n').find((regel) => regel.startsWith('volgende: '));

    expect([standaard.status, alles.status]).toStrictEqual([0, 0]);
    expect(standaard.stdout).not.toMatch(/· (vervallen|vervangen door \d{4})$/m);
    expect(standaard.stdout).toMatch(/^overig: \d+ vervangen\/vervallen \(feiten adr --alle\)$/m);
    expect(alles.stdout).not.toContain('overig: ');
    expect(telling(alles.stdout)).toBeGreaterThan(telling(standaard.stdout));
    expect(volgende(standaard.stdout)).toBe(volgende(alles.stdout));
  });
});

const ROADMAP = [
  '# Roadmap',
  '',
  '## Nu',
  '',
  '- [ ] **ST-09 (P1) — proef-app** (fase 1, stuk 6). Doel: bewijzen.',
  '  **Werk:** een vervolgregel die fase 2 noemt.',
  '- [x] **Klaar item** (fase 1). Gebouwd in #1.',
  '',
  '## Volgende',
  '',
  '- [ ] **ST-04 (P0) — audit: vervolg** (ADR 0051, spec audit-log). Open: `/admin/audit`.',
  '- [ ] **Versie en build-SHA** (stuk 3f) in `GET /api/health`; zie `docs/specs/accountbeheer.md`.',
  '- [ ] **ST-10 (P1) — staging** (fase 3, per app).',
  '',
  '## Geparkeerd',
  '',
  '- [ ] **Geparkeerd item** (fase 2).',
].join('\n');
const DOD = '# Definition of Done\n\n## Altijd\n\n- [ ] x\n\n## Fase 0 — Bewijs\n\n## Fase 3 — Release\n';
const SPECS = [
  { spec: 'audit-log.md', status: 'goedgekeurd' },
  { spec: 'accountbeheer.md', status: 'gebouwd' },
  { spec: 'audit.md', status: 'voorstel' },
];

describe('fase', () => {
  test('open items onder Nu en Volgende met fase, specs en regelnummer; afgevinkt en Geparkeerd niet', () => {
    const overzicht = faseOverzicht({ roadmap: ROADMAP, dod: DOD, specs: SPECS });

    expect(overzicht).toHaveProperty('open', [
      'Nu · ST-09 (P1) — proef-app · fase 1 (stuk 6) · docs/roadmap.md:5',
      'Volgende · ST-04 (P0) — audit: vervolg · fase onbekend → lees docs/roadmap.md:11 · spec audit-log (goedgekeurd)',
      'Volgende · Versie en build-SHA · fase 1 (stuk 3f) · spec accountbeheer (gebouwd) · docs/roadmap.md:12',
      'Volgende · ST-10 (P1) — staging · fase 3 · docs/roadmap.md:13',
    ]);
    expect(overzicht).toHaveProperty('dod', 'Altijd · Fase 0 — Bewijs · Fase 3 — Release');
    expect(overzicht).toHaveProperty('regel', expect.stringContaining('docs/dod.md:3'));
    expect(overzicht).toHaveProperty('anders', expect.stringContaining('lees docs/roadmap.md'));
  });

  test.each([
    { naam: 'geen roadmap', roadmap: null },
    { naam: 'roadmap zonder ## Nu en ## Volgende', roadmap: '# Roadmap\n\n## Gebouwd\n\n- [x] a\n' },
  ])('$naam: terugval "onbekend → lees docs/roadmap.md"', ({ roadmap }) => {
    expect(faseOverzicht({ roadmap, dod: DOD, specs: SPECS })).toStrictEqual({
      fase: 'onbekend → lees docs/roadmap.md',
    });
  });

  test('in de echte repo: compact, met de fase-regel uit de DoD en de open items onder Nu', () => {
    const r = feiten('fase');

    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^## fase\nregel: .*docs\/dod\.md:3/);
    expect(r.stdout).toMatch(/^- Nu · .+ · docs\/roadmap\.md:\d+/m);
    expect(Buffer.byteLength(r.stdout)).toBeLessThan(8_000);
  });
});

describe('aanroep', () => {
  test('meerdere secties: alleen die secties, in de gevraagde volgorde', () => {
    const r = feiten('specs', 'fase');

    expect(r.stdout.split('\n').filter((regel) => regel.startsWith('## '))).toStrictEqual(['## specs', '## fase']);
  });

  test('onbekende sectie: status 2 en de keuzelijst met fase', () => {
    const r = feiten('roadmap');

    expect([r.status, r.stderr.includes('Onbekende sectie: roadmap'), r.stderr.includes('fase')]).toStrictEqual([
      2,
      true,
      true,
    ]);
  });
});
