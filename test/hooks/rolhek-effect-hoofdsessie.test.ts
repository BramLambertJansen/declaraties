import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { handle } from '../../rails/hooks/lib/effect-hooks.mjs';
import { gitIn } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { overtredingen } from '../../rails/hooks/lib/effect.mjs';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { inKooi } from '../../scripts/kit/kooi.mjs';

// Spec rolhek-vooraf-krimp AC-4 en AC-7: de hoofdsessie als dader op de werkmap (vlag `aan`) en in schaduwmodus (vlag
// `schaduw`), met de tellers in het meetbestand. Echte tijdelijke git-repository's; de commando's draaien in de kooi (ADR 0072).
const basis = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
type Modus = 'uit' | 'schaduw' | 'aan';
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const dirs: string[] = [];
let klok = 1_000_000;
let teller = 0;
let meetmap = '';

beforeEach(() => {
  meetmap = realpathSync(mkdtempSync(path.join(tmpdir(), 'rolhek-meting-')));
  dirs.push(meetmap);
  process.env['METING_DIR'] = meetmap;
});

afterEach(() => {
  delete process.env['METING_DIR'];
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sh(root: string, command: string): void {
  const result = inKooi(command, { werkmap: root, env: GIT_ENV });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}`);
}

function schrijf(root: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

function nieuweRepo(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'rolhek-hoofd-')));
  dirs.push(root);
  sh(root, 'git init -q -b main');
  schrijf(root, 'AGENTS.md', 'regels\n');
  schrijf(root, 'rails/x.mjs', 'x\n');
  schrijf(root, 'src/a.ts', 'a\n');
  schrijf(root, 'src/api/db/schema.ts', 'schema\n');
  sh(root, 'git add -A && git commit -qm start');
  return root;
}

function repoVan(root: string, modus: Modus, onderhoud = false) {
  const ctx = {
    root,
    cwd: root,
    config: { ...basis, rolhekEffectHoofdsessie: modus },
    read: (rel: string) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : null),
    committed: () => true,
    isDir: () => false,
    branch: 'main',
    ...(onderhoud ? { onderhoud: true } : {}),
  };
  return { root, git: gitIn(root), ctx, now: () => (klok += 1000) };
}

/**
 * PreToolUse, het commando in de kooi, PostToolUse van de hoofdsessie. `als` is het commando zoals de hook het ziet (een
 * generator die hier niet kan draaien, schrijft via `uitvoer` hetzelfde effect).
 */
function hoofd(
  root: string,
  opties: { commando: string; modus: Modus; uitvoer?: string; onderhoud?: boolean; rol?: string },
) {
  const repo = repoVan(root, opties.modus, opties.onderhoud);
  const id = `t${String((teller += 1))}`;
  const rol = opties.rol ?? '';
  const wie = rol === '' ? { session_id: 's1' } : { session_id: 's1', agent_type: rol, agent_id: `agent-${rol}` };
  const input = { ...wie, tool_name: 'Bash', tool_input: { command: opties.commando }, tool_use_id: id };
  handle('pre', input, repo);
  sh(root, opties.uitvoer ?? opties.commando);
  return handle('post', input, repo);
}

const isBlok = (u: { stdout?: string }) => (u.stdout ?? '').includes('"decision":"block"');
const paden = (root: string) => overtredingen(repoVan(root, 'aan')).map((o) => o.rel);

function meetregels(): Record<string, unknown>[] {
  return readdirSync(meetmap).flatMap((naam) =>
    readFileSync(path.join(meetmap, naam), 'utf8')
      .split('\n')
      .filter((regel) => regel !== '')
      .map((regel) => {
        const waarde: unknown = JSON.parse(regel);
        return typeof waarde === 'object' && waarde !== null ? Object.fromEntries(Object.entries(waarde)) : {};
      }),
  );
}

describe('rolhek-vooraf-krimp/AC-4: de hoofdsessie is dader op de werkmap (vlag aan)', () => {
  test('sed -i op AGENTS.md buiten onderhoud: een open overtreding, geen blokkade', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, { commando: "sed -i 's/regels/anders/' AGENTS.md", modus: 'aan' });
    expect(isBlok(uit)).toBe(false);
    expect(paden(root)).toStrictEqual(['AGENTS.md']);
  });

  test('/usr/bin/sed -i op src/api/db/schema.ts: een blokkade (gegenereerd)', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, { commando: "/usr/bin/sed -i 's/schema/x/' src/api/db/schema.ts", modus: 'aan' });
    expect(isBlok(uit)).toBe(true);
    expect(paden(root)).toStrictEqual(['src/api/db/schema.ts']);
  });

  test('pnpm db:generate (generatoren) schrijft src/api/db/schema.ts: niets', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, {
      commando: 'pnpm db:generate',
      uitvoer: 'echo nieuw > src/api/db/schema.ts',
      modus: 'aan',
    });
    expect([isBlok(uit), paden(root)]).toStrictEqual([false, []]);
  });

  test('node -e dat rails/x.mjs schrijft in onderhoudsmodus: een melding, niets op de lijst', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, {
      commando: `node -e "require('fs').writeFileSync('rails/x.mjs','y')"`,
      modus: 'aan',
      onderhoud: true,
    });
    expect(uit.stdout ?? '').toContain('additionalContext');
    expect(paden(root)).toStrictEqual([]);
  });

  test.each([
    ['git commit', 'echo b > rails/x.mjs && git add -A', 'git commit -qm x'],
    ['git add -A', 'echo b > rails/x.mjs', 'git add -A'],
    ['git checkout -b x <start>', 'git branch y', 'git checkout -q -b x y'],
    [
      'git merge (HEAD verschuift)',
      'git checkout -q -b z && echo b > rails/x.mjs && git commit -qam z && git checkout -q main',
      'git merge -q z',
    ],
    [
      'git rebase',
      'git checkout -q -b z && echo b > rails/x.mjs && git commit -qam z && git checkout -q main && git checkout -q -b w && echo c > src/a.ts && git commit -qam w',
      'git rebase -q z',
    ],
  ])('%s: niets', (_naam, voorbereiding, commando) => {
    const root = nieuweRepo();
    sh(root, voorbereiding);
    const uit = hoofd(root, { commando, modus: 'aan' });
    expect(uit.stdout ?? '').not.toContain('decision');
    expect(paden(root)).toStrictEqual([]);
  });

  test.each([
    ['git checkout <ref> -- <beschermd pad>', 'git checkout -q HEAD~1 -- rails/x.mjs'],
    ['git restore <beschermd pad>', 'git restore --source=HEAD~1 rails/x.mjs'],
  ])('%s: op de lijst', (_naam, commando) => {
    const root = nieuweRepo();
    sh(root, 'echo b > rails/x.mjs && git commit -qam b');
    const uit = hoofd(root, { commando, modus: 'aan' });
    expect(uit.stdout ?? '').not.toContain('decision');
    expect(paden(root)).toStrictEqual(['rails/x.mjs']);
  });

  test('git apply op een beschermd pad: op de lijst', () => {
    const root = nieuweRepo();
    sh(
      root,
      'echo b > rails/x.mjs && git diff > /tmp/p.patch && git checkout -q -- rails/x.mjs && mv /tmp/p.patch p.patch',
    );
    hoofd(root, { commando: 'git apply p.patch', modus: 'aan' });
    expect(paden(root)).toStrictEqual(['rails/x.mjs']);
  });

  test('hash-object -w, update-index --cacheinfo, checkout -- <pad>: op de lijst', () => {
    const root = nieuweRepo();
    sh(
      root,
      "blob=$(printf 'kwaad\\n' | git hash-object -w --stdin) && git update-index --cacheinfo 100644,$blob,rails/x.mjs",
    );
    hoofd(root, { commando: 'git checkout -- rails/x.mjs', modus: 'aan' });
    expect(paden(root)).toStrictEqual(['rails/x.mjs']);
  });

  function vensterEnStop(modus: Modus): string {
    const root = nieuweRepo();
    const repo = repoVan(root, modus);
    const agent = { session_id: 's1', agent_type: 'tester', agent_id: 'agent-tester' };
    handle('subagent-start', agent, repo);
    writeFileSync(path.join(root, 'rails/x.mjs'), 'van de hoofdsessie\n');
    const edit = { session_id: 's1', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'rails/x.mjs') } };
    handle('edit-post', edit, repo);
    return handle('subagent-stop', agent, repo).stdout ?? '';
  }

  test('met de vlag aan verklaart een venster van de hoofdsessie een pad van een subagent niet meer', () => {
    expect(vensterEnStop('aan')).toContain('"decision":"block"');
  });

  test('in schaduwmodus verklaart dat venster het pad nog, zoals vóór deze spec', () => {
    expect(vensterEnStop('schaduw')).toBe('');
  });
});

describe('rolhek-vooraf-krimp/AC-7: schaduwmodus en tellers', () => {
  test('schaduw: alleen een melding en een teller, geen open lijst', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, { commando: "sed -i 's/regels/anders/' AGENTS.md", modus: 'schaduw' });
    expect(isBlok(uit)).toBe(false);
    expect(uit.stdout ?? '').toContain('schaduw');
    expect(paden(root)).toStrictEqual([]);
    expect(meetregels().filter((r) => r['e'] === 'Schaduw')).toMatchObject([
      { e: 'Schaduw', a: 'hoofdsessie', vooraf: 'ask', achteraf: 'ask', paden: ['AGENTS.md'] },
    ]);
  });

  test('schaduw: een gewijzigd vrij pad geeft een teller met door, zonder melding', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, { commando: 'echo b > src/a.ts', modus: 'schaduw' });
    expect(uit).toStrictEqual({});
    expect(meetregels().filter((r) => r['e'] === 'Schaduw')).toMatchObject([
      { vooraf: 'door', achteraf: 'door', paden: [] },
    ]);
  });

  test('de schaduwregel bevat alleen uitkomst en paden, geen inhoud (R-ROL-09)', () => {
    const root = nieuweRepo();
    hoofd(root, { commando: "sed -i 's/regels/geheim-123/' AGENTS.md", modus: 'schaduw' });
    expect(JSON.stringify(meetregels())).not.toContain('geheim-123');
  });

  test('uit: geen toets en geen teller voor de hoofdsessie', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, { commando: "sed -i 's/regels/anders/' AGENTS.md", modus: 'uit' });
    expect([uit, paden(root), meetregels()]).toStrictEqual([{}, [], []]);
  });

  test('een blokkade op effect van een subagent wordt geteld', () => {
    const root = nieuweRepo();
    const repo = repoVan(root, 'schaduw');
    handle('subagent-start', { session_id: 's1', agent_type: 'tester', agent_id: 'agent-tester' }, repo);
    const uit = hoofd(root, { commando: 'echo y > rails/x.mjs', modus: 'schaduw', rol: 'tester' });
    expect(isBlok(uit)).toBe(true);
    expect(meetregels().filter((r) => r['e'] === 'EffectBlokkade')).toMatchObject([{ a: 'tester', n: 1 }]);
  });
});

describe('rolhek-vooraf-krimp/AC-4: randgevallen (review)', () => {
  test('git merge && sed -i AGENTS.md: alleen AGENTS.md op de lijst', () => {
    const root = nieuweRepo();
    sh(root, 'git checkout -q -b z && echo b > rails/x.mjs && git commit -qam z && git checkout -q main');
    hoofd(root, { commando: "git merge -q z && sed -i 's/regels/anders/' AGENTS.md", modus: 'aan' });
    expect(paden(root)).toStrictEqual(['AGENTS.md']);
  });

  test('de hoofdsessie zet een overtreding van een subagent terug: de lijst raakt leeg, geen nieuwe overtreding', () => {
    const root = nieuweRepo();
    handle(
      'subagent-start',
      { session_id: 's1', agent_type: 'tester', agent_id: 'agent-tester' },
      repoVan(root, 'aan'),
    );
    hoofd(root, { commando: 'echo y > rails/x.mjs', modus: 'aan', rol: 'tester' });
    expect(paden(root)).toStrictEqual(['rails/x.mjs']);
    const uit = hoofd(root, { commando: 'git checkout -- rails/x.mjs', modus: 'aan' });
    expect([isBlok(uit), paden(root)]).toStrictEqual([false, []]);
  });

  test.each([
    ['aan', true],
    ['schaduw', false],
  ] as const)(
    'geen opname van vóór (pre faalde open), vlag %s: blokkade %s en een schaduwregel met deny',
    (modus, blok) => {
      const root = nieuweRepo();
      const commando = "/usr/bin/sed -i 's/schema/x/' src/api/db/schema.ts";
      sh(root, commando);
      const input = {
        session_id: 's1',
        tool_name: 'Bash',
        tool_input: { command: commando },
        tool_use_id: 'zonder-pre',
      };
      expect(isBlok(handle('post', input, repoVan(root, modus)))).toBe(blok);
      expect(meetregels().filter((r) => r['e'] === 'Schaduw')).toMatchObject([
        { vooraf: 'onbekend', achteraf: 'deny' },
      ]);
    },
  );

  const VEEL = 'mkdir veel && cd veel && seq 1 5001 | xargs touch';

  test('te grote momentopname met de vlag aan: een blokkade en een overtreding zonder pad', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, { commando: 'maak veel bestanden', uitvoer: VEEL, modus: 'aan' });
    expect(isBlok(uit)).toBe(true);
    expect(paden(root)).toStrictEqual([null]);
  });

  test('te grote momentopname in schaduw: een schaduwregel met deny, geen lijst', () => {
    const root = nieuweRepo();
    const uit = hoofd(root, { commando: 'maak veel bestanden', uitvoer: VEEL, modus: 'schaduw' });
    expect(isBlok(uit)).toBe(false);
    expect(paden(root)).toStrictEqual([]);
    expect(meetregels().filter((r) => r['e'] === 'Schaduw')).toMatchObject([{ achteraf: 'deny', paden: [] }]);
  });
});

describe('rolhek-vooraf-krimp/AC-4: de hooks als proces', () => {
  const HOOK = path.resolve('rails/hooks/effect.mjs');

  function procesRepo(gates: string): string {
    const root = nieuweRepo();
    schrijf(root, '.claude/gates.json', gates);
    sh(root, 'git add -A && git commit -qm gates');
    return root;
  }

  function hook(root: string, event: string, invoer: Record<string, unknown>) {
    const env: NodeJS.ProcessEnv = { ...process.env, ...GIT_ENV, CLAUDE_PROJECT_DIR: root, METING_DIR: meetmap };
    delete env['RAILS_ANKER'];
    const result = spawnSync('node', [HOOK, event], {
      cwd: root,
      env,
      input: JSON.stringify({ ...invoer, cwd: root }),
      encoding: 'utf8',
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  test('vlag aan in .claude/gates.json: sed -i op een gegenereerd pad blokkeert na het commando', () => {
    const root = procesRepo(
      JSON.stringify({ ...JSON.parse(readFileSync('.claude/gates.json', 'utf8')), rolhekEffectHoofdsessie: 'aan' }),
    );
    const commando = "sed -i 's/schema/x/' src/api/db/schema.ts";
    const invoer = { session_id: 's1', tool_name: 'Bash', tool_input: { command: commando }, tool_use_id: 'p1' };
    expect(hook(root, 'pre', invoer).status).toBe(0);
    sh(root, commando);
    const na = hook(root, 'post', invoer);
    expect([na.status, na.stdout.includes('"decision":"block"')]).toStrictEqual([0, true]);
  });

  test('onleesbare configuratie: de toets na een commando van de hoofdsessie valt dicht', () => {
    const root = procesRepo('{ kapot');
    const invoer = { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'true' }, tool_use_id: 'p2' };
    const na = hook(root, 'post', invoer);
    expect(na.stdout).toContain('de toets valt dicht');
  });
});

describe('rolhek-vooraf-krimp/AC-7: pnpm meting toont de tellers', () => {
  function meting(regels: readonly Record<string, unknown>[], ...args: string[]) {
    writeFileSync(path.join(meetmap, 's1.jsonl'), regels.map((r) => `${JSON.stringify(r)}\n`).join(''));
    const r = spawnSync('node', ['scripts/kit/meting.mjs', ...args], {
      encoding: 'utf8',
      env: { ...process.env, METING_DIR: meetmap, METING_GH: '/bin/false' },
    });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  }
  const t = '2026-11-03T10:00:00.000Z';
  const oud = [{ t, e: 'Stop', s: 's1', b: 'feat/x', a: 'hoofdsessie' }];
  const nieuw = [
    ...oud,
    { t, e: 'EffectBlokkade', s: 's1', b: 'feat/x', a: 'tester', n: 1 },
    { t, e: 'PostToolUse', s: 's1', b: 'feat/x', a: 'hoofdsessie', tool: 'Bash', k: 'pnpm rolhek:overnemen', id: 'o1' },
    {
      t,
      e: 'Schaduw',
      s: 's1',
      b: 'feat/x',
      a: 'hoofdsessie',
      id: 'x1',
      vooraf: 'door',
      achteraf: 'ask',
      paden: ['AGENTS.md'],
    },
    { t, e: 'Schaduw', s: 's1', b: 'feat/x', a: 'hoofdsessie', id: 'x2', vooraf: 'door', achteraf: 'door', paden: [] },
    // Zelfde klasse (melding tegen door) en vooraf onbekend tellen niet als anders.
    {
      t,
      e: 'Schaduw',
      s: 's1',
      b: 'feat/x',
      a: 'hoofdsessie',
      id: 'x3',
      vooraf: 'melding',
      achteraf: 'door',
      paden: [],
    },
    {
      t,
      e: 'Schaduw',
      s: 's1',
      b: 'feat/x',
      a: 'hoofdsessie',
      id: 'x4',
      vooraf: 'onbekend',
      achteraf: 'deny',
      paden: [],
    },
  ];

  test('PR-tabel: blokkades op effect, overnames en schaduw', () => {
    const tabel = meting(nieuw, '--pr-tabel', '--branch', 'feat/x');
    expect(tabel).toContain('| Blokkades op effect | 1 |');
    expect(tabel).toContain('| Overnames | 1 |');
    expect(tabel).toContain('| Schaduw hoofdsessie (anders dan vooraf) | 2 (1) |');
  });

  test('PR-tabel van vóór de spec: onbekend, nooit 0', () => {
    const tabel = meting(oud, '--pr-tabel', '--branch', 'feat/x');
    expect(tabel).toContain('| Blokkades op effect | onbekend |');
    expect(tabel).toContain('| Overnames | onbekend |');
    expect(tabel).toContain('| Schaduw hoofdsessie (anders dan vooraf) | onbekend (onbekend) |');
  });

  test('per sessie en per branch, ook als JSON', () => {
    const tekst = meting(nieuw);
    expect(tekst).toContain('blokkades op effect 1 · overnames 1 · schaduw 2 (anders dan vooraf 1)');
    const json: unknown = JSON.parse(meting(nieuw, '--json'));
    expect(json).toMatchObject({
      sessies: { s1: { effect: { blokkades: 1, overnames: 1, schaduw: 2, schaduwAnders: 1 } } },
    });
    expect(JSON.parse(meting(oud, '--json'))).toMatchObject({ sessies: { s1: { effect: { blokkades: 'onbekend' } } } });
  });
});
