import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { handle } from '../../rails/hooks/lib/effect-hooks.mjs';
import { gitIn } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { inKooi } from '../../scripts/kit/kooi.mjs';
import { PADCORPUS, type Rij, type Uitkomst } from './rolhek-padcorpus.ts';

// Spec rolhek-vooraf-krimp AC-1 en AC-2 (ADR 0071): elke padbeslissing van het rolhek over een Bash-commando staat in één
// corpus. Vooraf: de toets geeft nog steeds de vastgelegde uitkomst. Achteraf: het commando draait echt, in de kooi (ADR
// 0072), in een tijdelijke git-repository, en de toets op effect komt tot dezelfde uitkomst.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const ROOT = '/repo';

function voorafCtx(rij: Rij) {
  const bestanden = rij.bestanden;
  const lijsten = rij.lijsten;
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => bestanden[rel] ?? null,
    committed: (rel: string) => rij.gecommit?.includes(rel) ?? false,
    isDir: (rel: string) => rij.mappen?.includes(rel) ?? false,
    ...(lijsten === undefined ? {} : { files: (rel: string) => [...(lijsten[rel] ?? [])] }),
    branch: rij.branch ?? 'feat/x',
    ...(rij.onderhoud === true ? { onderhoud: true } : {}),
  };
}

function vooraf(rij: Rij): Uitkomst {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: rij.commando },
    ...(rij.rol === '' ? {} : { agent_type: rij.rol }),
  };
  const d = decide(payload, voorafCtx(rij));
  if (d.deny.length > 0) return 'deny';
  if (d.ask.length > 0) return 'ask';
  return d.context.length > 0 ? 'melding' : 'door';
}

const naam = (rij: Rij) => `${rij.rol || 'hoofdsessie'}: ${rij.commando.slice(0, 100)} (${rij.bron})`;

describe('rolhek-vooraf-krimp/AC-1: het corpus geeft vooraf de vastgelegde uitkomst', () => {
  test.each(PADCORPUS.map((rij) => [naam(rij), rij] as const))('%s', (_naam, rij) => {
    expect(vooraf(rij)).toBe(rij.uitkomst);
  });
});

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const mappen: string[] = [];
let klok = 1_000_000;

afterEach(() => {
  for (const dir of mappen.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function schrijf(root: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

/** De bestanden en mappen die het rolhek vooraf las. */
function zetBestanden(root: string, rij: Rij): void {
  for (const [rel, inhoud] of Object.entries(rij.bestanden)) {
    if (rel.startsWith('.git/') || rel === '.git') continue;
    if (inhoud !== null) schrijf(root, rel, inhoud);
    else if (path.dirname(rel) !== '.' && !existsSync(path.join(root, path.dirname(rel))))
      schrijf(root, `${path.dirname(rel)}/.bewaar`, '');
  }
  for (const map of rij.mappen ?? []) if (!existsSync(path.join(root, map))) schrijf(root, `${map}/.bewaar`, '');
  for (const [map, lijst] of Object.entries(rij.lijsten ?? {}))
    for (const rel of lijst) if (!existsSync(path.join(root, rel))) schrijf(root, rel, `${map}\n`);
}

/** De beginstand: de bestanden die het rolhek vooraf las, gecommit in een verse repository. */
function beginstand(rij: Rij): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'rolhek-corpus-')));
  mappen.push(root);
  zetBestanden(root, rij);
  const na = rij.na === undefined ? '' : ` && ${rij.na}`;
  const r = inKooi(
    `git init -q -b ${rij.branch ?? 'feat/x'} && git add -A && git commit -q --allow-empty -m start${na}`,
    {
      werkmap: root,
      env: GIT_ENV,
    },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return root;
}

function repoVan(root: string, rij: Rij) {
  const ctx = {
    root,
    cwd: root,
    config,
    read: (rel: string) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : null),
    committed: () => false,
    isDir: () => false,
    branch: rij.branch ?? 'feat/x',
    ...(rij.onderhoud === true ? { onderhoud: true } : {}),
  };
  return { root, git: gitIn(root), ctx, now: () => (klok += 1000) };
}

const isBlok = (u: { stdout?: string }) => (u.stdout ?? '').includes('"decision":"block"');
const isMelding = (u: { stdout?: string }) => (u.stdout ?? '').includes('additionalContext');

/** Zoals `rails/hooks/effect.mjs`: een interne fout na het commando valt dicht met een blokkade (rolhek-effect AC-7). */
function alsHook(stap: () => { stdout?: string }): { stdout?: string } {
  try {
    return stap();
  } catch (fout) {
    return { stdout: JSON.stringify({ decision: 'block', reason: String(fout) }) };
  }
}

/** Inhoud van de werkmap (zonder `.git`), de index en HEAD: zo ziet de test of het commando echt iets veranderde. */
function vingerafdruk(root: string): string {
  const hash = createHash('sha256');
  const loop = (rel: string): void => {
    for (const naam of readdirSync(path.join(root, rel)).sort()) {
      const pad = rel === '' ? naam : `${rel}/${naam}`;
      if (pad === '.git') continue;
      const stat = lstatSync(path.join(root, pad));
      hash.update(`${pad}\0${stat.mode.toString()}\0`);
      if (stat.isDirectory()) loop(pad);
      else if (stat.isFile()) hash.update(readFileSync(path.join(root, pad)));
    }
  };
  loop('');
  // `find . -delete` wist ook `.git`; dan telt alleen de werkmap.
  if (existsSync(path.join(root, '.git/HEAD'))) {
    const git = gitIn(root);
    hash.update(git(['ls-files', '-s'])).update(git(['rev-parse', '-q', '--verify', 'HEAD']));
  }
  return hash.digest('hex');
}

/** Het commando echt, in de kooi, met de hooks eromheen; de uitkomst van de toets op effect en of er iets veranderde. */
export function achteraf(rij: Rij): { uitkomst: Uitkomst; veranderd: boolean } {
  const root = beginstand(rij);
  const repo = repoVan(root, rij);
  const basis = { session_id: 's1', ...(rij.rol === '' ? {} : { agent_type: rij.rol, agent_id: `agent-${rij.rol}` }) };
  const input = { ...basis, tool_name: 'Bash', tool_input: { command: rij.commando }, tool_use_id: 't1' };
  if (rij.rol !== '') handle('subagent-start', basis, repo);
  handle('pre', input, repo);
  const begin = vingerafdruk(root);
  const tmp = rij.tmp === undefined ? '' : `${rij.tmp} && `;
  try {
    // De uitvoer telt niet, alleen het effect; `find / -delete` geeft per alleen-lezen bestand een regel.
    inKooi(`{ ${tmp}${rij.commando.replaceAll(ROOT, root)}\n} > /dev/null 2>&1`, {
      werkmap: root,
      env: GIT_ENV,
      timeout: 10_000,
    });
  } catch (fout) {
    // Een commando dat over het hele bestandssysteem loopt (`find / -delete`), stopt op de time-out; de toets kijkt daarna.
    if (!(fout instanceof Error && 'code' in fout && fout.code === 'ETIMEDOUT')) throw fout;
  }
  const post = alsHook(() => handle('post', input, repo));
  const stop = rij.rol === '' ? {} : alsHook(() => handle('subagent-stop', basis, repo));
  const veranderd = vingerafdruk(root) !== begin;
  if (isBlok(post) || isBlok(stop)) return { uitkomst: 'deny', veranderd };
  return { uitkomst: isMelding(post) ? 'melding' : 'door', veranderd };
}

/** Wat AC-2 achteraf vraagt: deny en ask worden voor een subagent een blokkade; een melding en doorlaten blijven gelijk. */
const standaard = (uitkomst: Uitkomst): Uitkomst => (uitkomst === 'melding' || uitkomst === 'door' ? uitkomst : 'deny');
const NIETS = 'verandert op deze machine niets';

/**
 * De verwachting achteraf. Een rij die op deze machine niets verandert (mawk, een onbekende afkorting), verwacht `door`
 * alleen als er echt niets veranderde; verandert het commando elders wel iets, dan geldt de gewone verwachting.
 */
function verwacht(rij: Rij, veranderd: boolean): Uitkomst {
  if (rij.reden?.startsWith(NIETS) === true && veranderd) return rij.alsVeranderd ?? standaard(rij.uitkomst);
  return rij.achteraf ?? standaard(rij.uitkomst);
}

/** Een rij die een vrij pad in de repository schrijft, moet het pad ook echt veranderen; anders bewijst `door` niets. */
const moetVeranderen = (rij: Rij) => rij.reden?.startsWith('schrijft een vrij pad') === true;

/** Een rij op een zelfladend pad houdt zijn weigering vooraf (AC-3); de toets op effect komt daarna. */
function zelfladendVooraf(rij: Rij): boolean {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: rij.commando },
    ...(rij.rol === '' ? {} : { agent_type: rij.rol }),
  };
  const d = decide(payload, voorafCtx(rij));
  return [...d.deny, ...d.ask].some((reden) => reden.includes('zelfladend pad'));
}

const SUBAGENTRIJEN = PADCORPUS.filter((rij) => rij.rol !== '');

describe('rolhek-vooraf-krimp/AC-2: een subagentrij geeft achteraf dezelfde uitkomst, het commando in de kooi', () => {
  test.each(SUBAGENTRIJEN.map((rij) => [naam(rij), rij] as const))(
    '%s',
    (_naam, rij) => {
      if (zelfladendVooraf(rij)) {
        expect(vooraf(rij)).toBe('deny');
        return;
      }
      const { uitkomst, veranderd } = achteraf(rij);
      // Doorlaten geeft geen blokkade (AC-2); een melding achteraf mag.
      if (verwacht(rij, veranderd) === 'door') expect(uitkomst).not.toBe('deny');
      else expect(uitkomst).toBe(verwacht(rij, veranderd));
      if (moetVeranderen(rij)) expect(veranderd).toBe(true);
      // `find / -delete` loopt tot de time-out van de kooi; op een CI-runner duurt die langer dan de standaard 15 s.
    },
    60_000,
  );

  test('een bewust verkeerde verwachting faalt (R-PRINC-04)', () => {
    const rij = SUBAGENTRIJEN.find((kandidaat) => kandidaat.commando === 'rm -rf src' && kandidaat.rol === 'Explore');
    expect(rij).toBeDefined();
    if (rij !== undefined) expect(achteraf(rij).uitkomst).not.toBe('door');
  });

  test('een afwijking achteraf heeft altijd een reden', () => {
    expect(PADCORPUS.filter((rij) => rij.achteraf !== undefined && (rij.reden ?? '') === '')).toStrictEqual([]);
  });
});

// De hoofdsessie is pas dader op de werkmap met AC-4 (bouw-PR 2, schaduwmodus); tot dan toetst dit corpus haar rijen vooraf.

// Review PR 1: de toets op effect laat alleen een verhuizing naar het archief door (zelfde naam, zelfde inhoud, nieuw doel;
// spec rolhek-vooraf-krimp AC-5 en de randgevallen); `git mv` staget die inhoud ook in de index.
describe('rolhek-vooraf-krimp/AC-5: een verhuizing naar het ADR-archief, achteraf', () => {
  const ADR = '# 0001 — x\n\nStatus: vervallen\n';
  const rij = (commando: string, na?: string): Rij => ({
    bron: 'review',
    commando,
    rol: 'architect',
    bestanden: { 'docs/adr/0001-x.md': ADR },
    mappen: ['docs/adr/archief'],
    uitkomst: 'door',
    ...(na === undefined ? {} : { na }),
  });

  test.each([
    'git mv docs/adr/0001-x.md docs/adr/archief/0001-x.md',
    'mv docs/adr/0001-x.md docs/adr/archief/0001-x.md',
  ])('%s gaat door', (commando) => {
    expect(achteraf(rij(commando))).toStrictEqual({ uitkomst: 'door', veranderd: true });
  });

  test.each([
    ['een kopie zonder verwijdering', 'cp docs/adr/0001-x.md docs/adr/archief/0001-x.md', undefined],
    ['een andere naam', 'git mv docs/adr/0001-x.md docs/adr/archief/0002-y.md', undefined],
    [
      'een gewijzigde inhoud',
      'git mv docs/adr/0001-x.md docs/adr/archief/0001-x.md && echo x >> docs/adr/archief/0001-x.md',
      undefined,
    ],
    [
      'een bestaand archiefbestand overschreven',
      'mv docs/adr/0001-x.md docs/adr/archief/0001-x.md',
      "printf 'oud\\n' > docs/adr/archief/0001-x.md && git add -A && git commit -qm archief",
    ],
  ])('%s is een blokkade', (_naam, commando, na) => {
    expect(achteraf(rij(commando, na)).uitkomst).toBe('deny');
  });
});
