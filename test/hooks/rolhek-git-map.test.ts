import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// ADR 0033 (anker en onderhoudsmodus): remote-URL, refs en objecten staan in `.git`; de vertrouwensbasis mag nooit door een
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
