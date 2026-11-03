import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { zelfladendPatroon } from '../../rails/hooks/lib/zelfladend.mjs';

// Spec rolhek-vooraf-krimp AC-3 (ADR 0071 punt 2): wat git, Claude Code of pnpm zelf laadt, toetst het rolhek vooraf op elk
// woord van het commando. `.git/**` is deny voor elke rol; de andere zelfladende paden deny voor een subagent en ask voor de
// hoofdsessie.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const ctx = {
  root: ROOT,
  cwd: ROOT,
  config,
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/x',
};

type Verdict = 'allow' | 'ask' | 'deny' | 'context';

function verdict(command: string, agent?: string): Verdict {
  const d = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    ctx,
  );
  if (d.deny.length > 0) return 'deny';
  if (d.ask.length > 0) return 'ask';
  return d.context.length > 0 ? 'context' : 'allow';
}

function redenen(command: string, agent?: string): string {
  const d = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    ctx,
  );
  return [...d.deny, ...d.ask].join('\n');
}

describe('rolhek-vooraf-krimp/AC-3: de vaste lijst in .claude/gates.json', () => {
  test('de lijst uit de spec, met .cache als uitzondering', () => {
    expect(config.zelfladend).toStrictEqual([
      '.git/**',
      '.claude/hooks/**',
      '!.claude/hooks/.cache/**',
      '.claude/settings.json',
      'lefthook.yml',
      '.pnpmfile.cjs',
    ]);
  });

  test.each([
    ['.git/config', '.git/**'],
    ['.git', '.git/**'],
    ['.Git/config', '.git/**'],
    ['.claude/hooks/effect.mjs', '.claude/hooks/**'],
    ['.claude/settings.json', '.claude/settings.json'],
    ['lefthook.yml', 'lefthook.yml'],
    ['.pnpmfile.cjs', '.pnpmfile.cjs'],
    ['.gi[t]/hooks/x', '.git/**'],
    ['.g?t/config', '.git/**'],
    ['*.yml', 'lefthook.yml'],
  ])('%s wijst naar %s', (rel, patroon) => {
    expect(zelfladendPatroon(rel, config.zelfladend ?? [])).toBe(patroon);
  });

  test.each([
    '.claude/hooks/.cache/stub.mjs',
    '.claude/settings.local.json',
    '.claude',
    'src/lefthook.yml',
    '*.json',
    '?git/config',
  ])('%s wijst nergens naar', (rel) => {
    expect(zelfladendPatroon(rel, config.zelfladend ?? [])).toBeNull();
  });
});

describe('rolhek-vooraf-krimp/AC-3: bewijs voor de developer', () => {
  test.each([
    'cp x .git/hooks/pre-commit',
    'tee .git/config',
    'dd of=.git/packed-refs',
    `node -e "require('fs').writeFileSync('.git/refs/remotes/origin/main','x')"`,
    'cat x > .git/hooks/pre-commit',
    'git show HEAD:x > .git/hooks/pre-commit',
    'git diff --output=.git/hooks/pre-commit',
    'git format-patch -o .git/hooks',
    'cp x .gi[t]/hooks/pre-commit',
    `node -e "require('fs').writeFileSync('.claude/hooks/effect.mjs','x')"`,
    'git checkout main -- .claude/hooks/effect.mjs',
    'git restore --source=main lefthook.yml',
    'git apply x.patch',
    'git stash pop',
    'git checkout main .',
    'git checkout main .claude',
    'git restore .',
    // Review PR 1: omwegen langs een andere map, pathspec-magie, mappen boven zelfladende paden en sed-schrijfcommando's.
    'git -C .git/hooks checkout main -- pre-commit',
    'cd .git && git checkout main -- hooks/pre-commit',
    'cd .claude && cp /tmp/x hooks/effect.mjs',
    'cd src && echo x > ../lefthook.yml',
    'git --work-tree=/tmp/w checkout main -- src/x.ts',
    'git --git-dir=.git --work-tree=. restore src/x.ts',
    'git checkout main -- :/lefthook.yml',
    'git checkout main -- :(top).claude/settings.json',
    'git checkout main -- src/../lefthook.yml',
    'git checkout main -- lefthook\\.yml',
    'git restore --pathspec-from-file=/tmp/lijst',
    'git checkout main --pathspec-from-file=/tmp/lijst',
    'git apply -- x.patch',
    'git am -- x.mbox',
    'cp -r /tmp/x/. .',
    'cp -r /tmp/x .claude',
    'rsync -a /tmp/x/ .',
    'cp /tmp/x/.pnpmfile.cjs /tmp/x/lefthook.yml .',
    'mv /tmp/hooks .claude/',
    'tar -xf x.tar',
    'tar -x -f x.tar -C .claude',
    'tar --extract --file=x.tar --directory=.',
    'unzip -o x.zip',
    'unzip x.zip -d .claude',
    "sed -n 'w .claude/settings.json' src/x.ts",
    "sed 's/a/b/w lefthook.yml' src/x.ts",
    'sed -f script.sed lefthook.yml',
    // Tweede reviewronde: omhulsels, variabele mappen, paden als branchnaam, wissen boven zelfladende paden, git buiten de
    // leeslijst, sed-commando's en meer uitpakkers.
    'env -C .claude git checkout -- hooks/x.mjs',
    'env --chdir=.claude cp /tmp/x hooks/x.mjs',
    'D=.claude; cd $D && git checkout -- hooks/x.mjs',
    'cd "$(echo .claude)" && cp /tmp/x hooks/x.mjs',
    'git checkout .',
    'git checkout .claude',
    'rm -rf .claude',
    'rm -rf .',
    'mv .claude /tmp/o',
    'mv /tmp/evil .claude',
    'find . -delete',
    'find .claude -exec rm {} +',
    'git merge-file lefthook.yml a b',
    'git clone /tmp/r .claude/hooks/new',
    'git submodule add /tmp/r .claude/hooks/s',
    'git bundle create .git/x HEAD',
    "sed 's|a|b|w lefthook.yml' src/x",
    "sed '$!w lefthook.yml' src/x",
    "sed 'e cp /tmp/x lefthook.yml' src/x",
    "sed -e 's/a/b/e' lefthook.yml",
    'bsdtar -xf x.tar',
    'cpio -id < x.cpio',
    '7z x x.zip',
    '7z x x.zip -o.claude',
    // Derde reviewronde.
    'cp --target-directory=.claude /tmp/x/settings.json',
    'cp -t.claude /tmp/x/settings.json',
    'mv -t.claude /tmp/x/settings.json',
    'mv --target-directory=.claude /tmp/x/hooks',
    'ln -t.claude /tmp/x/settings.json',
    'git rm -r .claude',
    'git rm -rf .',
    'cd .claude && git rm -r .',
    "git rm -r ':/'",
    'git mv .claude x',
    'git sparse-checkout set src',
    'env -C.claude cp /tmp/x hooks/x.mjs',
    'cd ~ && cp /tmp/x lefthook.yml',
    'cd - && cp /tmp/x lefthook.yml',
  ])('%s is deny', (command) => {
    expect(verdict(command, 'developer')).toBe('deny');
  });

  test.each([
    'git checkout -- src/x.ts',
    'git restore src/x.ts',
    'git checkout feat/x',
    'git switch -c feat/y',
    'cat .git/HEAD',
    'jq . .claude/settings.json',
    'sed -n 1p lefthook.yml',
    'ls .claude/hooks',
    'echo x > /tmp/x/.git/config',
    'echo x > .claude/hooks/.cache/stub.mjs',
    'git -C /tmp/elders checkout main -- x',
    'cd src && echo x > lefthook.yml',
    'cp -r /tmp/x src/y',
    'cp /tmp/a src/b',
    'tar -xf x.tar -C /tmp/y',
    'unzip x.zip -d /tmp/y',
    "sed -n '/x/p' lefthook.yml",
    'git checkout main -- src/x.ts',
    'git checkout src',
    'cd "$(git rev-parse --show-toplevel)" && echo x > src/x.ts',
    'cd $D && git status',
    'cd $D && cat lefthook.yml',
    'rm -rf src/tmp',
    'mv src/a.ts src/b.ts',
    'find src -name x.tmp -delete',
    'git log -p lefthook.yml',
    'git add lefthook.yml',
    'git commit -m "lefthook.yml bijgewerkt"',
    "sed -n '1,5p' lefthook.yml",
    'tar -tf x.tar',
    '7z l x.zip',
    'git rm --cached -r .claude',
    'git rm src/x.ts',
    'git mv src/a.ts src/b.ts',
    'cp -t src /tmp/a.ts',
  ])('%s raakt de zelfladende regel niet', (command) => {
    expect(redenen(command, 'developer')).not.toContain('zelfladend');
  });
});

describe('rolhek-vooraf-krimp/AC-3: de hoofdsessie', () => {
  test('tee .git/config is deny', () => {
    expect(verdict('tee .git/config')).toBe('deny');
  });

  test.each(['rm -rf .claude', 'mv .claude /tmp/o', 'git checkout .claude', 'cd $D && echo x > hooks/x.mjs'])(
    '%s is ask',
    (command) => {
      expect(verdict(command)).toBe('ask');
    },
  );

  test('git checkout <ref> -- .claude/hooks/effect.mjs is ask', () => {
    expect(verdict('git checkout main -- .claude/hooks/effect.mjs')).toBe('ask');
  });

  test.each([
    'git push -u origin feat/x',
    'git fetch origin main',
    'cat .git/HEAD',
    'jq . .claude/settings.json',
    'git merge origin/main',
    'git stash pop',
    'git checkout feat/y',
  ])('%s gaat door', (command) => {
    expect(redenen(command)).not.toContain('zelfladend');
  });
});
