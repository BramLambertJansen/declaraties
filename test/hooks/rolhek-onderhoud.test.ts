import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// ADR 0033 punt 2 tot 4 (contract B1 tot en met B3): de modus `onderhoud` (alleen in de template-repo) behandelt `voorReview` voor
// de hoofdsessie en de developer zoals de andere gate-paden, behalve de paden in `altijdVragen`. Al het andere blijft zoals het is.
const ROOT = '/repo';
const ROLHEK_SCRIPT = path.join(process.cwd(), 'rails/hooks/rolhek.mjs');
const REPOSITORY = 'BramLambertJansen/template';
const ALTIJD_VRAGEN = [
  '.github/**',
  '.claude/hooks/**',
  '.claude/settings.json',
  '.claude/gates.json',
  '.claude/decisions.json',
  'package.json',
  'pnpm-lock.yaml',
];

const echte = (): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));
  return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
};
// De echte configuratie zonder de twee nieuwe sleutels, zodat elke test ze zelf zet (de echte krijgt ze pas met de implementatie).
const kaal = () =>
  Object.fromEntries(Object.entries(echte()).filter(([naam]) => naam !== 'onderhoud' && naam !== 'altijdVragen'));
const withKeys = (extra: Record<string, unknown>) => JSON.stringify({ ...kaal(), ...extra });

// ---------- B1: loadConfig ----------

describe('B1: loadConfig leest onderhoud en altijdVragen', () => {
  test('B1: een geldige onderhoud en altijdVragen komen in de configuratie', () => {
    const config = loadConfig(withKeys({ onderhoud: { repository: REPOSITORY }, altijdVragen: ALTIJD_VRAGEN }));

    expect(config).toMatchObject({ onderhoud: { repository: REPOSITORY }, altijdVragen: ALTIJD_VRAGEN });
  });

  test('B1: beide sleutels zijn optioneel: zonder ze geeft loadConfig geen fout en geen onderhoud', () => {
    const config = loadConfig(JSON.stringify(kaal()));

    expect([Reflect.get(config, 'onderhoud'), Reflect.get(config, 'altijdVragen')]).toStrictEqual([
      undefined,
      undefined,
    ]);
  });

  test.each([
    { naam: 'een tekst', onderhoud: 'BramLambertJansen/template' },
    { naam: 'een lijst', onderhoud: [REPOSITORY] },
    { naam: 'null', onderhoud: null },
    { naam: 'een getal', onderhoud: 1 },
    { naam: 'repository geen tekst', onderhoud: { repository: 1 } },
    { naam: 'repository ontbreekt', onderhoud: {} },
    { naam: 'extra sleutels', onderhoud: { repository: REPOSITORY, extra: true } },
  ])('B1: onderhoud als $naam: loadConfig gooit', ({ onderhoud }) => {
    expect(() => loadConfig(withKeys({ onderhoud }))).toThrow(/onderhoud/);
  });

  test.each([
    { naam: 'een tekst', altijdVragen: '.github/**' },
    { naam: 'een lijst met een getal', altijdVragen: ['.github/**', 1] },
    { naam: 'een object', altijdVragen: { pad: '.github/**' } },
    { naam: 'null', altijdVragen: null },
  ])('B1: altijdVragen als $naam: loadConfig gooit', ({ altijdVragen }) => {
    expect(() => loadConfig(withKeys({ altijdVragen }))).toThrow(/altijdVragen/);
  });
});

// ---------- B3: decide() ----------

const FILES: Record<string, string> = {
  'docs/framework.md': '# Framework\n',
  'package.json': JSON.stringify({ name: 'x', scripts: { lint: 'eslint .' }, dependencies: { a: '1' } }, null, 2),
  'db/migrations/20261009000000_baseline.sql': 'create table a();',
  'src/api/routes/a.test.ts': "test('a', () => {});\ntest('b', () => {});\n",
  'test/rails/fixtures/secdef/goed.sql': 'create function f() returns void;\n',
};

const conMetAltijd = loadConfig(withKeys({ onderhoud: { repository: REPOSITORY }, altijdVragen: ALTIJD_VRAGEN }));
const zonderAltijd = loadConfig(withKeys({ onderhoud: { repository: REPOSITORY } }));

type Modus = boolean | undefined;
const basis = {
  root: ROOT,
  cwd: ROOT,
  read: (rel: string) => FILES[rel] ?? null,
  committed: (rel: string) => rel in FILES,
  isDir: () => false,
  branch: 'feat/x',
};
// Een variabele, geen letterlijke: Ctx kent `onderhoud` pas na de implementatie en een letterlijke zou een typefout geven.
const ctxVoor = (config: typeof conMetAltijd, onderhoud: Modus) => ({
  ...basis,
  config,
  ...(onderhoud === undefined ? {} : { onderhoud }),
});

function run(payload: unknown, onderhoud: Modus, config = conMetAltijd) {
  const ctx = ctxVoor(config, onderhoud);
  return decide(payload, ctx);
}

type Verdict = 'allow' | 'ask' | 'deny' | 'context';
function verdict(payload: unknown, onderhoud: Modus, config = conMetAltijd): Verdict {
  const decision = run(payload, onderhoud, config);
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const as = (agent: string | undefined) => (agent === undefined ? {} : { agent_type: agent });
const bash = (command: string, agent?: string) => ({ tool_name: 'Bash', tool_input: { command }, ...as(agent) });
const write = (file: string, content: string, agent?: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: `${ROOT}/${file}`, content },
  ...as(agent),
});
const edit = (file: string, [from, to]: [string, string], agent?: string) => ({
  tool_name: 'Edit',
  tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to },
  ...as(agent),
});

const IN_VOOR_REVIEW_NIET_ALTIJD = [
  'scripts/kit/x.mjs',
  'rails/hooks/lib/x.mjs',
  'docs/framework.md',
  '.claude/agents/x.md',
];
const ALTIJD = [
  '.claude/hooks/rolhek.mjs',
  '.claude/hooks/lib/x.mjs',
  '.claude/gates.json',
  '.claude/settings.json',
  '.claude/decisions.json',
  '.github/workflows/x.yml',
  'pnpm-lock.yaml',
];
const ROLLEN = [undefined, 'developer'] as const;

describe('B3: onderhoud aan, voorReview buiten altijdVragen: geen ask en geen deny, wel een melding', () => {
  test.each(IN_VOOR_REVIEW_NIET_ALTIJD.flatMap((file) => ROLLEN.map((agent) => [file, agent] as const)))(
    'B3: Write %s (%s)',
    (file, agent) => {
      const decision = run(write(file, 'x', agent), true);

      expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
      expect(decision.context.join('\n')).toMatch(/onderhoud/i);
    },
  );

  test.each(ROLLEN)('B3: Edit op een bestaand bestand (docs/framework.md, %s)', (agent) => {
    const decision = run(edit('docs/framework.md', ['# Framework', '# Kader'], agent), true);

    expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
    expect(decision.context.join('\n')).toMatch(/onderhoud/i);
  });
});

describe('B3: onderhoud aan, pad in altijdVragen: zoals nu (hoofdsessie ask, developer deny)', () => {
  test.each(ALTIJD)('B3: %s', (file) => {
    expect([verdict(write(file, 'x'), true), verdict(write(file, 'x', 'developer'), true)]).toStrictEqual([
      'ask',
      'deny',
    ]);
  });

  test('B3: package.json: een wijziging van scripts blijft een gate (jsonGates), ook in onderhoud', () => {
    const payload = (agent?: string) => edit('package.json', ['"lint": "eslint ."', '"lint": "true"'], agent);

    expect([verdict(payload(), true), verdict(payload('developer'), true)]).toStrictEqual(['ask', 'deny']);
  });

  test('B3: package.json: een wijziging van een dependency blijft toegestaan zoals nu (jsonGates handelt af)', () => {
    const payload = edit('package.json', ['"a": "1"', '"a": "2"']);

    expect(verdict(payload, true)).toBe(verdict(payload, false));
  });
});

describe('B3: altijdVragen ontbreekt of de modus staat uit: elke voorReview-gate blijft zoals nu', () => {
  test.each(IN_VOOR_REVIEW_NIET_ALTIJD)(
    'B3: zonder altijdVragen faalt %s dicht (hoofdsessie ask, developer deny)',
    (file) => {
      expect([
        verdict(write(file, 'x'), true, zonderAltijd),
        verdict(write(file, 'x', 'developer'), true, zonderAltijd),
      ]).toStrictEqual(['ask', 'deny']);
    },
  );

  test.each(ALTIJD)('B3: zonder altijdVragen ook %s (hoofdsessie ask, developer deny)', (file) => {
    expect([
      verdict(write(file, 'x'), true, zonderAltijd),
      verdict(write(file, 'x', 'developer'), true, zonderAltijd),
    ]).toStrictEqual(['ask', 'deny']);
  });

  test.each([false, undefined] as const)(
    'B3: onderhoud %s: voorReview-pad buiten altijdVragen is ask/deny, ook mét altijdVragen',
    (modus) => {
      for (const file of [...IN_VOOR_REVIEW_NIET_ALTIJD, ...ALTIJD])
        expect(
          [verdict(write(file, 'x'), modus), verdict(write(file, 'x', 'developer'), modus)],
          `${file} (modus ${String(modus)})`,
        ).toStrictEqual(['ask', 'deny']);
    },
  );

  test.each([false, undefined] as const)('B3: onderhoud %s: geen melding over onderhoud', (modus) => {
    const decision = run(write('docs/framework.md', 'x'), modus);

    expect(decision.context.join('\n')).not.toMatch(/onderhoud/i);
  });
});

describe('B3: ongewijzigd, ook in onderhoud', () => {
  test.each(['onbekend', 'iets-anders'])(
    'B3: een onbekende subagent (%s) krijgt deny op een voorReview-pad buiten altijdVragen',
    (agent) => {
      expect(verdict(write('scripts/kit/x.mjs', 'x', agent), true)).toBe('deny');
    },
  );

  test.each([
    { agent: 'tester', file: 'scripts/kit/x.mjs', expected: 'deny' },
    { agent: 'tester', file: 'docs/framework.md', expected: 'deny' },
    { agent: 'tester', file: 'src/api/routes/b.test.ts', expected: 'allow' },
    { agent: 'reviewer', file: 'scripts/kit/x.mjs', expected: 'deny' },
    { agent: 'reviewer', file: 'docs/framework.md', expected: 'deny' },
    { agent: 'architect', file: 'docs/framework.md', expected: 'deny' },
    { agent: 'architect', file: 'rails/hooks/lib/x.mjs', expected: 'deny' },
    { agent: 'architect', file: 'docs/adr/0099-x.md', expected: 'allow' },
    { agent: 'docs', file: 'scripts/kit/x.mjs', expected: 'deny' },
    { agent: 'docs', file: 'docs/framework.md', expected: 'deny' },
    { agent: 'docs', file: 'docs/reviews/x.md', expected: 'allow' },
  ])('B3: $agent schrijft $file: $expected (schrijfrecht)', ({ agent, file, expected }) => {
    expect(verdict(write(file, 'x', agent), true)).toBe(expected);
  });

  test.each([
    { name: 'gecommitte migratie wijzigen', payload: edit('db/migrations/20261009000000_baseline.sql', ['a', 'b']) },
    { name: 'gegenereerd bestand schrijven', payload: write('src/api/db/schema.ts', 'x') },
  ])('B3: $name: deny voor hoofdsessie en developer', ({ payload }) => {
    expect([verdict(payload, true), verdict({ ...payload, agent_type: 'developer' }, true)]).toStrictEqual([
      'deny',
      'deny',
    ]);
  });

  test.each([
    { name: 'bestaande test verwijderen', payload: bash('rm src/api/routes/a.test.ts') },
    { name: 'testgevallen weghalen', payload: write('src/api/routes/a.test.ts', "test('a', () => {});\n") },
    { name: 'fixture wijzigen', payload: edit('test/rails/fixtures/secdef/goed.sql', ['void', 'int']) },
  ])('B3: $name: hoofdsessie vraagt, developer weigert', ({ payload }) => {
    expect([verdict(payload, true), verdict({ ...payload, agent_type: 'developer' }, true)]).toStrictEqual([
      'ask',
      'deny',
    ]);
  });

  test.each([
    'git push origin main',
    'git push origin HEAD:main',
    'git push --force origin feat/x',
    'git commit --no-verify -m x',
    'gh pr merge 12',
    'gh pr edit 12 --add-label gate-wijziging',
  ])('B3: Bash %s: deny voor hoofdsessie en developer (rolhek ghForbidden en git-regels)', (command) => {
    expect([verdict(bash(command), true), verdict(bash(command, 'developer'), true)]).toStrictEqual(['deny', 'deny']);
  });
});

// ---------- B2: het rolhek-script zet onderhoud alleen met een vertrouwde sleutel en een passende origin ----------

const dirs: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function tmp(prefix: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function write2(dir: string, rel: string, content: string) {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), content);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const GATES = (extra: Record<string, unknown>) => JSON.stringify({ ...kaal(), ...extra }, null, 2);
const MET_ONDERHOUD = GATES({ onderhoud: { repository: REPOSITORY }, altijdVragen: ALTIJD_VRAGEN });
const ZONDER_ONDERHOUD = GATES({ altijdVragen: ALTIJD_VRAGEN });

interface Opzet {
  /** gates.json op origin/main (de eerste commit) */
  origin: string;
  /** de url van remote origin na het pushen naar de lokale bare repo */
  url: string;
  /** gates.json van het anker (een tweede commit); zonder: geen anker */
  anker?: string;
  /** gates.json in de werkmap, ongecommit */
  werk?: string;
}

/** Repo met een lokale bare remote; de url die rolhek ziet wordt achteraf gezet, zodat er geen netwerk nodig is. */
function scriptRepo(opzet: Opzet) {
  const dir = tmp('onderhoud-repo-');
  git(dir, 'init', '-q', '-b', 'main');
  write2(dir, '.claude/gates.json', opzet.origin);
  write2(dir, 'README.md', 'x\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'origin');
  const bare = tmp('onderhoud-bare-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', bare);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  git(dir, 'remote', 'set-url', 'origin', opzet.url);
  git(dir, 'switch', '-q', '-c', 'feat/x');
  if (opzet.anker !== undefined) {
    write2(dir, '.claude/gates.json', opzet.anker);
    git(dir, 'commit', '-q', '--allow-empty', '-am', 'anker');
  }
  const anker = git(dir, 'rev-parse', 'HEAD');
  if (opzet.werk !== undefined) write2(dir, '.claude/gates.json', opzet.werk);
  return { dir, anker };
}

function runRolhek(dir: string, file: string, ankerSha?: string) {
  const payload = { tool_name: 'Write', tool_input: { file_path: `${dir}/${file}`, content: 'x\n' }, cwd: dir };
  const env: Record<string, string | undefined> = { ...process.env, ...GIT_ENV, CLAUDE_PROJECT_DIR: dir };
  delete env['RAILS_ANKER'];
  if (ankerSha !== undefined) env['RAILS_ANKER'] = ankerSha;
  const result = spawnSync('node', [ROLHEK_SCRIPT], { input: JSON.stringify(payload), encoding: 'utf8', env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

type Uitkomst = 'onderhoud' | 'ask' | 'anders';
/** Het script op een voorReview-pad buiten altijdVragen: onderhoud geeft een melding zonder ask, anders vraagt de hoofdsessie. */
function uitkomst(result: ReturnType<typeof runRolhek>): Uitkomst {
  if (result.status !== 0) return 'anders';
  if (result.stdout.includes('"permissionDecision":"ask"')) return 'ask';
  return /onderhoud/i.test(result.stdout) ? 'onderhoud' : 'anders';
}

const VRIJ_PAD = 'scripts/kit/x.mjs';
const HTTPS = `https://github.com/${REPOSITORY}.git`;

describe('B2: het script zet onderhoud aan bij een vertrouwde sleutel en een gelijke origin', () => {
  test.each([
    { naam: 'https-url', url: HTTPS },
    { naam: 'https-url zonder .git', url: `https://github.com/${REPOSITORY}` },
    { naam: 'ssh-url (scp-vorm)', url: `git@github.com:${REPOSITORY}.git` },
    { naam: 'ssh-url (ssh://)', url: `ssh://git@github.com/${REPOSITORY}.git` },
    { naam: 'andere hoofdletters', url: `https://github.com/${REPOSITORY.toUpperCase()}.git` },
    { naam: 'kleine letters', url: `https://github.com/${REPOSITORY.toLowerCase()}.git` },
  ])(
    'B2: aan bij gelijke repository ($naam): voorReview-pad buiten altijdVragen geeft een melding, geen ask',
    ({ url }) => {
      const { dir } = scriptRepo({ origin: MET_ONDERHOUD, url });

      expect(uitkomst(runRolhek(dir, VRIJ_PAD))).toBe('onderhoud');
    },
  );

  test('B2: aan: een pad in altijdVragen blijft een ask', () => {
    const { dir } = scriptRepo({ origin: MET_ONDERHOUD, url: HTTPS });

    expect(uitkomst(runRolhek(dir, '.github/workflows/x.yml'))).toBe('ask');
  });

  test('B2: aan in de config van origin/main én hoofdletterongevoelig tegen de sleutel (sleutel met andere hoofdletters)', () => {
    const origin = GATES({ onderhoud: { repository: REPOSITORY.toLowerCase() }, altijdVragen: ALTIJD_VRAGEN });
    const { dir } = scriptRepo({ origin, url: HTTPS });

    expect(uitkomst(runRolhek(dir, VRIJ_PAD))).toBe('onderhoud');
  });

  test('B2: uit bij een andere origin (een app uit de template)', () => {
    const { dir } = scriptRepo({ origin: MET_ONDERHOUD, url: 'https://github.com/acme/app.git' });

    expect(uitkomst(runRolhek(dir, VRIJ_PAD))).toBe('ask');
  });

  test('B2: uit als de sleutel alleen in de werkmap-gates.json staat (origin/main heeft hem niet)', () => {
    const { dir } = scriptRepo({ origin: ZONDER_ONDERHOUD, url: HTTPS, werk: MET_ONDERHOUD });

    expect(uitkomst(runRolhek(dir, VRIJ_PAD))).toBe('ask');
  });

  test('B2: uit zonder sleutel', () => {
    const { dir } = scriptRepo({ origin: ZONDER_ONDERHOUD, url: HTTPS });

    expect(uitkomst(runRolhek(dir, VRIJ_PAD))).toBe('ask');
  });

  test('B2: aan blijft aan als de werkmap-gates.json de sleutel weghaalt (de werkmap telt niet)', () => {
    const { dir } = scriptRepo({ origin: MET_ONDERHOUD, url: HTTPS, werk: ZONDER_ONDERHOUD });

    expect(uitkomst(runRolhek(dir, VRIJ_PAD))).toBe('onderhoud');
  });
});

describe('B2: met RAILS_ANKER komt de sleutel uit het anker, niet uit origin/main of de werkmap', () => {
  test('B2: sleutel in het anker, niet in origin/main of werkmap: aan', () => {
    const { dir, anker } = scriptRepo({
      origin: ZONDER_ONDERHOUD,
      url: HTTPS,
      anker: MET_ONDERHOUD,
      werk: ZONDER_ONDERHOUD,
    });

    expect(uitkomst(runRolhek(dir, VRIJ_PAD, anker))).toBe('onderhoud');
  });

  test('B2: sleutel in origin/main en werkmap, niet in het anker: uit', () => {
    const { dir, anker } = scriptRepo({
      origin: MET_ONDERHOUD,
      url: HTTPS,
      anker: ZONDER_ONDERHOUD,
      werk: MET_ONDERHOUD,
    });

    expect(uitkomst(runRolhek(dir, VRIJ_PAD, anker))).toBe('ask');
  });

  test('B2: sleutel in het anker maar een andere origin (een app): uit', () => {
    const { dir, anker } = scriptRepo({
      origin: MET_ONDERHOUD,
      url: 'https://github.com/acme/app.git',
      anker: MET_ONDERHOUD,
    });

    expect(uitkomst(runRolhek(dir, VRIJ_PAD, anker))).toBe('ask');
  });

  test('B2: met anker blijft een pad in altijdVragen een ask', () => {
    const { dir, anker } = scriptRepo({ origin: ZONDER_ONDERHOUD, url: HTTPS, anker: MET_ONDERHOUD });

    expect(uitkomst(runRolhek(dir, '.claude/hooks/rolhek.mjs', anker))).toBe('ask');
  });
});
