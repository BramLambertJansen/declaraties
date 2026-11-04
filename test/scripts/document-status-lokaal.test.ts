import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { expectNegativeTable } from '../support/negative-table.ts';
import {
  VOLGORDE,
  draai,
  eigenVolgorde,
  gepushteRef,
  lokaleInvoer,
  oordeel,
  prUitGh,
  vangOpen,
} from '../../scripts/kit/document-status-lokaal.mjs';

// Spec document-status-lokaal: pre-push draait de document-status-check lokaal en blokkeert alleen op de volgorde
// (ADR 0062 punt 3); de eigen volgordetoets (AC-6) waarschuwt.

const PREFIX = 'pre-push: document-status';
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const NUL = '0'.repeat(40);

interface Antwoord {
  readonly originMain?: string | null;
  readonly head?: string | null;
  readonly branch?: string;
  readonly url?: string | null;
  readonly opgenomen?: boolean;
}

const geenRef = { code: 1, output: '' };

/** Nep-git die op de argumenten matcht; de volgorde van de aanroepen telt niet. */
function nepGit(antwoord: Antwoord = {}) {
  const { originMain = BASE, head = HEAD, branch = 'feat/x', opgenomen = false } = antwoord;
  const url = antwoord.url === undefined ? 'https://github.com/voorbeeld/repo.git' : antwoord.url;
  return (args: readonly string[]) => {
    const sleutel = args.join(' ');
    if (sleutel === 'rev-parse --verify --quiet refs/remotes/origin/main')
      return originMain === null ? geenRef : { code: 0, output: `${originMain}\n` };
    if (sleutel === 'rev-parse --verify --quiet HEAD')
      return head === null ? geenRef : { code: 0, output: `${head}\n` };
    if (sleutel === 'branch --show-current') return { code: 0, output: `${branch}\n` };
    if (sleutel === 'config --get remote.origin.url') return url === null ? geenRef : { code: 0, output: `${url}\n` };
    if (sleutel === 'merge-base --is-ancestor HEAD refs/remotes/origin/main')
      return { code: opgenomen ? 0 : 1, output: '' };
    return { code: 1, output: 'onverwacht' };
  };
}

function meldingVan(uitslag: ReturnType<typeof lokaleInvoer>): string | null {
  return 'melding' in uitslag ? uitslag.melding : null;
}

describe('lokaleInvoer (AC-3, AC-7)', () => {
  test('volledige invoer: origin/main, HEAD, branch en owner/naam, getrimd', () => {
    expect(lokaleInvoer(nepGit())).toStrictEqual({ base: BASE, head: HEAD, ref: 'feat/x', repo: 'voorbeeld/repo' });
  });

  test('ssh-remote geeft dezelfde owner/naam', () => {
    const uitslag = lokaleInvoer(nepGit({ url: 'git@github.com:voorbeeld/repo.git' }));

    expect(uitslag).toStrictEqual({ base: BASE, head: HEAD, ref: 'feat/x', repo: 'voorbeeld/repo' });
  });

  test.each<[string, Antwoord]>([
    ['geen origin/main', { originMain: null }],
    ['geen HEAD', { head: null }],
    ['detached HEAD (geen huidige branch)', { branch: '' }],
    ['geen remote.origin.url', { url: null }],
    ['remote zonder herkenbare owner/naam op github.com', { url: 'https://gitlab.com/voorbeeld/repo.git' }],
    ['HEAD opgenomen in origin/main (niets te pushen)', { opgenomen: true }],
    ['HEAD gelijk aan origin/main', { head: BASE, opgenomen: true }],
  ])('%s: melding, geen invoer', (_naam, antwoord) => {
    const uitslag = lokaleInvoer(nepGit(antwoord));

    expect(meldingVan(uitslag)?.startsWith(PREFIX)).toBe(true);
    expect(uitslag).not.toHaveProperty('base');
  });
});

describe('gepushteRef (AC-2)', () => {
  const doel = { ref: 'feat/x', head: HEAD };

  test.each([
    ['nieuwe branch', `refs/heads/feat/x ${HEAD} refs/heads/feat/x ${NUL}\n`],
    ['bestaande branch', `refs/heads/feat/x ${HEAD} refs/heads/feat/x ${BASE}\n`],
    ['naast een tag', `refs/tags/v1 ${BASE} refs/tags/v1 ${NUL}\nrefs/heads/feat/x ${HEAD} refs/heads/feat/x ${NUL}\n`],
  ])('%s: de huidige branch op HEAD wordt gepusht', (_naam, stdin) => {
    expect(gepushteRef(stdin, doel)).toBe(true);
  });

  test('niet getoetst: lege stdin, verwijdering, tag, andere branch, andere sha, kapotte regel', () => {
    const regel = (lokaal: string, sha: string) => `${lokaal} ${sha} ${lokaal} ${NUL}\n`;
    expectNegativeTable({
      base: regel('refs/heads/feat/x', HEAD),
      check: (stdin: string) => gepushteRef(stdin, doel),
      cases: [
        { name: 'lege stdin', change: () => '' },
        { name: 'verwijdering', change: () => `(delete) ${NUL} refs/heads/feat/x ${BASE}\n` },
        { name: 'tag', change: () => regel('refs/tags/v1', HEAD) },
        { name: 'andere branch', change: () => regel('refs/heads/feat/y', HEAD) },
        { name: 'branch met dezelfde prefix', change: () => regel('refs/heads/feat/x-2', HEAD) },
        { name: 'andere sha', change: () => regel('refs/heads/feat/x', BASE) },
        { name: 'kapotte regel', change: () => 'refs/heads/feat/x\n' },
      ],
    });
  });
});

describe('prUitGh (AC-3)', () => {
  test.each([
    ['[{"number":7}]', 7],
    ['[{"number":7}]\n', 7],
    ['[{"number":12,"head":{"ref":"feat/x"}}]', 12],
  ])('precies één open PR %s: %d', (uitvoer, verwacht) => {
    expect(prUitGh(uitvoer)).toBe(verwacht);
  });

  test.each([
    ['geen gh of netwerk', null],
    ['lege uitvoer', ''],
    ['geen PR', '[]'],
    ['twee PRs', '[{"number":7},{"number":8}]'],
    ['kapotte JSON', '[{"number":7'],
    ['geen array', '{"number":7}'],
    ['nummer 0', '[{"number":0}]'],
    ['negatief nummer', '[{"number":-3}]'],
    ['geen geheel getal', '[{"number":1.5}]'],
    ['nummer als tekst', '[{"number":"7"}]'],
    ['element zonder nummer', '[{}]'],
    ['element null', '[null]'],
  ])('%s: onbekend', (_naam, uitvoer) => {
    expect(prUitGh(uitvoer)).toBeNull();
  });
});

const FOUT = 'docs/specs/x.md: herzieningsregel noemt niet deze PR';
const VOLGORDEFOUT = `docs/specs/x.md: de spec staat niet in een commit vóór de eerste code of test ${VOLGORDE}; commit de spec eerst`;

describe('oordeel (AC-4, AC-5, AC-7)', () => {
  test('VOLGORDE is de vaste tekst uit de check', () => {
    expect(VOLGORDE).toBe('(volgorde, ADR 0062 punt 3)');
  });

  test('check geslaagd: exit 0 zonder melding', () => {
    expect(oordeel({ status: 0, uitvoer: 'document-status: ok' })).toStrictEqual({ exit: 0, melding: null });
  });

  test('kindproces zonder exitcode: waarschuwing, exit 0, ook bij volgorde-uitvoer', () => {
    const uitslag = oordeel({ status: null, uitvoer: VOLGORDEFOUT });

    expect(uitslag.exit).toBe(0);
    expect(uitslag.melding?.startsWith(PREFIX)).toBe(true);
    expect(uitslag.melding).toContain('waarschuwing');
    expect(uitslag.melding).not.toContain('blokkade');
  });

  test.each([1, 2])('afkeuring op de volgorde (status %d): blokkade met uitvoer en herstelroute', (status) => {
    const uitslag = oordeel({ status, uitvoer: VOLGORDEFOUT });

    expect(uitslag.exit).toBe(1);
    expect(uitslag.melding?.startsWith(PREFIX)).toBe(true);
    for (const deel of ['blokkade', VOLGORDEFOUT, 'git reset --soft', 'nieuwe branch', 'origin/main'])
      expect(uitslag.melding).toContain(deel);
  });

  test.each([1, 2])('andere afkeuring (status %d): waarschuwing met uitvoer en merge-hint, exit 0', (status) => {
    const uitslag = oordeel({ status, uitvoer: FOUT });

    expect(uitslag.exit).toBe(0);
    expect(uitslag.melding?.startsWith(PREFIX)).toBe(true);
    expect(uitslag.melding).toContain('waarschuwing');
    expect(uitslag.melding).toContain(FOUT);
    expect(uitslag.melding).toContain('git merge origin/main');
    expect(uitslag.melding).not.toContain('blokkade');
  });
});

describe('draai (AC-7)', () => {
  test('gewone exitcode en uitvoer', () => {
    const uitslag = draai(process.execPath, ['-e', 'console.log("hoi"); process.exit(3)'], { timeout: 10_000 });

    expect(uitslag.status).toBe(3);
    expect(uitslag.stdout).toContain('hoi');
  });

  test('kind dat zichzelf SIGKILLt: status null', () => {
    const uitslag = draai(process.execPath, ['-e', 'process.kill(process.pid, "SIGKILL")'], { timeout: 10_000 });

    expect(uitslag.status).toBeNull();
  });

  test('timeout: status null', () => {
    const uitslag = draai(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], { timeout: 200 });

    expect(uitslag.status).toBeNull();
  });

  test('onbestaand programma: status null', () => {
    const uitslag = draai(path.join(tmpdir(), 'bestaat-niet-document-status'), [], { timeout: 10_000 });

    expect(uitslag.status).toBeNull();
  });
});

describe('vangOpen (AC-7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each([0, 1])('geeft de uitkomst %d van het werk terug, zonder waarschuwing', (uitkomst) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(vangOpen(() => uitkomst)).toBe(uitkomst);
    expect(warn).not.toHaveBeenCalled();
  });

  test('werk gooit: exit 0 met een waarschuwing die de fout noemt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const uitkomst = vangOpen(() => {
      throw new Error('git is stuk');
    });

    expect(uitkomst).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    const tekst = String(warn.mock.calls[0]?.[0]);
    expect(tekst.startsWith('pre-push: document-status: niet gecontroleerd')).toBe(true);
    expect(tekst).toContain('git is stuk');
  });
});

// Nep-repository voor eigenVolgorde: een lineaire reeks commits na de split, met per commit de gewijzigde bestanden
// (null = verwijderd). De nep-git beantwoordt alleen de aanroepen uit het contract.
interface NepCommit {
  readonly sha: string;
  readonly bestanden: Readonly<Record<string, string | null>>;
}

const SPLIT = 'c'.repeat(40);
const sha = (n: number) => String(n).padStart(40, 'd');
const spec = (status: string, inhoud = 'Inhoud.') => `---\nstatus: ${status}\nnamespace: x\n---\n\n# X\n\n${inhoud}\n`;

/** De stand van elk pad na `tot` commits (0 = de split). */
function stand(basis: Record<string, string>, commits: readonly NepCommit[], tot: number) {
  const uit = new Map<string, string>(Object.entries(basis));
  for (const commit of commits.slice(0, tot))
    for (const [pad, tekst] of Object.entries(commit.bestanden))
      if (tekst === null) uit.delete(pad);
      else uit.set(pad, tekst);
  return uit;
}

function regels(lijst: readonly string[]) {
  return { code: 0, output: lijst.map((regel) => `${regel}\n`).join('') };
}

function toonBestand(basis: Record<string, string>, commits: readonly NepCommit[], args: readonly string[]) {
  const match = /^([0-9a-f]{40})(\^?):(.+)$/.exec(args[1] ?? '');
  const index = commits.findIndex((commit) => commit.sha === match?.[1]);
  if (match?.[3] === undefined || index === -1) return { code: 128, output: '' };
  const tekst = stand(basis, commits, match[2] === '^' ? index : index + 1).get(match[3]);
  return tekst === undefined ? { code: 128, output: '' } : { code: 0, output: tekst };
}

function nepRepo(basis: Record<string, string>, commits: readonly NepCommit[]) {
  const bereik = `${SPLIT}..${HEAD}`;
  const alle = commits.map((commit) => commit.sha);
  const raakt = (filter: (pad: string) => boolean) =>
    commits.filter((commit) => Object.keys(commit.bestanden).some(filter)).map((commit) => commit.sha);
  return (args: readonly string[]) => {
    const sleutel = args.join(' ');
    if (sleutel === `merge-base ${BASE} ${HEAD}`) return { code: 0, output: `${SPLIT}\n` };
    if (sleutel === `log --no-merges --topo-order --reverse --format=%H ${bereik}`) return regels(alle);
    if (sleutel === `log --no-merges --reverse --format=%H ${bereik} -- . :(exclude)docs/`)
      return regels(raakt((pad) => !pad.startsWith('docs/')));
    if (sleutel === `diff --name-only --no-renames ${SPLIT} ${HEAD} -- docs/specs/`) {
      const voor = stand(basis, commits, 0);
      const na = stand(basis, commits, commits.length);
      const paden = new Set([...voor.keys(), ...na.keys()]);
      return regels([...paden].filter((pad) => pad.startsWith('docs/specs/') && voor.get(pad) !== na.get(pad)).sort());
    }
    const perSpec = /^log --no-merges --reverse --format=%H \S+ -- (docs\/specs\/\S+)$/.exec(sleutel)?.[1];
    if (perSpec !== undefined && sleutel.includes(bereik)) return regels(raakt((pad) => pad === perSpec));
    if (args[0] === 'show') return toonBestand(basis, commits, args);
    return { code: 1, output: 'onverwacht' };
  };
}

const volgordeVan = (basis: Record<string, string>, commits: readonly NepCommit[]) =>
  eigenVolgorde(nepRepo(basis, commits), { base: BASE, head: HEAD });

const X = 'docs/specs/x.md';
const CODE = 'export const x = 1;\n';

describe('eigenVolgorde (AC-6)', () => {
  test('nieuwe spec en code in één commit: spec in foute volgorde', () => {
    expect(volgordeVan({}, [{ sha: sha(1), bestanden: { [X]: spec('voorstel'), 'src/x.ts': CODE } }])).toStrictEqual([
      X,
    ]);
  });

  test('spec eerst, daarna code: in orde', () => {
    const commits = [
      { sha: sha(1), bestanden: { [X]: spec('voorstel') } },
      { sha: sha(2), bestanden: { 'src/x.ts': CODE } },
    ];

    expect(volgordeVan({}, commits)).toStrictEqual([]);
  });

  test('geen code (alleen docs/): in orde', () => {
    expect(volgordeVan({}, [{ sha: sha(1), bestanden: { [X]: spec('voorstel') } }])).toStrictEqual([]);
  });

  test('spec eerst, code, dan alleen een statuswijziging: in orde', () => {
    const commits = [
      { sha: sha(1), bestanden: { [X]: spec('goedgekeurd') } },
      { sha: sha(2), bestanden: { 'src/x.ts': CODE } },
      { sha: sha(3), bestanden: { [X]: spec('gebouwd # #7') } },
    ];

    expect(volgordeVan({}, commits)).toStrictEqual([]);
  });

  test('bestaande spec krijgt nieuwe inhoud na de code (#506): foute volgorde', () => {
    const commits = [
      { sha: sha(1), bestanden: { 'src/x.ts': CODE } },
      { sha: sha(2), bestanden: { [X]: spec('goedgekeurd', 'Nieuwe inhoud.') } },
    ];

    expect(volgordeVan({ [X]: spec('goedgekeurd') }, commits)).toStrictEqual([X]);
  });

  test('bestaande spec krijgt na de code alleen een nieuwe status: in orde', () => {
    const commits = [
      { sha: sha(1), bestanden: { 'src/x.ts': CODE } },
      { sha: sha(2), bestanden: { [X]: spec('gebouwd # #7') } },
    ];

    expect(volgordeVan({ [X]: spec('goedgekeurd') }, commits)).toStrictEqual([]);
  });

  test('bestaande spec na de code ongeldig gemaakt (documentInfo null): foute volgorde', () => {
    const commits = [
      { sha: sha(1), bestanden: { 'src/x.ts': CODE } },
      { sha: sha(2), bestanden: { [X]: '# X zonder frontmatter\n' } },
    ];

    expect(volgordeVan({ [X]: spec('goedgekeurd') }, commits)).toStrictEqual([X]);
  });

  test('bestaande spec na de code verwijderd: geen inhoudswijziging', () => {
    const commits = [
      { sha: sha(1), bestanden: { 'src/x.ts': CODE } },
      { sha: sha(2), bestanden: { [X]: null } },
    ];

    expect(volgordeVan({ [X]: spec('goedgekeurd') }, commits)).toStrictEqual([]);
  });

  test('sjabloon (_-naam) en spec in een submap tellen niet', () => {
    const bestanden = { 'docs/specs/_sjabloon.md': spec('voorstel'), 'docs/specs/sub/y.md': spec('voorstel') };

    expect(volgordeVan({}, [{ sha: sha(1), bestanden: { ...bestanden, 'src/x.ts': CODE } }])).toStrictEqual([]);
  });

  test('meer specs in foute volgorde: gesorteerd, de goede ontbreekt', () => {
    const commits = [
      { sha: sha(1), bestanden: { 'docs/specs/m.md': spec('voorstel') } },
      { sha: sha(2), bestanden: { 'docs/specs/z.md': spec('voorstel'), 'src/x.ts': CODE } },
      { sha: sha(3), bestanden: { 'docs/specs/a.md': spec('voorstel') } },
    ];

    expect(volgordeVan({}, commits)).toStrictEqual(['docs/specs/a.md', 'docs/specs/z.md']);
  });

  /** De nep-repo, met één aanroep die faalt (code 1, lege uitvoer). */
  const metFout = (git: ReturnType<typeof nepRepo>, faalt: (args: readonly string[]) => boolean) => {
    return (args: readonly string[]) => (faalt(args) ? { code: 1, output: '' } : git(args));
  };
  const gemengd = [{ sha: sha(1), bestanden: { [X]: spec('voorstel'), 'src/x.ts': CODE } }];

  test('merge-base faalt: valt open met []', () => {
    const git = metFout(nepRepo({}, gemengd), (args) => args[0] === 'merge-base');

    expect(eigenVolgorde(git, { base: BASE, head: HEAD })).toStrictEqual([]);
  });

  test('commitlijst (--topo-order) faalt bij code en spec in foute volgorde: valt open met []', () => {
    const git = metFout(nepRepo({}, gemengd), (args) => args[0] === 'log' && args.includes('--topo-order'));

    expect(volgordeVan({}, gemengd)).toStrictEqual([X]);
    expect(eigenVolgorde(git, { base: BASE, head: HEAD })).toStrictEqual([]);
  });
});

// Het echte script met de echte check, in een tijdelijke repo met origin/main; `gh` ontbreekt of is een nep (AC-2, AC-3).
const root = process.cwd();
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function commit(cwd: string, bericht: string, bestanden: Record<string, string>) {
  for (const [bestand, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(cwd, bestand)), { recursive: true });
    writeFileSync(path.join(cwd, bestand), inhoud);
  }
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', bericht);
}

/** Repo met een basis (gates, besluiten en `opMain`) op origin/main en een branch feat/x. */
function fixture(opMain: Record<string, string> = {}) {
  const basis = mkdtempSync(path.join(tmpdir(), 'document-status-lokaal-'));
  dirs.push(basis);
  const repo = path.join(basis, 'repo');
  mkdirSync(path.join(repo, '.claude'), { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  for (const bestand of ['.claude/gates.json', '.claude/decisions.json'])
    copyFileSync(path.join(root, bestand), path.join(repo, bestand));
  commit(repo, 'basis', opMain);
  git(repo, 'config', 'remote.origin.url', 'https://github.com/voorbeeld/repo.git');
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(repo, 'switch', '-qc', 'feat/x');
  return { basis, repo };
}

/** PATH met alleen node en git, en met `pr` een nep-`gh` die die ene open PR meldt. */
function pad(basis: string, pr: number | null) {
  const bin = path.join(basis, 'bin');
  mkdirSync(bin);
  const gitPad = (process.env['PATH'] ?? '')
    .split(path.delimiter)
    .map((map) => path.join(map, 'git'))
    .find((kandidaat) => existsSync(kandidaat));
  if (gitPad === undefined) throw new Error('git niet gevonden in PATH');
  symlinkSync(gitPad, path.join(bin, 'git'));
  symlinkSync(process.execPath, path.join(bin, 'node'));
  if (pr !== null) {
    writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho '[{"number":${String(pr)}}]'\n`);
    chmodSync(path.join(bin, 'gh'), 0o755);
  }
  return bin;
}

interface Run {
  readonly pr?: number | null;
  readonly stdin?: string;
}

function script(fx: { basis: string; repo: string }, run: Run = {}) {
  const weg = ['GITHUB_STEP_SUMMARY', 'BASE_SHA', 'HEAD_SHA', 'HEAD_REF', 'REPO', 'PR_NUMBER'];
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([naam]) => !weg.includes(naam))),
    PATH: pad(fx.basis, run.pr ?? null),
    GIT_TERMINAL_PROMPT: '0',
  };
  const args = [path.join(root, 'scripts/kit/document-status-lokaal.mjs')];
  if (run.stdin !== undefined) args.push('--pre-push');
  const result = spawnSync(process.execPath, args, {
    cwd: fx.repo,
    encoding: 'utf8',
    env,
    input: run.stdin ?? '',
    timeout: 60_000,
  });
  return { status: result.status, uitvoer: `${result.stdout}${result.stderr}` };
}

const SPEC_GOED = spec('goedgekeurd', 'Een nieuwe spec voor de proef.');

describe('script scripts/kit/document-status-lokaal.mjs', { timeout: 60_000 }, () => {
  test('(a) spec goedgekeurd en code in één commit, geen PR: blokkade op de volgorde', () => {
    const fx = fixture();
    commit(fx.repo, 'feat: x', { [X]: SPEC_GOED, 'src/x.ts': CODE });

    const result = script(fx);

    expect(result.status, result.uitvoer).toBe(1);
    expect(result.uitvoer).toContain(VOLGORDE);
    expect(result.uitvoer).toContain('blokkade');
  });

  test('(b) spec in een eerdere commit, daarna code: exit 0', () => {
    const fx = fixture();
    commit(fx.repo, 'docs: spec x', { [X]: SPEC_GOED });
    commit(fx.repo, 'feat: x', { 'src/x.ts': CODE });

    const result = script(fx);

    expect(result.status, result.uitvoer).toBe(0);
    expect(result.uitvoer).not.toContain('blokkade');
    expect(result.uitvoer).not.toContain(VOLGORDE);
  });

  test('(c) HEAD gelijk aan origin/main: niets te pushen, exit 0', () => {
    const result = script(fixture());

    expect(result.status, result.uitvoer).toBe(0);
    expect(result.uitvoer).not.toContain('blokkade');
  });

  test('(d) commitvorm #517: spec voorstel en code in één commit: waarschuwing met het specpad, exit 0', () => {
    const fx = fixture();
    commit(fx.repo, 'feat: x', { [X]: spec('voorstel'), 'src/x.ts': CODE });

    const result = script(fx);

    expect(result.status, result.uitvoer).toBe(0);
    expect(result.uitvoer).toContain('waarschuwing');
    expect(result.uitvoer).toContain(X);
    expect(result.uitvoer).not.toContain('blokkade');
  });

  test('(e) #506: spec op main krijgt nieuwe inhoud na de code, PR 7: blokkade op de volgorde', () => {
    const fx = fixture({ [X]: SPEC_GOED });
    commit(fx.repo, 'feat: x', { 'src/x.ts': CODE });
    commit(fx.repo, 'docs: spec x', { [X]: spec('goedgekeurd', 'Nieuwe inhoud na de code.') });

    const result = script(fx, { pr: 7 });

    expect(result.status, result.uitvoer).toBe(1);
    expect(result.uitvoer).toContain(VOLGORDE);
  });

  test('(f) spec eerst, code, dan alleen status gebouwd # #7, PR 7: exit 0 zonder waarschuwing', () => {
    const fx = fixture();
    commit(fx.repo, 'docs: spec x', { [X]: SPEC_GOED });
    commit(fx.repo, 'feat: x', { 'src/x.ts': CODE });
    commit(fx.repo, 'docs: status x', { [X]: spec('gebouwd # #7', 'Een nieuwe spec voor de proef.') });

    const result = script(fx, { pr: 7 });

    expect(result.status, result.uitvoer).toBe(0);
    expect(result.uitvoer).not.toContain('waarschuwing');
    expect(result.uitvoer).not.toContain('blokkade');
    expect(result.uitvoer).not.toContain(VOLGORDE);
  });

  test('(g) andere afkeuring (gebouwd # #8 bij PR 7): waarschuwing met merge-hint, exit 0', () => {
    const fx = fixture();
    commit(fx.repo, 'docs: spec x', { [X]: SPEC_GOED });
    commit(fx.repo, 'feat: x', { 'src/x.ts': CODE });
    commit(fx.repo, 'docs: status x', { [X]: spec('gebouwd # #8', 'Een nieuwe spec voor de proef.') });

    const result = script(fx, { pr: 7 });

    expect(result.status, result.uitvoer).toBe(0);
    expect(result.uitvoer).toContain('waarschuwing');
    expect(result.uitvoer).toContain('git merge origin/main');
    expect(result.uitvoer).not.toContain('blokkade');
  });
});

describe('script met --pre-push (AC-2)', { timeout: 60_000 }, () => {
  /** Foute volgorde (zoals (a)), zodat een getoetste push zeker blokkeert. */
  function fouteVolgorde() {
    const fx = fixture();
    commit(fx.repo, 'feat: x', { [X]: SPEC_GOED, 'src/x.ts': CODE });
    return { ...fx, head: git(fx.repo, 'rev-parse', 'HEAD') };
  }

  test('de huidige branch op HEAD: getoetst, blokkade zoals (a)', () => {
    const fx = fouteVolgorde();

    const result = script(fx, { stdin: `refs/heads/feat/x ${fx.head} refs/heads/feat/x ${NUL}\n` });

    expect(result.status, result.uitvoer).toBe(1);
    expect(result.uitvoer).toContain(VOLGORDE);
  });

  test.each([
    ['een andere branch', (head: string) => `refs/heads/feat/y ${head} refs/heads/feat/y ${NUL}\n`],
    ['een verwijdering', () => `(delete) ${NUL} refs/heads/oud ${BASE}\n`],
    ['een tag', (head: string) => `refs/tags/v1 ${head} refs/tags/v1 ${NUL}\n`],
    ['lege stdin', () => ''],
  ])('%s: niet getoetst, exit 0, ook bij foute volgorde', (_naam, stdin) => {
    const fx = fouteVolgorde();

    const result = script(fx, { stdin: stdin(fx.head) });

    expect(result.status, result.uitvoer).toBe(0);
    expect(result.uitvoer).not.toContain('blokkade');
    expect(result.uitvoer).not.toContain(VOLGORDE);
  });
});
