import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// ADR 0045 (anker en onderhoudsmodus): remote-URL, refs en objecten staan in `.git`; de vertrouwensbasis mag nooit door een
// Edit/Write van welke rol ook worden gewijzigd, in of buiten de onderhoudsmodus.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const basis = {
  root: ROOT,
  cwd: ROOT,
  config,
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/x',
};

const write = (file: string, agent?: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: file, content: 'x\n' },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

describe('schrijven in .git is verboden voor elke rol', () => {
  test.each([undefined, 'developer', 'tester', 'architect', 'reviewer', 'docs', 'onbekend'])(
    'rol %s: Write op .git/config geeft een deny',
    (agent) => {
      const decision = decide(write(`${ROOT}/.git/config`, agent), basis);

      expect(decision.deny.join('\n')).toMatch(/\.git is verboden/);
    },
  );

  test.each([
    `${ROOT}/.git/refs/remotes/origin/main`,
    `${ROOT}/.git/objects/ab/cdef`,
    `${ROOT}/.GIT/config`,
    `${ROOT}/.Git/config`,
    `${ROOT}/sub/.git/config`,
    `${ROOT}\\.git\\config`,
  ])('%s geeft een deny', (file) => {
    expect(decide(write(file), basis).deny).not.toStrictEqual([]);
  });

  test.each([`${ROOT}/.github/CODEOWNERS`, `${ROOT}/.gitignore`, `${ROOT}/docs/.gitkeep`, `${ROOT}/src/x.git.ts`])(
    '%s is geen .git-map en geeft geen .git-deny',
    (file) => {
      expect(decide(write(file), basis).deny.join('\n')).not.toMatch(/\.git is verboden/);
    },
  );

  test('met de onderhoudsmodus aan blijft de deny staan', () => {
    const decision = decide(write(`${ROOT}/.git/config`), { ...basis, onderhoud: true });

    expect(decision.deny.join('\n')).toMatch(/\.git is verboden/);
  });
});

// De onderhoudsmodus geldt alleen in de template-repo: daar mag de agent frameworkwerk doen, in een app blijft `.claude/**` dicht.
describe('template tegenover app: .claude/settings.local.json', () => {
  const lokaal = (agent?: string) => write(`${ROOT}/.claude/settings.local.json`, agent);

  test('in een app (modus uit) vraagt het rolhek de hoofdsessie', () => {
    expect(decide(lokaal(), { ...basis, onderhoud: false }).ask).not.toStrictEqual([]);
  });

  test('in een app (modus uit) weigert het rolhek de developer', () => {
    expect(decide(lokaal('developer'), { ...basis, onderhoud: false }).deny).not.toStrictEqual([]);
  });

  test('in de template (modus aan) geeft het rolhek de hoofdsessie en de developer alleen een melding', () => {
    for (const agent of [undefined, 'developer']) {
      const decision = decide(lokaal(agent), { ...basis, onderhoud: true });

      expect([decision.ask, decision.deny]).toStrictEqual([[], []]);
    }
  });
});

// Dezelfde grens via Bash: een commando dat in `.git` schrijft is voor elke rol een deny, ook de hoofdsessie.
describe('schrijven in .git via Bash is verboden voor elke rol', () => {
  const bash = (command: string, agent?: string) => ({
    tool_name: 'Bash',
    tool_input: { command },
    ...(agent === undefined ? {} : { agent_type: agent }),
  });

  test.each([
    "sed -i 's#BramLambertJansen/template#evil/template#' .git/config",
    'echo x >> .git/config',
    'cp evil.cfg .git/config',
    'tee .git/config < evil.cfg',
    'dd if=evil.cfg of=.git/config',
    'ln -s .git/config sneaky',
    'mv x .Git/config',
    'rm -f .git/refs/remotes/origin/main',
  ])('%s geeft een deny', (command) => {
    for (const agent of [undefined, 'developer']) {
      expect(decide(bash(command, agent), { ...basis, onderhoud: true }).deny.join('\n')).toMatch(/\.git is verboden/);
    }
  });

  test.each(['echo x >> .gitignore', 'cp a.txt .github/x.txt', 'ls .git', 'git status'])(
    '%s geeft geen .git-deny',
    (command) => {
      expect(decide(bash(command), { ...basis, onderhoud: true }).deny.join('\n')).not.toMatch(/\.git is verboden/);
    },
  );
});
