import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

// Het overzicht scripts/kit/meting.mjs (`pnpm meting`) als proces, met METING_DIR op een tijdelijke map (ADR 0029 punt 12).
const root = process.cwd();

type Regel = { t?: string; m?: string; e: string; s?: string; b?: string; k?: string; id?: string; tool?: string };

function map(bestanden: Record<string, (Regel | string)[]>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'meting-overzicht-'));
  for (const [naam, regels] of Object.entries(bestanden))
    writeFileSync(
      path.join(dir, `${naam}.jsonl`),
      regels
        .map((regel) =>
          typeof regel === 'string'
            ? regel
            : JSON.stringify({ t: '2026-10-15T10:00:00.000Z', a: 'hoofdsessie', ...regel }),
        )
        .join('\n') + '\n',
    );
  return dir;
}

// Nep-gh (node-script): `uit` is de stdout, `exit` de exitcode, `slaap` laat hem hangen (timeout).
function gh(gedrag: { uit?: string; exit?: number; slaap?: boolean }): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'meting-gh-')), 'gh');
  const body =
    gedrag.slaap === true
      ? 'setTimeout(() => {}, 60000);'
      : `process.stdout.write(${JSON.stringify(gedrag.uit ?? '[]')}); process.exit(${String(gedrag.exit ?? 0)});`;
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

const ghDrie = gh({
  uit: JSON.stringify([1, 2, 3].map((databaseId) => ({ databaseId, createdAt: '2026-10-15T10:05:00Z' }))),
});

function overzicht(dir: string, ...args: string[]) {
  return overzichtMet({ METING_DIR: dir, METING_GH: ghDrie }, root, ...args);
}

function overzichtMet(env: Record<string, string>, cwd: string, ...args: string[]) {
  const result = spawnSync('node', [path.join(root, 'scripts/kit/meting.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout };
}

function json(dir: string, ...args: string[]): Record<string, unknown> {
  const result = overzicht(dir, '--json', ...args);
  expect(result.status).toBe(0);
  const waarde: unknown = JSON.parse(result.stdout);
  return typeof waarde === 'object' && waarde !== null ? { ...waarde } : {};
}

function sessies(dir: string, ...args: string[]): [string, unknown][] {
  const { sessies: alle } = json(dir, ...args);
  return typeof alle === 'object' && alle !== null ? Object.entries(alle) : [];
}

function veld(waarde: unknown, naam: string): unknown {
  return typeof waarde === 'object' && waarde !== null
    ? Object.entries(waarde).find(([k]) => k === naam)?.[1]
    : undefined;
}

const s = (b: string, e: string, extra: Partial<Regel> = {}): Regel => ({ e, s: 'a', b, ...extra });

const sessieA: (Regel | string)[] = [
  s('main', 'UserPromptSubmit'),
  s('main', 'UserPromptSubmit'),
  s('main', 'UserPromptSubmit'),
  s('main', 'PermissionRequest', { tool: 'Bash', k: 'pnpm test:db' }),
  s('main', 'PermissionRequest', { tool: 'Bash', k: 'pnpm test:db' }),
  s('main', 'PermissionRequest', { tool: 'Edit', k: 'src/a.ts' }),
  s('main', 'PreToolUse', { id: 't1', tool: 'Bash', k: 'pnpm test:db' }),
  s('main', 'PostToolUse', { id: 't1', tool: 'Bash', k: 'pnpm test:db' }),
  s('main', 'PreToolUse', { id: 't2', tool: 'Edit', k: 'src/a.ts' }),
  s('main', 'PreToolUse', { id: 't3', tool: 'Bash', k: 'rm' }),
  s('main', 'PostToolUseFailure', { id: 't3', tool: 'Bash', k: 'rm' }),
  s('main', 'PermissionDenied', { tool: 'Bash', k: 'curl' }),
  s('main', 'PostToolUse', { id: 't4', tool: 'Bash', k: 'git push' }),
  s('main', 'PostToolUse', { id: 't5', tool: 'Bash', k: 'git push' }),
  s('main', 'Stop'),
  s('main', 'Stop'),
  'dit is geen json',
];

test('per sessie: prompts, weigeringen, beurten, eigenaarberichten en ci-rondes', () => {
  const dir = map({ a: sessieA });

  const uit = json(dir);

  expect(uit).toMatchObject({
    sessies: {
      a: {
        prompts: 3,
        promptsPerSleutel: { 'pnpm test:db': 2, 'src/a.ts': 1 },
        weigeringen: 2,
        weigeringenPerSleutel: { 'src/a.ts': 1, curl: 1 },
        beurten: 2,
        eigenaarberichten: 2,
        pushes: 2,
        ciRondes: 3,
      },
    },
  });
});

test('per branch binnen de sessie', () => {
  const dir = map({
    a: [
      s('x', 'UserPromptSubmit'),
      s('x', 'PermissionRequest', { k: 'git push' }),
      s('y', 'PermissionRequest', { k: 'pnpm lint' }),
      s('y', 'PermissionRequest', { k: 'pnpm lint' }),
      s('y', 'Stop'),
    ],
  });

  expect(json(dir)).toMatchObject({
    sessies: {
      a: {
        prompts: 3,
        branches: {
          x: { prompts: 1, beurten: 0 },
          y: { prompts: 2, promptsPerSleutel: { 'pnpm lint': 2 }, beurten: 1 },
        },
      },
    },
  });
});

test('eigenaarberichten: eerste bericht is de opdracht, minimum 0', () => {
  const dir = map({
    leeg: [{ e: 'Stop', s: 'leeg', b: 'm' }],
    een: [{ e: 'UserPromptSubmit', s: 'een', b: 'm' }],
    twee: [
      { e: 'UserPromptSubmit', s: 'twee', b: 'm' },
      { e: 'UserPromptSubmit', s: 'twee', b: 'm' },
    ],
  });

  expect(sessies(dir).map(([naam, v]) => [naam, veld(v, 'eigenaarberichten')])).toStrictEqual([
    ['een', 0],
    ['leeg', 0],
    ['twee', 1],
  ]);
});

test('weigering: PreToolUse zonder Post telt, een PermissionDenied telt, met Post niet', () => {
  const dir = map({
    a: [
      s('m', 'PreToolUse', { id: 'ok', k: 'a' }),
      s('m', 'PostToolUse', { id: 'ok', k: 'a' }),
      s('m', 'PreToolUse', { id: 'weg', k: 'b' }),
    ],
  });

  expect(json(dir)).toMatchObject({ sessies: { a: { weigeringen: 1, weigeringenPerSleutel: { b: 1 } } } });
});

test('filters --sessie en --branch', () => {
  const dir = map({
    a: [s('x', 'PermissionRequest', { k: 'k1' }), s('y', 'PermissionRequest', { k: 'k2' })],
    b: [{ e: 'PermissionRequest', s: 'b', b: 'x', k: 'k3' }],
  });

  expect(sessies(dir, '--sessie', 'b').map(([naam]) => naam)).toStrictEqual(['b']);
  expect(sessies(dir, '--branch', 'x').map(([naam, v]) => [naam, veld(v, 'prompts')])).toStrictEqual([
    ['a', 1],
    ['b', 1],
  ]);
});

test('zonder --json: korte tekstvorm met de sessie en de tellingen, geen json', () => {
  const dir = map({ a: sessieA });

  const result = overzicht(dir);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('a');
  expect(result.stdout).toContain('pnpm test:db');
  expect(() => {
    JSON.parse(result.stdout);
  }).toThrow();
});

test('lege of ontbrekende map: exit 0 en geen sessies', () => {
  const leeg = mkdtempSync(path.join(tmpdir(), 'meting-leeg-'));
  const ontbreekt = path.join(leeg, 'bestaat-niet');

  expect([json(leeg), json(ontbreekt)]).toStrictEqual([{ sessies: {} }, { sessies: {} }]);
});

const ciRegels = [
  s('x', 'PostToolUse', { id: 'p1', k: 'git push' }),
  s('y', 'PostToolUse', { id: 'p2', k: 'git push' }),
];

function ciUit(env: Record<string, string>, dir: string): unknown {
  const result = overzichtMet({ METING_DIR: dir, ...env }, root, '--json');
  expect(result.status).toBe(0);
  const waarde: unknown = JSON.parse(result.stdout);
  return waarde;
}

test('ciRondes: gh geslaagd geeft het aantal runs per branch en de som per sessie, pushes blijft lokaal', () => {
  const dir = map({ a: ciRegels });

  expect(ciUit({ METING_GH: ghDrie }, dir)).toMatchObject({
    sessies: {
      a: { pushes: 2, ciRondes: 6, branches: { x: { pushes: 1, ciRondes: 3 }, y: { pushes: 1, ciRondes: 3 } } },
    },
  });
});

test('ciRondes: gh geeft een lege lijst: 0', () => {
  const dir = map({ a: ciRegels });

  expect(ciUit({ METING_GH: gh({ uit: '[]' }) }, dir)).toMatchObject({ sessies: { a: { ciRondes: 0 } } });
});

test.each([
  ['niet-nul exit', { METING_GH: gh({ exit: 1 }) }],
  ['ongeldige json', { METING_GH: gh({ uit: 'geen json' }) }],
  ['gh niet gevonden', { METING_GH: '/bestaat/niet/gh' }],
  ['timeout', { METING_GH: gh({ slaap: true }), METING_GH_TIMEOUT_MS: '300' }],
])('ciRondes: %s geeft onbekend, ook per sessie; pushes blijft', (_naam, env) => {
  const dir = map({ a: ciRegels });

  expect(ciUit(env, dir)).toMatchObject({
    sessies: { a: { pushes: 2, ciRondes: 'onbekend', branches: { x: { ciRondes: 'onbekend' } } } },
  });
});

test('ciRondes: één onbekende branch maakt de sessie onbekend, de andere branch houdt zijn aantal', () => {
  const dir = map({ a: ciRegels });
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'meting-gh-')), 'gh');
  const body =
    'if (process.argv.includes(\'--branch=y\')) process.exit(1); process.stdout.write(\'[{"databaseId":1,"createdAt":"2026-10-15T10:05:00Z"}]\');';
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(file, 0o755);

  expect(ciUit({ METING_GH: file }, dir)).toMatchObject({
    sessies: { a: { ciRondes: 'onbekend', branches: { x: { ciRondes: 1 }, y: { ciRondes: 'onbekend' } } } },
  });
});

test('gh krijgt run list --branch=<branch> --json databaseId,createdAt --limit 200', () => {
  const dir = map({ a: [s('feat/z', 'Stop')] });
  const log = path.join(mkdtempSync(path.join(tmpdir(), 'meting-gh-')), 'args.txt');
  const file = path.join(path.dirname(log), 'gh');
  writeFileSync(
    file,
    `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(' '));process.stdout.write('[]');\n`,
  );
  chmodSync(file, 0o755);

  ciUit({ METING_GH: file }, dir);

  expect(readFileSync(log, 'utf8')).toBe('run list --branch=feat/z --json databaseId,createdAt --limit 200');
});

test('zonder METING_DIR leest het overzicht <cwd>/.git/agent-meting', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'meting-repo-'));
  mkdirSync(path.join(repo, '.git', 'agent-meting'), { recursive: true });
  writeFileSync(
    path.join(repo, '.git', 'agent-meting', 'a.jsonl'),
    `${JSON.stringify(s('m', 'PermissionRequest', { k: 'k1' }))}\n`,
  );

  const result = overzichtMet({ METING_DIR: '', METING_GH: ghDrie }, repo, '--json');

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ sessies: { a: { prompts: 1 } } });
});

test('branch die met - begint: onbekend zonder gh-aanroep', () => {
  const dir = map({ a: [s('-evil', 'Stop')] });
  const log = path.join(mkdtempSync(path.join(tmpdir(), 'meting-gh-')), 'aangeroepen');
  const file = path.join(path.dirname(log), 'gh');
  writeFileSync(
    file,
    `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(log)}, 'ja');process.stdout.write('[]');\n`,
  );
  chmodSync(file, 0o755);

  expect(ciUit({ METING_GH: file }, dir)).toMatchObject({
    sessies: { a: { ciRondes: 'onbekend', branches: { '-evil': { ciRondes: 'onbekend' } } } },
  });
  expect(existsSync(log)).toBe(false);
});

function ghRuns(createdAt: string[]): string {
  return gh({ uit: JSON.stringify(createdAt.map((c, i) => ({ databaseId: i + 1, createdAt: c }))) });
}

test('ciRondes: alleen runs binnen het sessievenster (eerste t tot laatste t + 60 minuten)', () => {
  const dir = map({
    a: [
      s('x', 'UserPromptSubmit', { t: '2026-10-15T10:00:00.000Z' }),
      s('x', 'Stop', { t: '2026-10-15T10:30:00.000Z' }),
    ],
  });
  const runs = ghRuns([
    '2026-10-14T09:00:00Z',
    '2026-10-15T09:59:00Z',
    '2026-10-15T10:10:00Z',
    '2026-10-15T11:25:00Z',
    '2026-10-15T11:31:00Z',
    '2026-10-16T10:00:00Z',
  ]);

  expect(ciUit({ METING_GH: runs }, dir)).toMatchObject({
    sessies: { a: { ciRondes: 2, branches: { x: { ciRondes: 2 } } } },
  });
});

test('ciRondes: runs buiten het venster tellen niet, ook als de lijst verder leeg is', () => {
  const dir = map({ a: [s('x', 'Stop', { t: '2026-10-15T10:00:00.000Z' })] });

  expect(ciUit({ METING_GH: ghRuns(['2026-10-01T10:00:00Z', '2026-10-20T10:00:00Z']) }, dir)).toMatchObject({
    sessies: { a: { ciRondes: 0 } },
  });
});

function eigenSleutels(waarde: unknown): string[] {
  return typeof waarde === 'object' && waarde !== null ? Object.keys(waarde) : [];
}

test.each(['__proto__', 'constructor'])(
  'branchnaam %s telt gewoon mee, zonder crash of prototypevervuiling',
  (naam) => {
    const dir = map({
      a: [s(naam, 'PermissionRequest', { k: naam }), s(naam, 'PermissionRequest', { k: naam }), s('x', 'Stop')],
    });

    const uit = json(dir);
    const alleSessies = sessies(dir);
    const sessie = alleSessies[0]?.[1];
    const branches = veld(sessie, 'branches');
    const eigen: unknown = Object.getOwnPropertyDescriptor(Object(branches), naam)?.value;

    expect(uit).toHaveProperty('sessies');
    expect(eigenSleutels(branches).sort()).toStrictEqual([naam, 'x'].sort());
    expect(veld(eigen, 'prompts')).toBe(2);
    expect(veld(veld(sessie, 'promptsPerSleutel'), naam)).toBe(2);
    expect(Object.getOwnPropertyDescriptor(Object(veld(sessie, 'promptsPerSleutel')), naam)?.value).toBe(2);
    expect(overzicht(dir).status).toBe(0);
    expect(Object.prototype).not.toHaveProperty('prompts');
  },
);

test('pushes telt alleen k === "git push": git push --dry-run telt niet', () => {
  const dir = map({
    a: [
      s('x', 'PostToolUse', { k: 'git push' }),
      s('x', 'PostToolUse', { k: 'git push --dry-run' }),
      s('x', 'PostToolUse', { k: 'git push --dry-run' }),
    ],
  });

  expect(ciUit({ METING_GH: ghDrie }, dir)).toMatchObject({
    sessies: { a: { pushes: 1, branches: { x: { pushes: 1 } } } },
  });
});

test('tekstvorm toont per branch ook de promptsPerSleutel-sleutels', () => {
  const dir = map({
    a: [s('feat/een', 'PermissionRequest', { k: 'pnpm lint' }), s('feat/een', 'PermissionRequest', { k: 'pnpm lint' })],
  });

  const tekst = overzicht(dir).stdout;

  expect(tekst).toContain('feat/een');
  expect(tekst.split('pnpm lint').length - 1).toBeGreaterThanOrEqual(2);
});

// Meting per modus: `m` op een PermissionRequest-regel; ontbrekend telt als `onbekend`.
const modusRegels = (b: string): (Regel | string)[] => [
  s(b, 'PermissionRequest', { k: 'pnpm lint', m: 'default' }),
  s(b, 'PermissionRequest', { k: 'pnpm lint', m: 'default' }),
  ...[1, 2, 3, 4, 5].map((n) => s(b, 'PermissionRequest', { k: `k${String(n)}`, m: 'auto' })),
  s(b, 'PermissionRequest', { k: 'rm' }),
];

test('promptsPerModus per sessie: default 2, auto 5, ontbrekend onbekend', () => {
  const dir = map({ a: modusRegels('x') });

  expect(json(dir)).toMatchObject({
    sessies: { a: { prompts: 8, promptsPerModus: { default: 2, auto: 5, onbekend: 1 } } },
  });
});

test('promptsPerModus per branch binnen de sessie', () => {
  const dir = map({ a: [...modusRegels('x'), s('y', 'PermissionRequest', { k: 'git push', m: 'plan' })] });

  expect(json(dir)).toMatchObject({
    sessies: {
      a: {
        promptsPerModus: { default: 2, auto: 5, onbekend: 1, plan: 1 },
        branches: { x: { promptsPerModus: { default: 2, auto: 5, onbekend: 1 } }, y: { promptsPerModus: { plan: 1 } } },
      },
    },
  });
});

test('promptsPerModus telt alleen PermissionRequest, geen andere events', () => {
  const dir = map({
    a: [s('x', 'PreToolUse', { id: 't1', m: 'auto' }), s('x', 'Stop', { m: 'auto' })],
  });

  const sessie = sessies(dir)[0]?.[1];

  expect(veld(sessie, 'promptsPerModus')).toStrictEqual({});
});

test('tekstvorm noemt de modi met hun aantal', () => {
  const dir = map({ a: modusRegels('x') });

  const tekst = overzicht(dir).stdout;

  expect(tekst).toMatch(/default\D{0,5}2/);
  expect(tekst).toMatch(/auto\D{0,5}5/);
  expect(tekst).toContain('onbekend');
});
