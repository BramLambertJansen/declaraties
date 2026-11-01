import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// PR 6a: het rolhek weigert elke Bash-schrijf- of verwijderactie op een archiefpad (docs/adr/archief/), voor elke rol, ook de
// hoofdsessie (framework §10, R-CI-06, AC-2). Enige uitzondering: `git mv` van een ADR naar archief/ met dezelfde bestandsnaam.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const adr = (nr: string, status: string): string => `# ${nr} — Titel\n\nStatus: ${status}\n\n## Besluit\n\nIets.\n`;
const ARCHIEF = 'docs/adr/archief/0001-x.md';
const GEWOON = 'docs/adr/0002-y.md';
const FILES: Record<string, string> = {
  [ARCHIEF]: adr('0001', 'vervallen'),
  [GEWOON]: adr('0002', 'geaccepteerd'),
  'docs/adr/0001-x.md': adr('0001', 'geaccepteerd'),
};
const DIRS = new Set(['docs', 'docs/adr', 'docs/adr/archief']);

const ctx = {
  root: ROOT,
  cwd: ROOT,
  config,
  read: (rel: string) => FILES[rel] ?? null,
  committed: (rel: string) => rel in FILES,
  isDir: (rel: string) => DIRS.has(rel),
  // De bestanden onder een map (repo-relatief; '' is de hele repo).
  files: (rel: string) => Object.keys(FILES).filter((file) => rel === '' || file === rel || file.startsWith(`${rel}/`)),
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

const ROLLEN: readonly (string | undefined)[] = [undefined, 'developer', 'architect'];
const naam = (rol: string | undefined): string => rol ?? 'hoofdsessie';

describe('archief: elke Bash-schrijf- of verwijderactie is deny', () => {
  const COMMANDOS = [
    `echo x > ${ARCHIEF}`,
    `cp a ${ARCHIEF}`,
    `rm ${ARCHIEF}`,
    `sed -i s/a/b/ ${ARCHIEF}`,
    `mv ${ARCHIEF} /tmp/x`,
    'tee docs/adr/archief/0003-nieuw.md',
  ];

  test.each(ROLLEN.flatMap((rol) => COMMANDOS.map((command) => ({ rol, command }))))(
    '$rol: $command',
    ({ rol, command }) => {
      expect([naam(rol), verdict(command, rol)]).toStrictEqual([naam(rol), 'deny']);
    },
  );
});

describe('archief: git mv naar archief/', () => {
  test.each([`git mv ${GEWOON} docs/adr/archief/0002-y.md`, `git mv ${GEWOON} docs/adr/archief/`])(
    'hoofdsessie: %s is geen deny (dezelfde bestandsnaam)',
    (command) => {
      expect(verdict(command)).not.toBe('deny');
    },
  );

  test('hoofdsessie: een andere doelnaam is deny', () => {
    expect(verdict(`git mv ${GEWOON} docs/adr/archief/0009-ander.md`)).toBe('deny');
  });
});

describe('B1: de uitzondering geldt alleen voor een doel dat nog niet bestaat en zonder andere schrijfdoelen', () => {
  test.each([
    'git mv -f docs/adr/0001-x.md docs/adr/archief/',
    'git mv -f docs/adr/0001-x.md docs/adr/archief/0001-x.md',
    'git mv docs/adr/0001-x.md docs/adr/archief/0001-x.md',
    'git mv docs/adr/0001-x.md docs/adr/archief/',
    `git mv ${GEWOON} docs/adr/archief/0002-y.md 2>${ARCHIEF}`,
  ])('hoofdsessie: %s is deny', (command) => {
    expect(verdict(command)).toBe('deny');
  });

  test.each([`git mv ${GEWOON} docs/adr/archief/`, `git mv ${GEWOON} docs/adr/archief/0002-y.md`])(
    'hoofdsessie: %s blijft geen deny (doel bestaat niet)',
    (command) => {
      expect(verdict(command)).not.toBe('deny');
    },
  );

  test.each([
    'cp --target-directory=docs/adr/archief /tmp/0001-x.md',
    'cp -tdocs/adr/archief /tmp/0001-x.md',
    'mv -t docs/adr/archief /tmp/0001-x.md',
  ])('hoofdsessie en developer: %s is deny', (command) => {
    expect([verdict(command), verdict(command, 'developer')]).toStrictEqual(['deny', 'deny']);
  });
});

describe('git restore van een archiefbestand: alleen de index is geen schrijfactie', () => {
  test(`hoofdsessie: git restore --staged ${ARCHIEF} is geen deny`, () => {
    expect(verdict(`git restore --staged ${ARCHIEF}`)).not.toBe('deny');
  });
  test.each([
    `git restore ${ARCHIEF}`,
    `git restore --staged --worktree ${ARCHIEF}`,
    `git restore --staged x 2>${ARCHIEF}`,
  ])('hoofdsessie: %s is deny', (command) => {
    expect(verdict(command)).toBe('deny');
  });
});

describe('I2: checkout en restore van het archief', () => {
  test.each(['git checkout HEAD -- docs/adr/archief', 'git restore docs/adr/archief'])(
    'hoofdsessie: %s is deny',
    (command) => {
      expect(verdict(command)).toBe('deny');
    },
  );
});
