import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

// Spec leesbudget (ADR 0065), rails-AC's leesbudget/AC-1 t/m AC-7. Verwachte vorm (de bouw-PR maakt de exports):
// - scripts/kit/check-docs.mjs: docsViolations(root) (bestaat) zonder budget voor hoofdstuk, regelboek, spec en ADR;
//   AGENTS.md (9 KB, 100 regels) en CLAUDE.md (50 regels, sleutel `docs:CLAUDE.md:regels:<n>`) blijven rood.
//   docsMeldingen(root): Promise<string[]> | string[] met "let op: <eenheid> op <n> % van de grens; verplaats naar een
//   lagere laag" vanaf ceil(0,85 × grens). normViolations({ boek, lijst, bytes }): Violation[] (AC-6, nu krimp-op-normen).
// - scripts/kit/ratchet.mjs: drukt de meldingen af (exit ongewijzigd); een krimpovertreding komt nooit in de baseline.
// - scripts/kit/leespad.mjs: hoofdstukTekst(framework, n): string | null; leespad() telt van docs/framework.md alleen
//   de tekst vóór de eerste `## `-kop plus hoofdstuk 8 met 8a, 8b…; metingen(paden, lees) per soort
//   { streefwaarde, eenheid, aantal, boven, grootste: { naam, waarde }[] (max 5, aflopend) }; CLI --json geeft ook
//   `metingen` en per scenario `drempel` (en `streefdoel` bij nieuwe-feature).
// - scripts/kit/feiten.mjs: sectie `hoofdstuk <n>`.
// - scripts/kit/meting-trend.mjs: CODEX_LOGIN, telCodex(reacties), trend(prs); `pnpm meting --trend` (METING_GH).
const root = process.cwd();
const KB = 1024;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function veld(x: unknown, ...namen: string[]): unknown {
  for (const n of namen) x = isRecord(x) ? x[n] : undefined;
  return x;
}

async function laad(bestand: string): Promise<Record<string, unknown> | undefined> {
  try {
    const mod: unknown = await import(pathToFileURL(path.join(root, bestand)).href);
    return isRecord(mod) ? mod : undefined;
  } catch {
    return undefined;
  }
}

/** De export `naam` van `bestand` als functie; ontbreekt hij, dan faalt de test op een assertie. */
async function functie(bestand: string, naam: string): Promise<(...args: unknown[]) => unknown> {
  const fn = (await laad(bestand))?.[naam];
  expect(typeof fn, `${bestand} exporteert ${naam}()`).toBe('function');
  if (typeof fn !== 'function') throw new Error('onbereikbaar');
  return (...args: unknown[]): unknown => Reflect.apply(fn, undefined, args);
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

function schrijf(dir: string, bestanden: Record<string, string>) {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
}

/** Een git-repo met de bestanden (toegevoegd, niet gecommit), zoals in kennisbasis-budget.test.ts. */
function repo(bestanden: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'leesbudget-'));
  dirs.push(dir);
  schrijf(dir, {
    'package.json': JSON.stringify({ scripts: {} }),
    'src/leeg.ts': 'export {};\n',
    '.kit/baseline.json': '{}\n',
    ...bestanden,
  });
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  return dir;
}

/** Een tekst van precies `bytes` bytes (ASCII) in `regels` regels, elk afgesloten met een regeleinde. */
function tekst(bytes: number, regels = 1): string {
  const per = Math.floor(bytes / regels);
  const rest = bytes - per * regels;
  return Array.from({ length: regels }, (_r, i) => `${'x'.repeat(per - 1 + (i === 0 ? rest : 0))}\n`).join('');
}

const H = (n: string, inhoud: string): string => `## ${n}. Kop ${n}\n\n${inhoud}\n\n`;
const VOOR = '# Framework\n\nINLEIDING vóór de eerste kop.\n\n';
const H8 = H('8', 'ACHT_HOOFD\n\n### 8.1 Sub\n\nnog acht');
const H8A = H('8a', 'ACHT_A');
const H8B = H('8b', 'ACHT_B');
/** Een regelboek met preambule, §1, §7, §8 met 8a en 8b, §9, §11a, §13 en §80. */
const FRAMEWORK =
  VOOR +
  H('1', 'EEN') +
  H('7', 'ZEVEN') +
  H8 +
  H8A +
  H8B +
  H('9', 'NEGEN') +
  H('11a', 'ELF_A') +
  H('13', 'DERTIEN') +
  H('80', 'TACHTIG');

const SPEC_KOP = (naam: string): string => `---\nstatus: voorstel\nnamespace: ${naam}\n---\n\n`;
const ADR_KOP = (nr: string): string => `# ${nr} — Demo\n\nStatus: voorgesteld\n\n`;
const budgetKeys = (v: { key: string }[]) => v.map(({ key }) => key).filter((k) => /:(budget|regels):/.test(k));

async function docsViolations(dir: string): Promise<{ key: string; message: string }[]> {
  const fn = await functie('scripts/kit/check-docs.mjs', 'docsViolations');
  const uit: unknown = await fn(dir);
  expect(Array.isArray(uit)).toBe(true);
  return (Array.isArray(uit) ? uit : []).map((v: unknown) => ({
    key: String(veld(v, 'key')),
    message: String(veld(v, 'message')),
  }));
}

async function docsMeldingen(dir: string): Promise<string[]> {
  const fn = await functie('scripts/kit/check-docs.mjs', 'docsMeldingen');
  const uit: unknown = await fn(dir);
  expect(Array.isArray(uit), 'docsMeldingen geeft een lijst tekst').toBe(true);
  return (Array.isArray(uit) ? uit : []).map(String);
}

// Een tijdelijke repo zonder origin/main is lokaal: in CI zou de krimpcontrole daar rood zijn (krimp-op-normen/AC-5).
function node(cwd: string, [script = '', ...args]: string[], env: Record<string, string> = { GITHUB_ACTIONS: '' }) {
  const r = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, uit: `${r.stdout}\n${r.stderr}` };
}

describe('leesbudget/AC-1: alleen AGENTS.md en CLAUDE.md hebben een harde grens', { timeout: 60_000 }, () => {
  test.each([
    ['docs/framework.md van 60 KB', 'docs/framework.md', tekst(60 * KB)],
    ['een spec van 50 KB', 'docs/specs/groot.md', SPEC_KOP('groot') + tekst(50 * KB)],
    ['een ADR van 9 KB', 'docs/adr/0070-groot.md', ADR_KOP('0070') + tekst(9 * KB)],
    ['een ADR van 9 KB in archief/', 'docs/adr/archief/0071-groot.md', ADR_KOP('0071') + tekst(9 * KB)],
    ['een hoofdstuk van 20 KB', 'docs/framework.md', VOOR + H('8', tekst(20 * KB)) + H('9', 'NEGEN')],
  ])('leesbudget/AC-1 %s: geen budgetovertreding', async (_naam, bestand, inhoud) => {
    expect(budgetKeys(await docsViolations(repo({ [bestand]: inhoud })))).toStrictEqual([]);
  });

  test.each([
    [
      'AGENTS.md van 9 KB + 1 byte',
      { bestand: 'AGENTS.md', inhoud: tekst(9 * KB + 1, 100), sleutel: 'docs:AGENTS.md:budget:9217' },
    ],
    [
      'AGENTS.md met 101 regels',
      { bestand: 'AGENTS.md', inhoud: tekst(2000, 101), sleutel: 'docs:AGENTS.md:regels:101' },
    ],
    ['CLAUDE.md met 51 regels', { bestand: 'CLAUDE.md', inhoud: tekst(1000, 51), sleutel: 'docs:CLAUDE.md:regels:51' }],
  ])('leesbudget/AC-1 %s: overtreding met de verwachte sleutel', async (_naam, { bestand, inhoud, sleutel }) => {
    const v = await docsViolations(repo({ [bestand]: inhoud }));
    expect(budgetKeys(v)).toStrictEqual([sleutel]);
    expect(v.find(({ key }) => key === sleutel)?.message).toContain(bestand);
  });

  test.each([
    ['AGENTS.md op 9 KB en 100 regels', 'AGENTS.md', tekst(9 * KB, 100)],
    ['CLAUDE.md met 50 regels', 'CLAUDE.md', tekst(1000, 50)],
  ])('leesbudget/AC-1 %s (gelijk aan de grens): geen overtreding', async (_naam, bestand, inhoud) => {
    expect(budgetKeys(await docsViolations(repo({ [bestand]: inhoud })))).toStrictEqual([]);
  });

  test('leesbudget/AC-1 regel 8: framework §13 en §8a zijn geldig als het regelboek die kop heeft; §14 zonder kop niet', async () => {
    const dir = repo({
      'docs/framework.md': FRAMEWORK,
      'docs/x.md': 'Zie framework §13, framework §8a en framework §14.\n',
    });
    const keys = (await docsViolations(dir)).map(({ key }) => key).filter((k) => k.includes(':paragraaf:'));
    expect(keys).toStrictEqual(['docs:docs/x.md:paragraaf:§14']);
  });

  test('leesbudget/AC-1 regel 8: de ankers §1–§12 en §11a blijven geldig', async () => {
    const dir = repo({
      'docs/framework.md': FRAMEWORK,
      'docs/x.md': 'framework §1, framework §12 en framework §11a.\n',
    });
    expect((await docsViolations(dir)).filter(({ key }) => key.includes(':paragraaf:'))).toStrictEqual([]);
  });

  test('leesbudget/AC-1 .kit/baseline.json heeft geen budget-ingang meer voor regelboek, spec of ADR', () => {
    const baseline: unknown = JSON.parse(readFileSync(path.join(root, '.kit/baseline.json'), 'utf8'));
    const lijst = veld(baseline, 'check-docs');
    const keys = Array.isArray(lijst) ? lijst.map(String) : [];
    expect(keys.filter((k) => /^docs:(adr:\d{4}|docs\/.+\.md):budget:/.test(k))).toStrictEqual([]);
  });

  test('leesbudget/AC-1 ratchet: een bestaande overschrijding van AGENTS.md in de baseline is groen, groei rood', () => {
    const dir = repo({ 'AGENTS.md': tekst(9 * KB + 100, 100) });
    expect(node(dir, ['scripts/kit/ratchet.mjs', '--update']).status).toBe(0);
    expect(readFileSync(path.join(dir, '.kit/baseline.json'), 'utf8')).toContain('docs:AGENTS.md:budget:9316');
    expect(node(dir, ['scripts/kit/ratchet.mjs']).status).toBe(0);
    writeFileSync(path.join(dir, 'AGENTS.md'), tekst(9 * KB + 101, 100));
    const groei = node(dir, ['scripts/kit/ratchet.mjs']);
    expect(groei.status).toBe(1);
    expect(groei.stderr).toContain('AGENTS.md');
  });

  test('leesbudget/AC-1 ratchet --update zet een te groot regelboek niet in de baseline', () => {
    const dir = repo({ 'docs/framework.md': tekst(45 * KB) });
    expect(node(dir, ['scripts/kit/ratchet.mjs', '--update']).status).toBe(0);
    expect(readFileSync(path.join(dir, '.kit/baseline.json'), 'utf8')).not.toContain('framework.md:budget');
  });
});

const MELDING = (eenheid: string, procent: number) =>
  new RegExp(
    `^let op: .*${eenheid.replace('.', '\\.')}.* op ${String(procent)} % van de grens; verplaats naar een lagere laag`,
  );

describe('leesbudget/AC-2: melding vanaf 85 % van een harde grens', { timeout: 60_000 }, () => {
  test.each([
    ['AGENTS.md op 7834 bytes (ceil(0,85 × 9216))', { bestand: 'AGENTS.md', inhoud: tekst(7834, 10), procent: 85 }],
    ['AGENTS.md op precies 9216 bytes (de grens)', { bestand: 'AGENTS.md', inhoud: tekst(9 * KB, 10), procent: 100 }],
    ['AGENTS.md met 85 regels', { bestand: 'AGENTS.md', inhoud: tekst(1000, 85), procent: 85 }],
    ['CLAUDE.md met 43 regels (ceil(0,85 × 50))', { bestand: 'CLAUDE.md', inhoud: tekst(500, 43), procent: 86 }],
    ['CLAUDE.md met 50 regels (de grens)', { bestand: 'CLAUDE.md', inhoud: tekst(500, 50), procent: 100 }],
  ])('leesbudget/AC-2 %s: melding, geen overtreding', async (_naam, { bestand, inhoud, procent }) => {
    const dir = repo({ [bestand]: inhoud });
    const meldingen = await docsMeldingen(dir);
    expect(meldingen.filter((m) => MELDING(bestand, procent).test(m))).toHaveLength(1);
    expect(budgetKeys(await docsViolations(dir))).toStrictEqual([]);
  });

  test.each([
    ['AGENTS.md op 7833 bytes en 84 regels', 'AGENTS.md', tekst(7833, 84)],
    ['CLAUDE.md met 42 regels', 'CLAUDE.md', tekst(500, 42)],
  ])('leesbudget/AC-2 %s (onder de drempel): geen melding', async (_naam, bestand, inhoud) => {
    const meldingen = await docsMeldingen(repo({ [bestand]: inhoud }));
    expect(meldingen.filter((m) => m.includes(bestand))).toStrictEqual([]);
  });

  test('leesbudget/AC-2 pnpm ratchet drukt de melding af en blijft op exit 0', () => {
    const dir = repo({ 'AGENTS.md': tekst(8300, 10) });
    expect(node(dir, ['scripts/kit/ratchet.mjs', '--update']).status).toBe(0);
    const r = node(dir, ['scripts/kit/ratchet.mjs']);
    expect(r.status).toBe(0);
    expect(r.uit).toMatch(/let op: .*AGENTS\.md.* op 90 % van de grens; verplaats naar een lagere laag/);
  });

  test('leesbudget/AC-2 pnpm leespad drukt de melding af en blijft op exit 0', () => {
    const r = node(repo({ 'AGENTS.md': tekst(8300, 10) }), ['scripts/kit/leespad.mjs']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/let op: .*AGENTS\.md.* op 90 % van de grens; verplaats naar een lagere laag/);
  });
});

const VERWACHT_8 = VOOR + H8 + H8A + H8B;

describe('leesbudget/AC-3: leespad telt §8 en toont metingen', { timeout: 60_000 }, () => {
  test('leesbudget/AC-3 hoofdstukTekst: preambule plus hoofdstuk met letter-subhoofdstukken; onbekend geeft null', async () => {
    const fn = await functie('scripts/kit/leespad.mjs', 'hoofdstukTekst');
    expect(fn(FRAMEWORK, '8')).toBe(VERWACHT_8);
    expect(fn(FRAMEWORK, '13')).toBe(VOOR + H('13', 'DERTIEN'));
    expect(fn(FRAMEWORK, '11a')).toBe(VOOR + H('11a', 'ELF_A'));
    expect(fn(FRAMEWORK, '99')).toBeNull();
  });

  test('leesbudget/AC-3 leespad() telt van docs/framework.md alleen preambule en §8 met 8a en 8b', async () => {
    const fn = await functie('scripts/kit/leespad.mjs', 'leespad');
    const inhoud: Record<string, string> = { 'docs/framework.md': FRAMEWORK, 'AGENTS.md': FRAMEWORK };
    const uit = fn((p: string) => inhoud[p] ?? null, { fw: ['docs/framework.md'], ander: ['AGENTS.md'] });
    expect(veld(uit, 'fw', 'bytes')).toBe(Buffer.byteLength(VERWACHT_8));
    expect(veld(uit, 'ander', 'bytes')).toBe(Buffer.byteLength(FRAMEWORK));
  });

  test('leesbudget/AC-3 CLI --json: streefdoel en waarschuwingsdrempel per scenario', () => {
    const r = node(repo({ 'docs/framework.md': FRAMEWORK }), ['scripts/kit/leespad.mjs', '--json']);
    expect(r.status).toBe(0);
    const data: unknown = JSON.parse(r.stdout);
    // GEWIJZIGD (ADR 0070 punt 4): de bouw van meting-stuurt herijkt de waarden op de eerlijke meting.
    expect(veld(data, 'scenarios', 'nieuwe-feature', 'streefdoel')).toBe(50 * KB);
    expect(veld(data, 'scenarios', 'nieuwe-feature', 'drempel')).toBe(88 * KB);
    expect(veld(data, 'scenarios', 'lichte-fix', 'drempel')).toBe(22 * KB);
    expect(veld(data, 'scenarios', 'review', 'drempel')).toBe(34 * KB);
    expect(veld(data, 'scenarios', 'review', 'bytes')).toBe(Buffer.byteLength(VERWACHT_8));
  });

  // GEWIJZIGD (meting-stuurt/AC-1, ADR 0070 punt 1): "let op" komt alleen uit het verschil met de basis; zonder basis staat
  // de drempel erbij zonder "let op". Het geval met basis staat in test/rails/meting-stuurt-leespad.test.ts.
  test('leesbudget/AC-3 CLI-tekst: streefdoel en drempels; boven de drempel zonder basis geen "let op"', () => {
    const r = node(repo({ 'docs/gouden-pad.md': tekst(89 * KB) }), ['scripts/kit/leespad.mjs']);
    expect(r.status).toBe(0);
    // GEWIJZIGD (ADR 0070 punt 4): herijkte waarden.
    for (const kb of ['50 KB', '88 KB', '34 KB', '22 KB']) expect(r.stdout).toContain(kb);
    expect(r.stdout).toContain('basis niet te meten');
    expect(r.stdout).not.toContain('let op');
  });
});

/** Een repo-inhoud met per soort één eenheid boven en één op de streefwaarde. */
function metingFixture(): Record<string, string> {
  const specs = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((i) => [`docs/specs/s${String(i)}.md`, SPEC_KOP(`s${String(i)}`) + tekst((10 + i) * KB)]),
  );
  return {
    'docs/framework.md': VOOR + H('8', tekst(11 * KB)) + H('13', tekst(20 * KB)) + tekst(30 * KB),
    ...specs,
    'docs/specs/klein.md': SPEC_KOP('klein') + 'kort\n',
    'docs/specs/_template.md': tekst(90 * KB),
    'docs/adr/0070-groot.md': ADR_KOP('0070') + tekst(9 * KB),
    'docs/adr/0071-klein.md': ADR_KOP('0071') + 'kort\n',
    '.claude/rules/lang.md': tekst(700, 61),
    '.claude/rules/precies.md': tekst(600, 60),
    '.claude/skills/groot/SKILL.md': tekst(3000, 201),
    '.claude/skills/klein/SKILL.md': tekst(300, 200),
    'docs/operations/runbook.md': tekst(70 * KB),
  };
}

async function metingen(bestanden: Record<string, string>): Promise<unknown> {
  const fn = await functie('scripts/kit/leespad.mjs', 'metingen');
  return fn(Object.keys(bestanden), (p: string) => bestanden[p] ?? null);
}

describe('leesbudget/AC-3: metingen tegenover streefwaarden', () => {
  test.each([
    ['hoofdstukken', { streef: 12 * KB, eenheid: 'bytes', boven: 1 }],
    ['regelboek', { streef: 40 * KB, eenheid: 'bytes', boven: 1 }],
    ['specs', { streef: 10 * KB, eenheid: 'bytes', boven: 7 }],
    ['adrs', { streef: 6 * KB, eenheid: 'bytes', boven: 1 }],
    ['rules', { streef: 60, eenheid: 'regels', boven: 1 }],
    ['skills', { streef: 200, eenheid: 'regels', boven: 1 }],
  ])(
    'leesbudget/AC-3 metingen().%s: streefwaarde, eenheid en aantal erboven',
    async (soort, { streef, eenheid, boven }) => {
      const uit = await metingen(metingFixture());
      expect(veld(uit, soort, 'streefwaarde')).toBe(streef);
      expect(veld(uit, soort, 'eenheid')).toBe(eenheid);
      expect(veld(uit, soort, 'boven')).toBe(boven);
    },
  );

  test('leesbudget/AC-3 metingen(): per soort hooguit de vijf grootste, aflopend; _template.md telt niet', async () => {
    const uit = await metingen(metingFixture());
    const grootste: unknown = veld(uit, 'specs', 'grootste');
    const namen: unknown = Array.isArray(grootste) ? grootste.map((g: unknown) => veld(g, 'naam')) : grootste;
    expect(namen).toStrictEqual([7, 6, 5, 4, 3].map((i) => `docs/specs/s${String(i)}.md`));
    expect(veld(uit, 'specs', 'aantal')).toBe(8);
  });

  test('leesbudget/AC-3 metingen(): een hoofdstuk (ook §13) is een eigen eenheid; de grootste is §13', async () => {
    const uit = await metingen(metingFixture());
    const eerste = veld(uit, 'hoofdstukken', 'grootste');
    const top: unknown = Array.isArray(eerste) ? eerste[0] : undefined;
    expect(String(veld(top, 'naam'))).toContain('13');
    expect(veld(top, 'waarde')).toBeGreaterThan(20 * KB);
  });

  test('leesbudget/AC-3 metingen(): operations-docs zonder streefwaarde', async () => {
    const uit = await metingen(metingFixture());
    expect(veld(uit, 'operations', 'streefwaarde')).toBeNull();
    expect(veld(uit, 'operations', 'aantal')).toBe(1);
  });

  // GEWIJZIGD (meting-stuurt/AC-1): zonder basis "N erboven" in plaats van "let op".
  test('leesbudget/AC-3 CLI: metingen met het aantal erboven, begrensde uitvoer, exit 0 en nooit een overtreding', () => {
    const r = node(repo(metingFixture()), ['scripts/kit/leespad.mjs']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('7 erboven');
    expect(r.stdout).toContain('docs/specs/s7.md');
    for (const klein of ['docs/specs/s1.md', 'docs/specs/s2.md']) expect(r.stdout).not.toContain(klein);
    expect(r.uit).not.toMatch(/overtreding/i);
    expect(r.stdout).toContain('docs/operations/runbook.md');
  });
});

describe('leesbudget/AC-4: feiten.mjs hoofdstuk <n>', { timeout: 60_000 }, () => {
  test('leesbudget/AC-4 hoofdstuk 8: preambule, §8, §8a en §8b, niets anders', () => {
    const r = node(repo({ 'docs/framework.md': FRAMEWORK }), ['scripts/kit/feiten.mjs', 'hoofdstuk', '8']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(VOOR.trim());
    expect(r.stdout).toContain((H8 + H8A + H8B).trim());
    for (const ander of ['EEN', 'ZEVEN', 'NEGEN', 'ELF_A', 'DERTIEN', 'TACHTIG']) expect(r.stdout).not.toContain(ander);
  });

  test('leesbudget/AC-4 hoofdstuk 13 (boven §12) werkt', () => {
    const r = node(repo({ 'docs/framework.md': FRAMEWORK }), ['scripts/kit/feiten.mjs', 'hoofdstuk', '13']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('DERTIEN');
    expect(r.stdout).not.toContain('ACHT_HOOFD');
  });

  test('leesbudget/AC-4 een onbekend hoofdstuk: foutmelding en exit 1', () => {
    const r = node(repo({ 'docs/framework.md': FRAMEWORK }), ['scripts/kit/feiten.mjs', 'hoofdstuk', '99']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('99');
  });
});

describe('leesbudget/AC-5: groeiproef', { timeout: 60_000 }, () => {
  /** Hoofdstuk van 20 KB, regelboek van 60 KB met een nieuw §13, spec van 50 KB en ADR van 9 KB. */
  const GROEI = {
    'docs/framework.md': VOOR + H('8', tekst(20 * KB)) + H('13', 'DERTIEN' + tekst(11 * KB)) + H('14', tekst(11 * KB)),
    'docs/specs/groot.md': SPEC_KOP('groot') + tekst(50 * KB),
    'docs/adr/0070-groot.md': ADR_KOP('0070') + tekst(9 * KB),
    'docs/x.md': 'Zie framework §13.\n',
  };

  test('leesbudget/AC-5 check-docs: geen budget- of ankerovertreding', async () => {
    const keys = (await docsViolations(repo(GROEI))).map(({ key }) => key);
    expect(keys.filter((k) => /:(budget|regels|paragraaf):/.test(k))).toStrictEqual([]);
  });

  // GEWIJZIGD (meting-stuurt/AC-1): "let op" komt uit het verschil met de basis, dus de groei staat nu tegenover een basis
  // (een lege commit als origin/main) in plaats van alleen in de werkmap.
  test('leesbudget/AC-5 leespad: "let op" bij hoofdstuk, regelboek, spec en ADR tegenover de basis; exit 0', () => {
    const r = node(repo(GROEI), ['scripts/kit/leespad.mjs', '--json']);
    expect(r.status).toBe(0);
    const data: unknown = JSON.parse(r.stdout || '{}');
    for (const soort of ['hoofdstukken', 'regelboek', 'specs', 'adrs'])
      expect(veld(data, 'metingen', soort, 'boven')).toBe(1);
    const dir = mkdtempSync(path.join(tmpdir(), 'leesbudget-basis-'));
    dirs.push(dir);
    git(dir, 'init', '-q');
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'basis');
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    schrijf(dir, GROEI);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'groei');
    const tekstUit = node(dir, ['scripts/kit/leespad.mjs']);
    expect(tekstUit.status).toBe(0);
    for (const soort of ['hoofdstukken', 'regelboek', 'specs', 'adrs'])
      expect(tekstUit.stdout).toMatch(new RegExp(`^let op: ${soort}: .+ nieuw boven de streefwaarde`, 'm'));
  });

  test.each([
    ['AGENTS.md boven 9 KB', 'AGENTS.md', tekst(9 * KB + 1, 50)],
    ['AGENTS.md boven 100 regels', 'AGENTS.md', tekst(2000, 101)],
    ['CLAUDE.md boven 50 regels', 'CLAUDE.md', tekst(1000, 51)],
  ])('leesbudget/AC-5 %s: rood', async (_naam, bestand, inhoud) => {
    expect(budgetKeys(await docsViolations(repo({ ...GROEI, [bestand]: inhoud })))).toHaveLength(1);
  });
});

// leesbudget/AC-6 is vervangen door krimp-op-normen (ADR 0067): de bytedrempel blijft, de inventaris staat in
// docs/normen-vervallen.md. De gevallen hieronder zijn die van de oude AC-6 met de lijst als enige plek; de overige
// gevallen staan in test/rails/krimp-op-normen.test.ts.
type Krimp = { oud: Record<string, number>; nieuw: Record<string, number>; lijst?: string | null };
const LIJST_KOP = '# Vervallen normen\n\nUitleg.\n';

async function krimp({ oud, nieuw, lijst = null }: Krimp): Promise<{ key: string; message: string }[]> {
  const fn = await functie('scripts/kit/check-docs.mjs', 'normViolations');
  const boek = '- **R-DOC-01** Een norm.\n- **R-TEST-02** Nog een norm.\n';
  const uit = fn({
    boek: { oud: boek, nieuw: boek },
    lijst: { oud: LIJST_KOP, nieuw: lijst ?? LIJST_KOP },
    bytes: { oud, nieuw },
  });
  expect(Array.isArray(uit)).toBe(true);
  return (Array.isArray(uit) ? uit : []).map((v: unknown) => ({
    key: String(veld(v, 'key')),
    message: String(veld(v, 'message')),
  }));
}

const INVENTARIS = (pad: string) =>
  `${LIJST_KOP}\n## ${pad}\n\n- regel over X → R-DOC-01\n- regel over Y → geschrapt: dubbel met de lint\n`;

describe('leesbudget/AC-6: krimp van een bindend document vraagt een regel in docs/normen-vervallen.md', () => {
  test.each(['docs/framework.md', 'AGENTS.md', 'CLAUDE.md', '.claude/rules/web.md', 'docs/dod.md'])(
    'leesbudget/AC-6 %s krimpt 22 % en 11000 bytes zonder inventaris: rood',
    async (pad) => {
      const v = await krimp({ oud: { [pad]: 50_000 }, nieuw: { [pad]: 39_000 } });
      expect(v).toHaveLength(1);
      expect(v[0]?.message).toContain(pad);
    },
  );

  test.each(['docs/specs/x.md', 'docs/adr/0070-x.md', 'docs/operations/y.md', '.claude/skills/z/SKILL.md'])(
    'leesbudget/AC-6 %s (niet bindend) krimpt 50 %: groen',
    async (pad) => {
      expect(await krimp({ oud: { [pad]: 50_000 }, nieuw: { [pad]: 25_000 } })).toStrictEqual([]);
    },
  );

  test.each([
    ['precies 20 % (2000 bytes)', { oud: 10_000, nieuw: 8000, aantal: 0 }],
    ['20,01 % (2001 bytes)', { oud: 10_000, nieuw: 7999, aantal: 1 }],
    ['25 % maar 1000 bytes (< 1 KB)', { oud: 4000, nieuw: 3000, aantal: 0 }],
    ['25,6 % en precies 1024 bytes', { oud: 4000, nieuw: 2976, aantal: 1 }],
    ['groei', { oud: 4000, nieuw: 9000, aantal: 0 }],
  ])('leesbudget/AC-6 grens: %s', async (_naam, { oud, nieuw, aantal }) => {
    expect(await krimp({ oud: { 'docs/framework.md': oud }, nieuw: { 'docs/framework.md': nieuw } })).toHaveLength(
      aantal,
    );
  });

  test('leesbudget/AC-6 verwijderd telt als 100 % krimp; een nieuw bindend document niet', async () => {
    expect(await krimp({ oud: { 'docs/dod.md': 5000 }, nieuw: {} })).toHaveLength(1);
    expect(await krimp({ oud: {}, nieuw: { '.claude/rules/nieuw.md': 5000 } })).toStrictEqual([]);
  });

  test('leesbudget/AC-6 een rename telt tegen het oude bestand; met een regel onder die kop groen', async () => {
    const rename = { oud: { '.claude/rules/a.md': 5000 }, nieuw: { '.claude/rules/b.md': 5000 } };
    const v = await krimp(rename);
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain('.claude/rules/a.md');
    expect(await krimp({ ...rename, lijst: INVENTARIS('.claude/rules/a.md') })).toStrictEqual([]);
  });

  test('leesbudget/AC-6 een nieuwe regel onder de kop van het document: groen', async () => {
    const k = { oud: { 'docs/dod.md': 50_000 }, nieuw: { 'docs/dod.md': 30_000 } };
    expect(await krimp({ ...k, lijst: INVENTARIS('docs/dod.md') })).toStrictEqual([]);
  });

  test.each([
    ['zonder kop voor het document', `${LIJST_KOP}\n## AGENTS.md\n\n- regel over X → R-DOC-01\n`, 'docs/dod.md'],
    ['met de kop maar zonder regels', `${LIJST_KOP}\n## docs/dod.md\n`, 'docs/dod.md'],
    [
      'met een R-id die niet in het regelboek staat',
      `${LIJST_KOP}\n## docs/dod.md\n\n- regel X → R-DOC-99\n`,
      'R-DOC-99',
    ],
    ['met "geschrapt:" zonder reden', `${LIJST_KOP}\n## docs/dod.md\n\n- regel X → geschrapt:\n`, 'drie woorden'],
  ])('leesbudget/AC-6 inventaris %s: rood', async (_naam, lijst, genoemd) => {
    const k = { oud: { 'docs/dod.md': 50_000 }, nieuw: { 'docs/dod.md': 30_000 } };
    const v = await krimp({ ...k, lijst });
    expect(v.length).toBeGreaterThan(0);
    expect(v.map(({ message }) => message).join('\n')).toContain(genoemd);
  });
});

describe(
  'leesbudget/AC-6: krimp tegen git merge-base origin/main HEAD, nooit in de baseline',
  { timeout: 60_000 },
  () => {
    const BOEK = (opvulling: number) => `# Framework\n\n## 9. Docs\n\n- **R-DOC-01** Een norm.\n\n${tekst(opvulling)}`;
    const LOKAAL = { GITHUB_ACTIONS: '' };

    function gekrompen(): string {
      const dir = repo({ 'docs/framework.md': BOEK(10_000), 'docs/normen-vervallen.md': LIJST_KOP });
      git(dir, 'commit', '-qm', 'basis');
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(node(dir, ['scripts/kit/ratchet.mjs', '--update']).status).toBe(0);
      git(dir, 'commit', '-qam', 'baseline');
      writeFileSync(path.join(dir, 'docs/framework.md'), BOEK(4000));
      git(dir, 'commit', '-qam', 'krimp');
      return dir;
    }

    test('leesbudget/AC-6 ratchet: krimp zonder inventaris is rood, ook na ratchet --update', () => {
      const dir = gekrompen();
      const r = node(dir, ['scripts/kit/ratchet.mjs']);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('docs/framework.md');
      expect(node(dir, ['scripts/kit/ratchet.mjs', '--update']).status).toBe(0);
      expect(node(dir, ['scripts/kit/ratchet.mjs']).status).toBe(1);
    });

    test('leesbudget/AC-6 ratchet: krimp met een nieuwe regel in de lijst is groen', () => {
      const dir = gekrompen();
      schrijf(dir, { 'docs/normen-vervallen.md': INVENTARIS('docs/framework.md') });
      git(dir, 'add', '-A');
      git(dir, 'commit', '-qm', 'inventaris');
      const r = node(dir, ['scripts/kit/ratchet.mjs']);
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
    });

    test('leesbudget/AC-6 ratchet: een regel uit een eerdere PR dekt geen nieuwe krimp', () => {
      const dir = repo({
        'docs/framework.md': BOEK(10_000),
        'docs/normen-vervallen.md': INVENTARIS('docs/framework.md'),
      });
      git(dir, 'commit', '-qm', 'basis met oude inventaris');
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(node(dir, ['scripts/kit/ratchet.mjs', '--update']).status).toBe(0);
      git(dir, 'commit', '-qam', 'baseline');
      writeFileSync(path.join(dir, 'docs/framework.md'), BOEK(4000));
      git(dir, 'commit', '-qam', 'krimp zonder nieuwe regel');
      expect(node(dir, ['scripts/kit/ratchet.mjs']).status).toBe(1);
    });

    test('leesbudget/AC-6 ratchet: een Normeninventaris in een ander bestand telt niet meer', () => {
      const dir = gekrompen();
      schrijf(dir, { 'docs/notities.md': '# PR\n\n## Normeninventaris\n\n- regel over X → R-DOC-01\n' });
      git(dir, 'add', '-A');
      git(dir, 'commit', '-qm', 'inventaris op de oude plek');
      expect(node(dir, ['scripts/kit/ratchet.mjs']).status).toBe(1);
    });

    test('leesbudget/AC-6 zonder origin/main: lokaal een melding, geen overtreding', () => {
      const dir = repo({ 'docs/framework.md': BOEK(10_000) });
      git(dir, 'commit', '-qm', 'basis');
      const r = node(dir, ['scripts/kit/ratchet.mjs'], LOKAAL);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('geen merge-base met origin/main');
    });
  },
);

type Pr = {
  nummer: number;
  ciRood: number | 'onbekend';
  codex: number | 'onbekend';
  reviewrondes: number | 'onbekend';
};

/** `aantal` PR's, nieuwste eerst; de nieuwste tien krijgen `nieuw`, de rest `oud`. */
function prs(aantal: number, nieuw: Partial<Pr>, oud: Partial<Pr> = {}): Pr[] {
  return Array.from({ length: aantal }, (_x, i) => ({
    nummer: 500 - i,
    ciRood: 0,
    codex: 0,
    reviewrondes: 1,
    ...(i < 10 ? nieuw : oud),
  }));
}

async function trend(lijst: Pr[]): Promise<{ uit: unknown; meldingen: string[] }> {
  const fn = await functie('scripts/kit/meting-trend.mjs', 'trend');
  const uit = fn(lijst);
  const meldingen = veld(uit, 'meldingen');
  return { uit, meldingen: Array.isArray(meldingen) ? meldingen.map(String) : [] };
}

describe("leesbudget/AC-7: meting --trend over twintig gemergde PR's", () => {
  test.each([
    ['CI-rood', { nieuw: { ciRood: 2 }, oud: { ciRood: 1 }, sleutel: 'ciRood' }],
    ['Codex-bevindingen', { nieuw: { codex: 3 }, oud: { codex: 0 }, sleutel: 'codex' }],
    ['reviewrondes', { nieuw: { reviewrondes: 3 }, oud: { reviewrondes: 1 }, sleutel: 'reviewrondes' }],
  ])('leesbudget/AC-7 %s hoger over de laatste tien: "let op: <maat> steeg"', async (maat, { nieuw, oud, sleutel }) => {
    const { uit, meldingen } = await trend(prs(20, nieuw, oud));
    expect(meldingen.filter((m) => m.startsWith(`let op: ${maat} steeg`))).toHaveLength(1);
    expect(meldingen).toHaveLength(1);
    expect(veld(uit, 'maten', sleutel, 'steeg')).toBe(true);
    expect(veld(uit, 'teWeinigData')).toBe(false);
  });

  test('leesbudget/AC-7 gelijk of lager: geen melding', async () => {
    expect((await trend(prs(20, { ciRood: 1, codex: 1 }, { ciRood: 1, codex: 2 }))).meldingen).toStrictEqual([]);
  });

  test('leesbudget/AC-7 gemiddelden over tien tegenover de tien daarvoor', async () => {
    const lijst = prs(20, {}, {}).map((p, i) => ({ ...p, ciRood: i === 0 ? 5 : i === 15 ? 2 : 0 }));
    const { uit } = await trend(lijst);
    expect(veld(uit, 'maten', 'ciRood', 'laatste')).toBe(0.5);
    expect(veld(uit, 'maten', 'ciRood', 'vorige')).toBe(0.2);
  });

  test("leesbudget/AC-7 minder dan twintig PR's: te weinig data, geen melding", async () => {
    const { uit, meldingen } = await trend(prs(19, { ciRood: 9 }));
    expect(veld(uit, 'teWeinigData')).toBe(true);
    expect(meldingen).toStrictEqual([]);
  });

  // Telt een implementatie alle 25 (tien tegenover vijftien), dan daalt het oude gemiddelde en volgt een melding.
  test('leesbudget/AC-7 meer dan twintig: alleen de nieuwste twintig tellen', async () => {
    const lijst = prs(25, { ciRood: 1 }, { ciRood: 1 }).map((p, i) => (i >= 20 ? { ...p, ciRood: 0 } : p));
    expect((await trend(lijst)).meldingen).toStrictEqual([]);
  });

  test('leesbudget/AC-7 reviewrondes zonder meetdata: "onbekend", nooit 0, geen melding', async () => {
    const { uit, meldingen } = await trend(prs(20, { reviewrondes: 'onbekend' }, { reviewrondes: 'onbekend' }));
    expect(veld(uit, 'maten', 'reviewrondes', 'laatste')).toBe('onbekend');
    expect(veld(uit, 'maten', 'reviewrondes', 'vorige')).toBe('onbekend');
    expect(meldingen).toStrictEqual([]);
  });

  test('leesbudget/AC-7 telCodex telt alleen reacties van CODEX_LOGIN', async () => {
    const login = (await laad('scripts/kit/meting-trend.mjs'))?.['CODEX_LOGIN'];
    expect(login).toBe('chatgpt-codex-connector[bot]');
    const tel = await functie('scripts/kit/meting-trend.mjs', 'telCodex');
    const reacties = [login, 'iemand', login, 'github-actions[bot]'].map((l) => ({ user: { login: l } }));
    expect(tel(reacties)).toBe(2);
  });
});

/**
 * Nep-gh (node): logt elke aanroep; `api …/pulls?state=closed` geeft `aantal` gemergde PR's plus één gesloten zonder
 * merge, `run list` twee rode runs voor de nieuwste tien.
 */
function nepGh(aantal: number): { gh: string; log: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'leesbudget-gh-'));
  dirs.push(dir);
  const log = path.join(dir, 'log');
  const prLijst = [
    ...Array.from({ length: aantal }, (_x, i) => ({
      number: 500 - i,
      head: { ref: `b${String(500 - i)}` },
      merged_at: '2026-10-20T10:00:00Z',
    })),
    { number: 400, head: { ref: 'dicht' }, merged_at: null },
  ];
  const body = `const a = process.argv.slice(2); require('node:fs').appendFileSync(${JSON.stringify(log)}, a.join(' ') + '\\n');
const prs = ${JSON.stringify(prLijst)};
const b = (a.find((x) => x.startsWith('--branch=')) ?? '').slice(9) || a[a.indexOf('--branch') + 1] || a[a.indexOf('-b') + 1] || '';
const nieuw = prs.slice(0, 10).some((p) => p.head.ref === b);
const run = (c) => ({ databaseId: 1, conclusion: c, status: 'completed', headBranch: b, createdAt: '2026-10-20T09:00:00Z' });
let uit = '[]';
if (a[0] === 'api' && a[1].includes('/pulls?')) uit = JSON.stringify(prs);
else if (a[0] === 'run' && a[1] === 'list') uit = JSON.stringify(nieuw ? [run('failure'), run('failure'), run('success')] : [run('success')]);
process.stdout.write(uit);`;
  const gh = path.join(dir, 'gh');
  writeFileSync(gh, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(gh, 0o755);
  return { gh, log };
}

describe('leesbudget/AC-7: pnpm meting --trend als proces', { timeout: 60_000 }, () => {
  function trendCli(aantal: number) {
    const { gh, log } = nepGh(aantal);
    const metingDir = mkdtempSync(path.join(tmpdir(), 'leesbudget-meting-'));
    dirs.push(metingDir);
    const r = node(root, ['scripts/kit/meting.mjs', '--trend'], { METING_GH: gh, METING_DIR: metingDir });
    return { ...r, aanroepen: existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [] };
  }

  test('leesbudget/AC-7 CI-rood steeg: melding, exit 0, reviewrondes onbekend zonder meetdata', () => {
    const r = trendCli(20);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^let op: CI-rood steeg/m);
    expect(r.stdout).toMatch(/reviewrondes[^\n]*onbekend/);
    expect(r.stdout).not.toMatch(/let op: reviewrondes steeg/);
  });

  test("leesbudget/AC-7 meet nooit meer dan twintig PR's", () => {
    const r = trendCli(20);
    // GEWIJZIGD (L4): de lijst komt via REST in plaats van `gh pr list` (GraphQL, geweigerd in cloudsessies).
    expect(r.aanroepen.filter((a) => a.startsWith('pr '))).toStrictEqual([]);
    const prList = r.aanroepen.filter((a) => a.startsWith('api ') && a.includes('/pulls?'));
    expect(prList).toHaveLength(1);
    expect(prList[0]).toContain('state=closed');
    expect(prList[0]).toContain('sort=updated');
    expect(prList[0]).toContain('--jq');
    expect(prList[0]).toContain('per_page=100');
    expect(prList[0]).not.toContain('--paginate');
    const comments = r.aanroepen.filter((a) => a.startsWith('api ') && a.includes('/comments'));
    expect(comments.length).toBeGreaterThan(0);
    expect(comments.length).toBeLessThanOrEqual(20);
    const runList = r.aanroepen.filter((a) => a.startsWith('run list'));
    expect(runList.length).toBeGreaterThan(0);
    expect(runList.length).toBeLessThanOrEqual(20);
  });

  test('leesbudget/AC-7 minder dan twintig gemergde PR\'s: "te weinig data", exit 0', () => {
    const r = trendCli(19);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('te weinig data');
    expect(r.stdout).not.toContain('let op');
  });
});
