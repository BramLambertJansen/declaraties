import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { feitenAanroepen, feitenBytes, scenarioFeiten } from '../../scripts/kit/leespad-feiten.mjs';
import { eenheidMeldingen, PADREGELS, SCENARIOS } from '../../scripts/kit/leespad.mjs';
import { expectAbsent } from '../support/absence';
import { werkmap } from '../../scripts/kit/feiten-secties.mjs';

// Spec meting-stuurt (ADR 0070): het leespad tegenover de basis (AC-1), in de samenvatting van de CI-job (AC-3), met de
// feiten-aanroepen uit de scenariobestanden (AC-4) en een plafond dat niet met de repo groeit (AC-6).
const root = process.cwd();
const KB = 1024;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.trim();
}

function schrijf(dir: string, bestanden: Record<string, string>) {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
}

/** Een repo met `basis` gecommit als origin/main en `nu` daarna in de werkmap (toegevoegd, niet gecommit). */
function repo(basis: Record<string, string>, nu: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'meting-stuurt-'));
  dirs.push(dir);
  git(dir, 'init', '-q');
  schrijf(dir, { 'package.json': '{}\n', ...basis });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'basis');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  schrijf(dir, nu);
  git(dir, 'add', '-A');
  return dir;
}

function leespad(cwd: string, args: string[] = [], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/kit/leespad.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const x = (bytes: number) => `${'x'.repeat(bytes - 1)}\n`;
const regels = (n: number) => 'r\n'.repeat(n);
const SPEC = (bytes: number) => `---\nstatus: voorstel\n---\n${x(bytes)}`;
function veld(x: unknown, ...namen: string[]): unknown {
  for (const n of namen) x = typeof x === 'object' && x !== null ? new Map(Object.entries(x)).get(n) : undefined;
  return x;
}
const regel = (uit: string, naam: string) => uit.split('\n').find((l) => l.startsWith(`${naam}: `)) ?? '';

describe('meting-stuurt/AC-1: "let op" alleen tegenover de basis', { timeout: 60_000 }, () => {
  test('meting-stuurt/AC-1 scenario: 1023 bytes groei geen "let op", 1024 wel; gelijk zegt "gelijk aan de basis"', () => {
    const basis = { 'docs/gouden-pad.md': x(2000) };
    const gelijk = leespad(repo(basis));
    expect(gelijk.status).toBe(0);
    expect(gelijk.stdout).toMatch(/^basis: [0-9a-f]{40}$/m);
    expect(regel(gelijk.stdout, 'nieuwe-feature')).toContain('gelijk aan de basis');
    const net = leespad(repo(basis, { 'docs/gouden-pad.md': x(2000 + 1023) }));
    expect(regel(net.stdout, 'nieuwe-feature')).toContain('was 2000');
    expect(regel(net.stdout, 'nieuwe-feature')).not.toContain('let op');
    const groei = leespad(repo(basis, { 'docs/gouden-pad.md': x(2000 + KB) }));
    expect(regel(groei.stdout, 'nieuwe-feature')).toContain(
      'let op: 1024 bytes gegroeid tegenover de basis (was 2000)',
    );
    expect(regel(groei.stdout, 'review')).not.toContain('let op');
  });

  test('meting-stuurt/AC-1 boven de drempel en gelijk: drempel erbij, zonder "let op"', () => {
    const r = leespad(repo({ 'docs/gouden-pad.md': x(89 * KB) }));
    expect(regel(r.stdout, 'nieuwe-feature')).toContain('drempel 88 KB');
    expect(regel(r.stdout, 'nieuwe-feature')).toContain('boven de drempel, gelijk aan de basis');
    expect(r.stdout).not.toContain('let op');
  });

  test.each([
    {
      naam: 'een spec komt nieuw boven de streefwaarde',
      voor: SPEC(9 * KB),
      na: SPEC(11 * KB),
      verwacht: /let op: specs: docs\/specs\/a\.md 11 KB, nieuw boven/,
    },
    {
      naam: 'een spec erboven groeit 1 KB',
      voor: SPEC(11 * KB),
      na: SPEC(12 * KB),
      verwacht: /let op: specs: docs\/specs\/a\.md 12 KB, boven de streefwaarde gegroeid \(was 11 KB\)/,
    },
    { naam: 'een spec erboven groeit minder dan 1 KB', voor: SPEC(11 * KB), na: SPEC(12 * KB - 1), verwacht: null },
    { naam: 'een spec erboven blijft gelijk', voor: SPEC(11 * KB), na: SPEC(11 * KB), verwacht: null },
  ])('meting-stuurt/AC-1 per eenheid: $naam', ({ voor, na, verwacht }) => {
    const r = leespad(repo({ 'docs/specs/a.md': voor }, { 'docs/specs/a.md': na }));
    expect(r.status).toBe(0);
    if (verwacht === null) {
      expectAbsent(r.stdout, /let op: specs/, {
        recognizes: ['let op: specs: docs/specs/a.md 12 KB, boven de streefwaarde gegroeid'],
        allows: ['let op: rules: .claude/rules/a.md 66 regels'],
      });
    } else expect(r.stdout).toMatch(verwacht);
  });

  test('meting-stuurt/AC-1 per eenheid in regels: 5 regels groei boven de streefwaarde', () => {
    const vier = leespad(repo({ '.claude/rules/a.md': regels(61) }, { '.claude/rules/a.md': regels(65) }));
    expectAbsent(vier.stdout, /let op: rules/, {
      recognizes: ['let op: rules: .claude/rules/a.md 66 regels, boven de streefwaarde gegroeid'],
      allows: ['let op: specs: docs/specs/a.md 12 KB'],
    });
    const vijf = leespad(repo({ '.claude/rules/a.md': regels(61) }, { '.claude/rules/a.md': regels(66) }));
    expect(vijf.stdout).toMatch(
      /let op: rules: \.claude\/rules\/a\.md 66 regels, boven de streefwaarde gegroeid \(was 61 regels\)/,
    );
  });

  test('meting-stuurt/AC-1 eenheidMeldingen vergelijkt op naam; een nieuwe naam boven de streefwaarde meldt', () => {
    const nu = { specs: [{ naam: 'b.md', waarde: 11 * KB }], adrs: [{ naam: 'oud.md', waarde: 3 * KB }] };
    const basis = { specs: [{ naam: 'a.md', waarde: 11 * KB }], adrs: [{ naam: 'oud.md', waarde: 9 * KB }] };
    expect(eenheidMeldingen(nu, basis)).toStrictEqual(['let op: specs: b.md 11 KB, nieuw boven de streefwaarde 10 KB']);
  });

  test('meting-stuurt/AC-1 zonder origin/main: één regel, geen vergelijking, exit 0', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'meting-stuurt-'));
    dirs.push(dir);
    git(dir, 'init', '-q');
    schrijf(dir, { 'docs/gouden-pad.md': x(60 * KB) });
    git(dir, 'add', '-A');
    const r = leespad(dir);
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe(
      'basis niet te meten (geen origin/main of merge-base); meting zonder vergelijking',
    );
    expect(r.stdout).not.toContain('let op');
  });

  test('meting-stuurt/AC-1 --basis en --ref samen; leespad schrijft niets', () => {
    const dir = repo({ 'docs/gouden-pad.md': x(2000) });
    schrijf(dir, { 'docs/gouden-pad.md': x(4000) });
    git(dir, 'commit', '-qam', 'groei');
    const status = git(dir, 'status', '--porcelain');
    const r = leespad(dir, ['--ref', 'HEAD', '--basis', 'HEAD~1', '--json']);
    expect(r.status, r.stderr).toBe(0);
    const data: unknown = JSON.parse(r.stdout);
    expect(data).toMatchObject({ basis: { ref: 'HEAD~1', scenarios: { 'nieuwe-feature': { totaal: 2000 } } } });
    expect(data).toMatchObject({ scenarios: { 'nieuwe-feature': { totaal: 4000 } } });
    expect(git(dir, 'status', '--porcelain')).toBe(status);
  });

  test('meting-stuurt/AC-1 de basis is de merge-base, niet de kop van origin/main', () => {
    const dir = repo({ 'docs/gouden-pad.md': x(2000) });
    const afsplitsing = git(dir, 'rev-parse', 'HEAD');
    // main loopt door met een grote groei die niet bij deze branch hoort.
    git(dir, 'checkout', '-q', '-b', 'main-verder');
    schrijf(dir, { 'docs/gouden-pad.md': x(9000) });
    git(dir, 'commit', '-qam', 'main verder');
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(dir, 'checkout', '-q', afsplitsing);
    schrijf(dir, { 'docs/gouden-pad.md': x(2500) });
    git(dir, 'add', '-A');
    const r = leespad(dir, ['--json']);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      basis: { ref: afsplitsing, scenarios: { 'nieuwe-feature': { totaal: 2000 } } },
      scenarios: { 'nieuwe-feature': { totaal: 2500 } },
    });
  });

  test.each([['--basis', 'bestaat-niet-xyz'], ['--basis', '-x'], ['--basis=--upload-pack=touch pwn']])(
    'meting-stuurt/AC-1 ongeldige basis %s: exit 1',
    (...args) => {
      const r = leespad(repo({ 'docs/gouden-pad.md': x(10) }), args);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/leespad: (ongeldige|onbekende) ref/);
    },
  );
});

describe('meting-stuurt/AC-3: meldingen in de samenvatting van de CI-job', { timeout: 60_000 }, () => {
  function samenvatting() {
    const dir = mkdtempSync(path.join(tmpdir(), 'meting-stuurt-sum-'));
    dirs.push(dir);
    const bestand = path.join(dir, 'summary.md');
    writeFileSync(bestand, '');
    return bestand;
  }

  test('meting-stuurt/AC-3 leespad schrijft zijn uitvoer tegenover de basis naar $GITHUB_STEP_SUMMARY', () => {
    const bestand = samenvatting();
    const r = leespad(repo({ 'docs/gouden-pad.md': x(2000) }, { 'docs/gouden-pad.md': x(4000) }), [], {
      GITHUB_STEP_SUMMARY: bestand,
    });
    expect(r.status).toBe(0);
    const tekst = readFileSync(bestand, 'utf8');
    expect(tekst).toContain('### pnpm leespad (tegenover de basis)');
    expect(tekst).toMatch(/nieuwe-feature: .*let op: 2000 bytes gegroeid/);
  });

  test('meting-stuurt/AC-3 ratchet schrijft zijn meldingen naar $GITHUB_STEP_SUMMARY, ook als hij rood is', () => {
    const dir = repo({ '.kit/baseline.json': '{}\n', 'src/leeg.ts': 'export {};\n' });
    // AGENTS.md op 90 % van de grens (melding) en CLAUDE.md boven de grens (een nieuwe overtreding: rood).
    schrijf(dir, { 'AGENTS.md': `${'x'.repeat(829)}\n`.repeat(10), 'CLAUDE.md': 'r\n'.repeat(60) });
    git(dir, 'add', '-A');
    const bestand = samenvatting();
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/kit/ratchet.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_STEP_SUMMARY: bestand },
    });
    expect(r.status).toBe(1);
    const tekst = readFileSync(bestand, 'utf8');
    expect(tekst).toContain('### ratchet: meldingen');
    expect(tekst).toMatch(/check-docs: let op: .*AGENTS\.md/);
  });

  test('meting-stuurt/AC-3 zonder $GITHUB_STEP_SUMMARY schrijft leespad geen samenvatting', () => {
    const dir = repo({ 'docs/gouden-pad.md': x(10) });
    const r = leespad(dir, [], { GITHUB_STEP_SUMMARY: '' });
    expect(r.status).toBe(0);
    expect(git(dir, 'status', '--porcelain')).toBe('');
  });
});

describe('meting-stuurt/AC-4: feiten-aanroepen uit de scenariobestanden', { timeout: 60_000 }, () => {
  const lees = (pad: string) => werkmap.lees(pad);

  test.each([
    ['nieuwe-feature', ['gates', 'specs', 'fase', 'adr', 'routes', 'permissies', 'foutcodes']],
    ['lichte-fix', ['gates', 'specs', 'fase', 'routes', 'permissies', 'foutcodes']],
    ['review', ['gates', 'specs', 'fase']],
  ])('meting-stuurt/AC-4 %s: de secties uit zijn bestanden, elke aanroepregel herkend', (naam, secties) => {
    const paden = new Map(Object.entries(SCENARIOS)).get(naam) ?? [];
    const uit = scenarioFeiten(paden, lees);
    expect(uit).toStrictEqual({ secties, alle: false, zonder: [] });
  });

  test('meting-stuurt/AC-4 nieuwe-feature telt de padregels van een app-feature', () => {
    expect(PADREGELS).toStrictEqual({
      'nieuwe-feature': ['.claude/rules/api.md', '.claude/rules/web.md', '.claude/rules/database.md'],
    });
  });

  test('meting-stuurt/AC-4 injectie, "Begin met"-regels, hoofdstuk, kale aanroep en --alle', () => {
    const tekst = [
      '!`node scripts/kit/feiten.mjs specs routes`',
      '1. Begin met de feiten: `node scripts/kit/feiten.mjs adr --alle`, daarna `node scripts/kit/feiten.mjs tokens`.',
      '- Begin met taakrelevante feiten (`node scripts/kit/feiten.mjs gates`); regelboek: `feiten.mjs hoofdstuk 8`.',
      'Elders: `node scripts/kit/feiten.mjs componenten` telt niet.',
      '!`node scripts/kit/feiten.mjs hoofdstuk 8`',
    ].join('\n');
    expect(feitenAanroepen(tekst)).toStrictEqual({
      aanroepen: [
        { secties: ['specs', 'routes'], alle: false },
        { secties: ['adr'], alle: true },
        { secties: ['gates'], alle: false },
      ],
      zonder: [],
    });
  });

  test('meting-stuurt/AC-4 fixture: een aanroep buiten backticks faalt (regel zonder herkende aanroep)', () => {
    const uit = feitenAanroepen('# Agent\n\n1. Begin met de feiten: node scripts/kit/feiten.mjs gates specs.\n');
    expect(uit).toStrictEqual({ aanroepen: [], zonder: [3] });
  });

  test('meting-stuurt/AC-4 faalt feiten, dan is dat deel "onbekend" met reden, nooit 0 bytes', async () => {
    const code = {
      sectie: () => Promise.reject(new Error('routes niet te laden')),
      volgende: () => Promise.resolve('0071'),
    };
    const uit = await feitenBytes({ secties: ['gates'], alle: false }, werkmap, code);
    expect(uit).toStrictEqual({ bytes: null, reden: 'routes niet te laden' });
  });

  test('meting-stuurt/AC-4 CLI in de echte repo: bestanden, feiten en padregels per scenario', () => {
    const r = leespad(root, ['--json']);
    expect(r.status, r.stderr).toBe(0);
    const data: unknown = JSON.parse(r.stdout);
    expect(data).toMatchObject({
      scenarios: {
        'nieuwe-feature': { padregels: { ontbreekt: [] } },
        review: { feiten: { secties: ['gates', 'specs', 'fase'] }, padregels: { bytes: 0 } },
      },
    });
    const secties = veld(data, 'scenarios', 'nieuwe-feature', 'feiten', 'secties');
    expect(Array.isArray(secties) ? secties : []).toEqual(expect.arrayContaining(['adr', 'routes']));
    expect(r.stdout).not.toContain('"bytes": null');
    const tekst = leespad(root);
    expect(regel(tekst.stdout, 'nieuwe-feature')).toMatch(/\(bestanden \d+, feiten \d+, padregels \d+;/);
  });

  test('meting-stuurt/AC-4 feitenBytes is gelijk aan de uitvoer van feiten.mjs', async () => {
    const { werkmapCode } = await import('../../scripts/kit/leespad-feiten.mjs');
    const secties = ['gates', 'specs', 'fase', 'adr', 'routes', 'permissies', 'foutcodes'];
    const uit = await feitenBytes({ secties, alle: false }, werkmap, werkmapCode());
    const cli = spawnSync(process.execPath, ['scripts/kit/feiten.mjs', ...secties], { cwd: root, encoding: 'utf8' });
    expect(cli.status).toBe(0);
    expect(uit).toStrictEqual({ bytes: Buffer.byteLength(cli.stdout) });
  });
});

describe('meting-stuurt/AC-6: het leespad groeit niet met de repo', { timeout: 60_000 }, () => {
  const EXTRA_SPECS = Array.from({ length: 200 }, (_x, i) => `extra-${String(i).padStart(3, '0')}.md`);
  const EXTRA_ADRS = Array.from({ length: 50 }, (_x, i) => `${String(200 + i).padStart(4, '0')}-extra-besluit.md`);
  const VOLGENDE = Array.from(
    { length: 50 },
    (_x, i) => `- [ ] **Extra roadmap-item ${String(i)}** (fase 2). Aanleiding: #1.`,
  ).join('\n');

  /** De werkmap plus 200 specs (100 gebouwd, 100 vervallen), 50 geaccepteerde ADR's en 50 items onder Volgende. */
  const gegroeid = {
    lees: (pad: string) => {
      const spec = /^docs\/specs\/extra-(\d+)\.md$/.exec(pad);
      if (spec !== null) return `---\nstatus: ${Number(spec[1]) < 100 ? 'gebouwd' : 'vervallen'}\n---\n`;
      const adr = /^docs\/adr\/(\d{4})-extra-besluit\.md$/.exec(pad);
      if (adr !== null) return `# ${adr[1] ?? ''} — Extra besluit\n\nStatus: geaccepteerd\n`;
      const tekst = werkmap.lees(pad);
      return pad === 'docs/roadmap.md' && tekst !== null
        ? tekst.replace('## Volgende\n', `## Volgende\n\n${VOLGENDE}\n`)
        : tekst;
    },
    lijst: (map: string) => [
      ...werkmap.lijst(map),
      ...(map === 'docs/specs' ? EXTRA_SPECS : map === 'docs/adr' ? EXTRA_ADRS : []),
    ],
  };
  const code = {
    sectie: () => Promise.resolve({ inhoud: 'gelijk aan beide kanten' }),
    volgende: () => Promise.resolve('0250 (template, tot 0099) · 0100 (app, vanaf 0100)'),
  };

  test.each(Object.entries(SCENARIOS))('meting-stuurt/AC-6 %s: hoogstens 1 KB groei', async (_naam, paden) => {
    const { zonder, ...aanroep } = scenarioFeiten(paden, (pad: string) => werkmap.lees(pad));
    expect(zonder).toStrictEqual([]);
    const nu = await feitenBytes(aanroep, werkmap, code);
    const later = await feitenBytes(aanroep, gegroeid, code);
    expect(nu.bytes).not.toBeNull();
    expect(later.bytes).not.toBeNull();
    expect(Math.abs((later.bytes ?? 0) - (nu.bytes ?? 0))).toBeLessThanOrEqual(KB);
  });

  test('meting-stuurt/AC-6 de groei is echt: met --alle groeit dezelfde uitvoer wel', async () => {
    const aanroep = { secties: ['specs', 'adr', 'fase'], alle: true };
    const nu = await feitenBytes(aanroep, werkmap, code);
    const later = await feitenBytes(aanroep, gegroeid, code);
    expect((later.bytes ?? 0) - (nu.bytes ?? 0)).toBeGreaterThan(10 * KB);
  });
});
