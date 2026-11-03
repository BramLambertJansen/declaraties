import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { handle, nacontrole } from '../../rails/hooks/lib/effect-hooks.mjs';
import { gitIn } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { opslag, overtredingen } from '../../rails/hooks/lib/effect.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { neemOver } from '../../scripts/kit/rolhek-overnemen.mjs';

// docs/specs/rolhek-effect.md (ADR 0066): na een Bash-commando van een subagent krijgt elk pad dat echt veranderde de
// beslissing van een Edit van die rol, welk programma ook schreef. Echte tijdelijke git-repository's; de commando's draaien
// echt, de hooks via `handle` met dezelfde payload als Claude Code.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
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

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sh(root: string, command: string): void {
  const result = spawnSync('bash', ['-c', command], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
  });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}`);
}

function schrijf(root: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

function nieuweRepo(): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'rolhek-effect-')));
  dirs.push(root);
  sh(root, 'git init -q -b main');
  schrijf(root, 'src/a.ts', 'a\nb\n');
  schrijf(root, 'rails/x.mjs', 'x\n');
  schrijf(root, 'test/a.test.ts', "test('een', () => {});\ntest('twee', () => {});\n");
  schrijf(root, '.gitignore', 'node_modules/\n');
  sh(root, 'git add -A && git commit -qm start');
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
    branch: 'main',
  };
  return { root, git: gitIn(root), ctx, now: () => (klok += 1000) };
}

type Rol = '' | 'tester' | 'developer' | 'reviewer';
let teller = 0;

function payload(rol: Rol, extra: Record<string, unknown> = {}) {
  return { session_id: 's1', ...(rol === '' ? {} : { agent_type: rol, agent_id: `agent-${rol}` }), ...extra };
}

/** PreToolUse, het commando, PostToolUse: de uitslag van PostToolUse. */
function bash(root: string, rol: Rol, command: string) {
  const repo = repoVan(root);
  const id = `t${String((teller += 1))}`;
  const input = payload(rol, { tool_name: 'Bash', tool_input: { command }, tool_use_id: id });
  handle('pre', input, repo);
  sh(root, command);
  return handle('post', input, repo);
}

function geblokkeerd(uitslag: { stdout?: string }): string {
  const tekst = uitslag.stdout ?? '';
  return tekst.includes('"decision":"block"') ? tekst : '';
}

describe('rolhek-effect/AC-3: elk programma, dezelfde beslissing als een Edit', () => {
  test.each([
    ['node -e', `node -e "require('fs').writeFileSync('src/a.ts','x')"`, 'src/a.ts'],
    ['python3 -c', `python3 -c "open('src/a.ts','w').write('x')"`, 'src/a.ts'],
    ['sed --in-place=.bak', 'sed --in-place=.bak s/a/z/ src/a.ts', 'src/a.ts'],
    ['shred -u', 'shred -u src/a.ts', 'src/a.ts'],
    ['curl -o', 'printf q > /tmp/rolhek-effect-bron && curl -s -o src/a.ts file:///tmp/rolhek-effect-bron', 'src/a.ts'],
    [
      'tar -x -C',
      'mkdir -p /tmp/rolhek-effect-tar && printf t > /tmp/rolhek-effect-tar/n.ts && tar -cf /tmp/rolhek-effect.tar -C /tmp/rolhek-effect-tar n.ts && tar -x -C src -f /tmp/rolhek-effect.tar',
      'src/n.ts',
    ],
    [
      'patch',
      `printf -- '--- a/src/a.ts\\n+++ b/src/a.ts\\n@@ -1,2 +1,2 @@\\n-a\\n+p\\n b\\n' > /tmp/rolhek-effect.diff && patch -s -p1 < /tmp/rolhek-effect.diff`,
      'src/a.ts',
    ],
    [
      'git apply',
      `printf -- '--- a/src/a.ts\\n+++ b/src/a.ts\\n@@ -1,2 +1,2 @@\\n-a\\n+g\\n b\\n' > /tmp/rolhek-effect-g.diff && git apply /tmp/rolhek-effect-g.diff`,
      'src/a.ts',
    ],
    ['git update-index --skip-worktree', 'git update-index --skip-worktree src/a.ts', 'src/a.ts'],
  ])('tester: %s schrijft buiten de testpaden en wordt geblokkeerd', (_, command, pad) => {
    const root = nieuweRepo();
    const uitslag = geblokkeerd(bash(root, 'tester', command));
    expect(uitslag).toContain(pad);
    expect(uitslag).toContain('rol tester mag');
  });

  test.each([
    ['git reset --har', 'git reset -q --har'],
    ['git checkout -f', 'git checkout -q -f'],
    ['git stash', 'git stash -q'],
  ])('tester: %s zet een wijziging van de hoofdsessie terug en wordt geblokkeerd', (_, command) => {
    const root = nieuweRepo();
    schrijf(root, 'src/a.ts', 'van de hoofdsessie\n');
    expect(geblokkeerd(bash(root, 'tester', command))).toContain('src/a.ts');
  });

  test('tester: git clean -fd wist een nieuw bestand buiten de testpaden en wordt geblokkeerd', () => {
    const root = nieuweRepo();
    schrijf(root, 'src/nieuw.ts', 'n\n');
    expect(geblokkeerd(bash(root, 'tester', 'git clean -q -fd'))).toContain('src/nieuw.ts');
  });

  test('developer: node -e schrijft rails/** (voorReview) en wordt geblokkeerd', () => {
    const root = nieuweRepo();
    const uitslag = geblokkeerd(bash(root, 'developer', `node -e "require('fs').writeFileSync('rails/x.mjs','y')"`));
    expect(uitslag).toContain('rails/x.mjs');
  });

  test('vooraf laat het rolhek deze commando’s vandaag door (zonder deze toets geen weigering)', () => {
    const ctx = {
      root: '/repo',
      cwd: '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'main',
    };
    const commando = `node -e "require('fs').writeFileSync('rails/x.mjs','y')"`;
    const besluit = decide({ tool_name: 'Bash', tool_input: { command: commando }, agent_type: 'developer' }, ctx);
    expect(besluit.deny).toStrictEqual([]);
  });

  test('tester zet test.skip in een testbestand dat al gewijzigd was: geblokkeerd op de inhoud van vóór het commando', () => {
    const root = nieuweRepo();
    schrijf(root, 'test/a.test.ts', "test('een', () => {});\ntest('twee', () => {});\ntest('drie', () => {});\n");
    const uitslag = geblokkeerd(bash(root, 'tester', `sed -i "s/test('drie'/test.skip('drie'/" test/a.test.ts`));
    expect(uitslag).toContain('skippen');
  });

  test('tester staget een test.skip en laat de werkmap ongemoeid: geblokkeerd op de index', () => {
    const root = nieuweRepo();
    const command = [
      `sed "s/test('twee'/test.skip('twee'/" test/a.test.ts > t.tmp`,
      'git update-index --cacheinfo "100644,$(git hash-object -w t.tmp),test/a.test.ts"',
      'rm t.tmp',
    ].join(' && ');
    expect(geblokkeerd(bash(root, 'tester', command))).toContain('skippen');
  });

  test('tester verwijdert een bestaande test en commit dat in één commando: geblokkeerd', () => {
    const root = nieuweRepo();
    expect(geblokkeerd(bash(root, 'tester', 'git rm -q test/a.test.ts && git commit -qm weg'))).toContain(
      'test/a.test.ts',
    );
  });
});

describe('rolhek-effect/AC-1: wat de momentopname ziet', () => {
  test('een .gitignore die zichzelf negeert, en het bestand ernaast', () => {
    const root = nieuweRepo();
    const uitslag = geblokkeerd(
      bash(root, 'developer', `printf '*\\n' > rails/.gitignore && printf n > rails/nieuw.mjs`),
    );
    expect(uitslag).toContain('rails/.gitignore');
    expect(uitslag).toContain('rails/nieuw.mjs');
  });

  test('alleen de gestagede inhoud van een beschermd bestand vervangen', () => {
    const root = nieuweRepo();
    schrijf(root, 'rails/x.mjs', 'gestaged\n');
    sh(root, 'git add rails/x.mjs');
    const command = `git update-index --cacheinfo 100644,$(printf ander | git hash-object -w --stdin),rails/x.mjs`;
    expect(geblokkeerd(bash(root, 'developer', command))).toContain('rails/x.mjs');
  });

  test('python3 schrijft .claude/settings.local.json (genegeerd) en .git/config', () => {
    const root = nieuweRepo();
    sh(root, `printf '.claude/settings.local.json\\n' >> .git/info/exclude`);
    const uitslag = geblokkeerd(
      bash(
        root,
        'developer',
        `python3 -c "import os; os.makedirs('.claude', exist_ok=True); open('.claude/settings.local.json','w').write('{}'); open('.git/config','a').write('[x]\\n')"`,
      ),
    );
    expect(uitslag).toContain('.claude/settings.local.json');
    expect(uitslag).toContain('.git/config');
  });
});

describe('rolhek-effect/AC-2: alleen wat dit commando veranderde', () => {
  test('een eerdere Edit van de hoofdsessie maakt een latere schrijfactie van de subagent niet vrij', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    handle('subagent-start', payload('developer'), repo);
    schrijf(root, 'rails/x.mjs', 'hoofd\n');
    handle(
      'edit-post',
      payload('', { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'rails/x.mjs') } }),
      repo,
    );
    expect(geblokkeerd(handle('subagent-stop', payload('developer'), repo))).toBe('');
    schrijf(root, 'rails/x.mjs', 'later\n');
    expect(geblokkeerd(handle('stop', payload(''), repo))).toContain('rails/x.mjs');
  });

  test('een pad dat al afweek en gelijk bleef, telt niet', () => {
    const root = nieuweRepo();
    schrijf(root, 'rails/x.mjs', 'van de hoofdsessie\n');
    expect(geblokkeerd(bash(root, 'tester', 'printf t > test/b.test.ts'))).toBe('');
  });

  test('git commit na schrijven: de verschoven HEAD verraadt het pad', () => {
    const root = nieuweRepo();
    const uitslag = geblokkeerd(bash(root, 'developer', `printf y > rails/x.mjs && git commit -qam x`));
    expect(uitslag).toContain('rails/x.mjs');
  });

  test('een Edit van de hoofdsessie in hetzelfde venster telt niet voor de subagent', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    const input = payload('tester', { tool_name: 'Bash', tool_input: { command: 'true' }, tool_use_id: 'v1' });
    handle('pre', input, repo);
    schrijf(root, 'src/a.ts', 'hoofdsessie\n');
    handle(
      'edit-post',
      payload('', { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src/a.ts') } }),
      repo,
    );
    expect(geblokkeerd(handle('post', input, repo))).toBe('');
  });

  test('een andere branch dan de huidige (git branch -f) is deny; een tag of eigen stash niet', () => {
    const root = nieuweRepo();
    expect(geblokkeerd(bash(root, 'developer', 'git branch -q ander'))).toContain('.git/refs/heads/ander');
    expect(geblokkeerd(bash(root, 'developer', 'git tag v9'))).toBe('');
    schrijf(root, 'test/a.test.ts', "test('een', () => {});\ntest('twee', () => {});\ntest('drie', () => {});\n");
    expect(geblokkeerd(bash(root, 'tester', 'git stash -q && git stash pop -q'))).toBe('');
  });

  test('de hoofdsessie komt nooit op de lijst, ook niet op een beschermd pad', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    expect(geblokkeerd(bash(root, '', 'printf y > rails/x.mjs'))).toBe('');
    expect(overtredingen(repo)).toStrictEqual([]);
  });
});

describe('rolhek-effect/AC-4: eindvergelijking bij SubagentStop en daarna', () => {
  test('een achtergrondschrijfactie na PostToolUse: SubagentStop blokkeert één keer', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    handle('subagent-start', payload('tester'), repo);
    expect(geblokkeerd(bash(root, 'tester', 'true'))).toBe('');
    schrijf(root, 'src/a.ts', 'later\n');
    expect(geblokkeerd(handle('subagent-stop', payload('tester'), repo))).toContain('src/a.ts');
    expect(geblokkeerd(handle('subagent-stop', payload('tester', { stop_hook_active: true }), repo))).toBe('');
  });

  test('schrijven na SubagentStop: de Stop van de hoofdsessie ziet het', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    handle('subagent-start', payload('tester'), repo);
    expect(geblokkeerd(handle('subagent-stop', payload('tester'), repo))).toBe('');
    schrijf(root, 'rails/x.mjs', 'na de stop\n');
    expect(geblokkeerd(handle('stop', payload(''), repo))).toContain('rails/x.mjs');
  });

  test('een mislukt commando (PostToolUseFailure) geeft context, geen blokkade, en zet het pad op de lijst', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    const input = payload('tester', { tool_name: 'Bash', tool_input: { command: 'x' }, tool_use_id: 'f1' });
    handle('pre', input, repo);
    schrijf(root, 'src/a.ts', 'half\n');
    const uitslag = handle('post-failure', input, repo).stdout ?? '';
    expect(uitslag).toContain('additionalContext');
    expect(overtredingen(repo).map((o) => o.rel)).toContain('src/a.ts');
  });
});

describe('rolhek-effect/AC-5: de lijst voor de hoofdsessie', () => {
  test('context bij elke tool-aanroep, één blokkade per stop, vervalt na terugzetten', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    geblokkeerd(bash(root, 'tester', 'printf x > src/a.ts'));
    const pre = handle(
      'pre',
      payload('', { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 'h1' }),
      repo,
    );
    expect(pre.stdout ?? '').toContain('src/a.ts');
    expect(geblokkeerd(handle('stop', payload(''), repo))).toContain('src/a.ts');
    expect(geblokkeerd(handle('stop', payload('', { stop_hook_active: true }), repo))).toBe('');
    sh(root, 'git checkout -q -- src/a.ts');
    expect(geblokkeerd(handle('stop', payload(''), repo))).toBe('');
  });

  test('de subagent zet zijn eigen overtreding terug: geen nieuwe overtreding', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    expect(geblokkeerd(bash(root, 'tester', 'printf x > src/a.ts'))).toContain('src/a.ts');
    expect(geblokkeerd(bash(root, 'tester', 'git checkout -q -- src/a.ts'))).toBe('');
    expect(overtredingen(repo)).toStrictEqual([]);
  });

  test('rolhek:overnemen heft de overtreding op; de huidige staat telt daarna niet meer', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    geblokkeerd(bash(root, 'tester', 'printf x > src/a.ts'));
    expect(neemOver(['src/a.ts'], repo).map((o) => o.rel)).toStrictEqual(['src/a.ts']);
    expect(overtredingen(repo)).toStrictEqual([]);
    expect(geblokkeerd(handle('stop', payload(''), repo))).toBe('');
    expect(() => neemOver(['src/onbekend.ts'], repo)).toThrow('Geen open overtreding');
  });

  test('het rolhek vraagt de hoofdsessie bij rolhek:overnemen en weigert het een subagent', () => {
    const ctx = {
      root: '/repo',
      cwd: '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'main',
    };
    const call = (agent?: string) =>
      decide(
        {
          tool_name: 'Bash',
          tool_input: { command: 'pnpm rolhek:overnemen src/a.ts' },
          ...(agent === undefined ? {} : { agent_type: agent }),
        },
        ctx,
      );
    expect(call().ask.join(' ')).toContain('rolhek:overnemen');
    expect(call('developer').deny.join(' ')).toContain('rolhek:overnemen');
    expect(call('tester').deny.join(' ')).toContain('rolhek:overnemen');
  });
});

describe('rolhek-effect/AC-6: opslag buiten de sandbox en zonder vergelijkingspunt', () => {
  test('een gekoppelde worktree heeft een eigen deel van de opslag', () => {
    const root = nieuweRepo();
    const wt = `${root}-wt`;
    dirs.push(wt);
    // Argumenten, geen shell: het pad komt uit tmpdir().
    expect(
      spawnSync('git', ['worktree', 'add', '-q', wt], { cwd: root, env: { ...process.env, ...GIT_ENV } }).status,
    ).toBe(0);
    expect(opslag(repoVan(wt)).startsWith(path.join(root, '.git', 'rolhek-effect', 'wt-'))).toBe(true);
    handle('subagent-start', payload('reviewer'), repoVan(root));
    schrijf(wt, 'src/a.ts', 'in worktree b\n');
    expect(nacontrole(repoVan(wt), null)).toStrictEqual([]);
  });

  test('de opslag staat onder de git-common-dir en is in de sandbox dicht', () => {
    const root = nieuweRepo();
    expect(opslag(repoVan(root))).toBe(path.join(root, '.git', 'rolhek-effect'));
    const settings = readFileSync('.claude/settings.json', 'utf8');
    expect(settings).toContain('"denyWrite": ["./.git/rolhek-effect", "./.git/commondir"]');
    expect(settings).toContain('"pnpm rolhek:overnemen *"');
  });

  test('zonder momentopname van vóór toetst hij elk afwijkend pad en meldt dat', () => {
    const root = nieuweRepo();
    schrijf(root, 'test/b.test.ts', 't\n');
    const input = payload('tester', { tool_name: 'Bash', tool_input: { command: 'true' }, tool_use_id: 'zonder' });
    expect(handle('post', input, repoVan(root)).stdout ?? '').toContain('geen momentopname');
  });
});

describe('rolhek-effect/AC-6: de opslag is niet te verleggen', () => {
  test('.git/commondir verlegt de opslag niet, en schrijven ervan is deny', () => {
    const root = nieuweRepo();
    const uitslag = geblokkeerd(
      bash(root, 'developer', 'git clone -q --bare . test/nep.git && printf "../test/nep.git\\n" > .git/commondir'),
    );
    expect(uitslag).toContain('.git/commondir');
    expect(opslag(repoVan(root))).toBe(path.join(root, '.git', 'rolhek-effect'));
  });
});

describe('rolhek-effect/AC-7: dicht vallen', () => {
  test('een FIFO in plaats van een bestand laat de hook niet hangen', () => {
    const root = nieuweRepo();
    expect(geblokkeerd(bash(root, 'developer', 'rm rails/x.mjs && mkfifo rails/x.mjs'))).toContain('rails/x.mjs');
  });

  test('een bestandsnaam met een nieuwe regel legt de toets niet stil', () => {
    const root = nieuweRepo();
    expect(geblokkeerd(bash(root, 'tester', "touch $'test/a\\nb.test.ts'"))).toBe('');
    expect(geblokkeerd(bash(root, 'tester', "touch $'src/a\\nb.ts'"))).toContain('rol tester mag');
  });

  test('--alles ruimt ook een overtreding zonder pad uit een te grote opname op', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    sh(root, 'mkdir -p test/veel && cd test/veel && seq 1 5001 | xargs touch');
    handle('subagent-start', payload('tester'), repo);
    sh(root, 'rm -rf test/veel');
    handle('subagent-stop', payload('tester'), repo);
    expect(geblokkeerd(handle('stop', payload(''), repo))).toContain('hele werkmap');
    neemOver(['--alles'], repo);
    expect(geblokkeerd(handle('stop', payload(''), repo))).toBe('');
  });

  test('--alles laat een geldige opname van een andere subagent staan', () => {
    const root = nieuweRepo();
    const repo = repoVan(root);
    sh(root, 'mkdir -p test/veel && cd test/veel && seq 1 5001 | xargs touch');
    handle('subagent-start', payload('tester'), repo);
    sh(root, 'rm -rf test/veel');
    handle('subagent-start', payload('developer'), repo);
    handle('subagent-stop', payload('tester'), repo);
    neemOver(['--alles'], repo);
    schrijf(root, 'rails/y.mjs', 'x');
    expect(geblokkeerd(handle('stop', payload(''), repo))).toContain('rails/y.mjs');
  });

  test('meer dan 5000 paden: een overtreding zonder pad', () => {
    const root = nieuweRepo();
    sh(root, 'mkdir -p test/veel && cd test/veel && seq 1 5001 | xargs touch');
    const uitslag = geblokkeerd(bash(root, 'tester', 'true'));
    expect(uitslag).toContain('hele werkmap');
  });
});

describe('rolhek-effect/AC-8: lezen en schrijven binnen de rol', () => {
  test.each([
    ['tester', 'printf t > test/b.test.ts'],
    ['reviewer', 'git status --short'],
    [
      'developer',
      `node -e "require('fs').mkdirSync('src/web/lib',{recursive:true});require('fs').writeFileSync('src/web/lib/voorbeeld.ts','v')"`,
    ],
  ] as const)('%s: %s geeft geen uitslag', (rol, command) => {
    const root = nieuweRepo();
    expect(geblokkeerd(bash(root, rol, command))).toBe('');
  });
});

describe('rolhek-effect/AC-9: regelboek en roadmap', () => {
  const framework = readFileSync('docs/framework.md', 'utf8');
  test('R-ROL-09, R-ROL-10 en R-ROL-11 noemen de toets op effect', () => {
    const regel = (id: string) => framework.split('\n').find((line) => line.includes(`**${id}**`)) ?? '';
    expect(regel('R-ROL-09')).toContain('rolhek-effect');
    expect(regel('R-ROL-10')).toContain('rolhek-effect');
    expect(regel('R-ROL-11')).toContain('twee subagents');
  });

  test('de roadmap-items over schrijven buiten fileTargets zijn afgevinkt met verwijzing', () => {
    const roadmap = readFileSync('docs/roadmap.md', 'utf8');
    expect(roadmap).toMatch(
      /- \[x\] \*\*Schrijven via een programma buiten `fileTargets`[^\n]*\n(?:[^\n]*\n){0,8}[^\n]*rolhek-effect/,
    );
  });
});
