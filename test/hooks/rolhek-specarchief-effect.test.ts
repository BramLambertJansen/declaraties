import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { handle } from '../../rails/hooks/lib/effect-hooks.mjs';
import { gitIn } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { inKooi } from '../../scripts/kit/kooi.mjs';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080 punt 1), AC-3 "de toets op effect ook": het commando draait echt, in de
// kooi (ADR 0072), in een tijdelijke git-repository, met de hooks eromheen. Alleen een verhuizing naar het specarchief (zelfde
// naam, zelfde inhoud, nieuw doel) gaat door. Vorm van rolhek-padcorpus.test.ts (rolhek-vooraf-krimp/AC-5).
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const SPEC = '---\nstatus: vervallen\nnamespace: x\n---\n\n# X\n';
const mappen: string[] = [];
let klok = 1_000_000;

afterEach(() => {
  for (const dir of mappen.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** main met `docs/specs/x.md` (vervallen) en `docs/specs/archief/.bewaar`, plus de shell `na`. */
function beginstand(na?: string): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'rolhek-specarchief-')));
  mappen.push(root);
  mkdirSync(path.join(root, 'docs/specs/archief'), { recursive: true });
  writeFileSync(path.join(root, 'docs/specs/x.md'), SPEC);
  writeFileSync(path.join(root, 'docs/specs/archief/.bewaar'), '');
  const extra = na === undefined ? '' : ` && ${na}`;
  const r = inKooi(`git init -q -b feat/x && git add -A && git commit -q -m start${extra}`, {
    werkmap: root,
    env: GIT_ENV,
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return root;
}

function repoVan(root: string) {
  const ctx = {
    root,
    cwd: root,
    config,
    read: (rel: string) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : null),
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
  };
  return { root, git: gitIn(root), ctx, now: () => (klok += 1000) };
}

const isBlok = (u: { stdout?: string }) => (u.stdout ?? '').includes('"decision":"block"');

/** Zoals `rails/hooks/effect.mjs`: een interne fout na het commando valt dicht met een blokkade. */
function alsHook(stap: () => { stdout?: string }): { stdout?: string } {
  try {
    return stap();
  } catch (fout) {
    return { stdout: JSON.stringify({ decision: 'block', reason: String(fout) }) };
  }
}

/** Het commando echt, in de kooi, met de hooks eromheen: `deny` als post- of subagent-stop-hook blokkeert. */
function achteraf(commando: string, rol: string, na?: string): 'deny' | 'door' {
  const root = beginstand(na);
  const repo = repoVan(root);
  const basis = { session_id: 's1', agent_type: rol, agent_id: `agent-${rol}` };
  const input = { ...basis, tool_name: 'Bash', tool_input: { command: commando }, tool_use_id: 't1' };
  handle('subagent-start', basis, repo);
  handle('pre', input, repo);
  inKooi(`{ ${commando}\n} > /dev/null 2>&1`, { werkmap: root, env: GIT_ENV, timeout: 10_000 });
  const post = alsHook(() => handle('post', input, repo));
  const stop = alsHook(() => handle('subagent-stop', basis, repo));
  return isBlok(post) || isBlok(stop) ? 'deny' : 'door';
}

describe('specarchief-en-bouwvorm/AC-3: de toets op effect laat alleen een verhuizing naar het specarchief door', () => {
  test.each(['git mv docs/specs/x.md docs/specs/archief/x.md', 'mv docs/specs/x.md docs/specs/archief/x.md'])(
    'specarchief-en-bouwvorm/AC-3 architect: %s gaat door',
    (commando) => {
      expect(achteraf(commando, 'architect')).toBe('door');
    },
  );

  test.each([
    ['een kopie zonder verwijdering', 'cp docs/specs/x.md docs/specs/archief/x.md', undefined],
    ['een andere naam', 'git mv docs/specs/x.md docs/specs/archief/y.md', undefined],
    ['een nieuw bestand', "printf 'x\\n' > docs/specs/archief/nieuw.md", undefined],
    [
      'een gewijzigde inhoud',
      'git mv docs/specs/x.md docs/specs/archief/x.md && echo x >> docs/specs/archief/x.md',
      undefined,
    ],
    [
      'een bestaand archiefbestand overschreven',
      'mv docs/specs/x.md docs/specs/archief/x.md',
      "printf 'oud\\n' > docs/specs/archief/x.md && git add -A && git commit -qm archief",
    ],
  ])('specarchief-en-bouwvorm/AC-3 architect: %s is een blokkade', (_naam, commando, na) => {
    expect(achteraf(commando, 'architect', na)).toBe('deny');
  });
});
