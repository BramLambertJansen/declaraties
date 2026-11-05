import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080 punt 1), AC-3 vooraf: het rolhek weigert elke rol elke schrijfactie in
// docs/specs/archief/ met de melding uit Hergebruik en UX; alleen `git mv docs/specs/<naam> docs/specs/archief/` met dezelfde
// naam gaat door. Vorm van rolhek-archief-bash.test.ts en rolhek-archief.test.ts. De toets op effect: rolhek-specarchief-effect.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
type Ctx = Parameters<typeof decide>[1];

const MELDING =
  'het archief is onwijzigbaar; via Bash alleen `git mv docs/adr/<naam> docs/adr/archief/` of `git mv docs/specs/<naam> docs/specs/archief/` met dezelfde naam (framework §10, R-CI-06)';

const spec = (status: string): string =>
  `---\nstatus: ${status}\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\nKit.\n`;
const ARCHIEF = 'docs/specs/archief/a.md';
const VERVALLEN = 'docs/specs/b.md';
const FILES: Record<string, string> = { [ARCHIEF]: spec('vervallen'), [VERVALLEN]: spec('vervallen') };
const DIRS = new Set(['docs', 'docs/specs', 'docs/specs/archief']);

const ctx: Ctx = {
  root: ROOT,
  cwd: ROOT,
  config,
  read: (rel: string) => FILES[rel] ?? null,
  committed: (rel: string) => rel in FILES,
  isDir: (rel: string) => DIRS.has(rel),
  files: (rel: string) => Object.keys(FILES).filter((file) => rel === '' || file === rel || file.startsWith(`${rel}/`)),
  branch: 'feat/x',
  authority: {
    registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
    repository: 'BramLambertJansen/template',
    branch: 'feat/x',
    trusted: (file) => FILES[file] ?? null,
    working: (file) => FILES[file] ?? null,
    safe: () => true,
  },
};

const ROLLEN: readonly (string | undefined)[] = [undefined, 'architect', 'developer', 'tester', 'reviewer', 'docs'];
const naam = (rol: string | undefined): string => rol ?? 'hoofdsessie';
const als = (rol: string | undefined) => (rol === undefined ? {} : { agent_type: rol });

function deny(payload: { tool_name: string; tool_input: Record<string, string> }, rol: string | undefined): string[] {
  return decide({ ...payload, ...als(rol) }, ctx).deny;
}

const bash = (command: string, rol?: string): string[] => deny({ tool_name: 'Bash', tool_input: { command } }, rol);

describe('specarchief-en-bouwvorm/AC-3: elke Bash-schrijfactie in docs/specs/archief/ is deny met de melding', () => {
  const SCHRIJVEN = [
    `echo x > ${ARCHIEF}`,
    `cp a ${ARCHIEF}`,
    `sed -i s/a/b/ ${ARCHIEF}`,
    'tee docs/specs/archief/nieuw.md',
    `cp ${VERVALLEN} docs/specs/archief/`,
  ];
  test.each(ROLLEN.flatMap((rol) => SCHRIJVEN.map((command) => ({ rol: naam(rol), agent: rol, command }))))(
    'specarchief-en-bouwvorm/AC-3 $rol: $command',
    ({ agent, command }) => {
      expect(bash(command, agent).join('\n')).toContain(MELDING);
    },
  );

  const WEG = [`rm ${ARCHIEF}`, `git rm -q ${ARCHIEF}`, `mv ${ARCHIEF} /tmp/x`, `unlink ${ARCHIEF}`];
  test.each(ROLLEN.flatMap((rol) => WEG.map((command) => ({ rol: naam(rol), agent: rol, command }))))(
    'specarchief-en-bouwvorm/AC-3 $rol verwijdert: $command is deny',
    ({ agent, command }) => {
      expect(bash(command, agent)).not.toStrictEqual([]);
    },
  );
});

describe('specarchief-en-bouwvorm/AC-3: git mv naar docs/specs/archief/ met dezelfde naam', () => {
  test.each([`git mv ${VERVALLEN} docs/specs/archief/`, `git mv ${VERVALLEN} docs/specs/archief/b.md`])(
    'specarchief-en-bouwvorm/AC-3 hoofdsessie: %s is geen deny',
    (command) => {
      expect(bash(command)).toStrictEqual([]);
    },
  );

  test.each([
    `git mv ${VERVALLEN} docs/specs/archief/ander.md`,
    `git mv -f docs/specs/a.md ${ARCHIEF}`,
    `git mv ${VERVALLEN} docs/specs/archief/b.md 2>${ARCHIEF}`,
  ])('specarchief-en-bouwvorm/AC-3 hoofdsessie: %s is deny met de melding', (command) => {
    expect(bash(command).join('\n')).toContain(MELDING);
  });
});

describe('specarchief-en-bouwvorm/AC-3: Write en Edit in docs/specs/archief/ zijn voor elke rol deny', () => {
  test.each(ROLLEN.map((rol) => [naam(rol), rol] as const))(
    'specarchief-en-bouwvorm/AC-3 %s: Write met andere inhoud en een nieuw bestand',
    (_naam, rol) => {
      const write = (file: string) =>
        deny({ tool_name: 'Write', tool_input: { file_path: `${ROOT}/${file}`, content: spec('voorstel') } }, rol);
      expect([write(ARCHIEF).length > 0, write('docs/specs/archief/nieuw.md').length > 0]).toStrictEqual([true, true]);
    },
  );

  test.each(ROLLEN.map((rol) => [naam(rol), rol] as const))('specarchief-en-bouwvorm/AC-3 %s: Edit', (_naam, rol) => {
    const input = { file_path: `${ROOT}/${ARCHIEF}`, old_string: 'Kit.', new_string: 'Andere kit.' };
    expect(deny({ tool_name: 'Edit', tool_input: input }, rol)).not.toStrictEqual([]);
  });
});
