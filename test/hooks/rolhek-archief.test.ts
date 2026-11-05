import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { A4_MELDING } from '../../rails/hooks/lib/document-state.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// compacte-kennisbasis-rails/AC-2 (ADR 0053 punt 2, ADR 0063 punt 1): ook het rolhek geeft `a4` op een gearchiveerd ADR,
// omdat het via `documentKind` het archiefpad als ADR herkent. Echte payloads; main bevat de gearchiveerde ADR's.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
type Ctx = Parameters<typeof decide>[1];

const adr = (nr: string, status: string, besluit = 'Iets.'): string =>
  `# ${nr} — Oud\n\nStatus: ${status}\n\n## Besluit\n\n${besluit}\n`;

const VERVALLEN = 'docs/adr/archief/0096-vervallen.md';
const VERVANGEN = 'docs/adr/archief/0095-vervangen.md';
const FILES: Record<string, string> = {
  [VERVALLEN]: adr('0096', 'vervallen'),
  [VERVANGEN]: adr('0095', 'vervangen door 0098'),
  'docs/adr/0098-actief.md': adr('0098', 'geaccepteerd'),
};

function run(payload: unknown) {
  const ctx: Ctx = {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => FILES[rel] ?? null,
    committed: (rel: string) => rel in FILES,
    isDir: () => false,
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
  return decide(payload, ctx);
}

const as = (agent: string | undefined) => (agent === undefined ? {} : { agent_type: agent });
const write = (file: string, content: string, agent?: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: `${ROOT}/${file}`, content },
  ...as(agent),
});
const edit = (file: string, [from, to]: [string, string], agent?: string) => ({
  tool_name: 'Edit',
  tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to },
  ...as(agent),
});
const bash = (command: string, agent?: string) => ({ tool_name: 'Bash', tool_input: { command }, ...as(agent) });

// hoofdsessie en architect (geen agent_type of `architect`) schrijven een eigenaarstatus, maar een gearchiveerd ADR wijzigt voor niemand.
const ROLLEN = [
  ['hoofdsessie', undefined],
  ['architect', 'architect'],
  ['developer', 'developer'],
  ['tester', 'tester'],
  ['reviewer', 'reviewer'],
  ['docs', 'docs'],
] as const;

describe.each(ROLLEN)('compacte-kennisbasis-rails/AC-2: %s wijzigt een gearchiveerd ADR', (rol, agent) => {
  test.each([
    ['vervallen', VERVALLEN, 'Status: vervallen'],
    ['vervangen door NNNN', VERVANGEN, 'Status: vervangen door 0098'],
  ])('compacte-kennisbasis-rails/AC-2 Write met andere inhoud (%s): geweigerd met A4_MELDING', (_naam, pad, regel) => {
    const nummer = pad.slice('docs/adr/archief/'.length, 'docs/adr/archief/'.length + 4);
    const tekst = `# ${nummer} — Oud\n\n${regel}\n\n## Besluit\n\nIets anders.\n`;
    const melding = run(write(pad, tekst, agent)).deny.join('\n');
    // tester, reviewer en docs worden al door hun rolregel geweigerd (docs/adr is hun pad niet), zonder A4-melding.
    if (!['tester', 'reviewer', 'docs'].includes(rol)) expect(melding).toContain(A4_MELDING);
    else expect(melding).not.toBe('');
  });

  test('compacte-kennisbasis-rails/AC-2 Edit van de inhoud: geweigerd met A4_MELDING', () => {
    const melding = run(edit(VERVALLEN, ['Iets.', 'Iets anders.'], agent)).deny.join('\n');
    if (!['tester', 'reviewer', 'docs'].includes(rol)) expect(melding).toContain(A4_MELDING);
    else expect(melding).not.toBe('');
  });

  test('compacte-kennisbasis-rails/AC-2 Edit van de status terug naar voorgesteld: geweigerd met A4_MELDING', () => {
    const melding = run(edit(VERVALLEN, ['vervallen', 'voorgesteld'], agent)).deny.join('\n');
    if (!['tester', 'reviewer', 'docs'].includes(rol)) expect(melding).toContain(A4_MELDING);
    else expect(melding).not.toBe('');
  });
});

// Eigenaarbesluit (ADR 0053): verwijderen uit archief/ is absoluut geweigerd, ook voor hoofdsessie en architect.
describe.each(ROLLEN.filter(([rol]) => ['hoofdsessie', 'architect', 'developer'].includes(rol)))(
  'compacte-kennisbasis-rails/AC-2: %s verwijdert een gearchiveerd ADR',
  (_rol, agent) => {
    test.each([
      ['rm', (pad: string) => `rm ${pad}`],
      ['git rm', (pad: string) => `git rm -q ${pad}`],
      ['unlink', (pad: string) => `unlink ${pad}`],
    ])('compacte-kennisbasis-rails/AC-2 %s: geweigerd met A4_MELDING', (_actie, commando) => {
      for (const pad of [VERVALLEN, VERVANGEN])
        expect(run(bash(commando(pad), agent)).deny.join('\n')).toContain(A4_MELDING);
    });

    test('compacte-kennisbasis-rails/AC-2 Write met lege inhoud: geweigerd', () => {
      for (const pad of [VERVALLEN, VERVANGEN]) expect(run(write(pad, '', agent)).deny).not.toHaveLength(0);
    });
  },
);
