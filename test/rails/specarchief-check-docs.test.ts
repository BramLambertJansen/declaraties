import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080): `check-docs` (docsViolations) op echte, tijdelijke git-repositories.
// Links vanuit en naar het specarchief (AC-4), een naam in beide mappen (AC-5), de AC-dekking van regel 6 met de markering
// `(nog niet gebouwd)` (AC-7) en de oude statusvorm met SHA (AC-11). Vorm van archief-spec-links en archief-check-docs.
const mappen: string[] = [];

afterEach(() => {
  for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'specarchief-check-docs-'));
  mappen.push(root);
  const all = { 'package.json': JSON.stringify({ scripts: {} }), ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function meldingen(files: Record<string, string>): Promise<string[]> {
  return (await docsViolations(repo(files))).map(({ message }) => message);
}

/** De linkmeldingen ("wijst naar niets") over `file`. */
async function linkMeldingen(files: Record<string, string>, file: string): Promise<string[]> {
  return (await meldingen(files)).filter(
    (message) => message.startsWith(`${file}:`) && message.includes('wijst naar niets'),
  );
}

const SHA = 'a'.repeat(40);
const ADR = { 'docs/adr/0001-demo.md': '# 0001 — Demo\n\nStatus: geaccepteerd\n' };

function spec(status: string, naam = 'a', regels: string[] = []): string {
  return [
    '---',
    `status: ${status}`,
    `namespace: ${naam}`,
    '---',
    '',
    `# Spec ${naam}`,
    '',
    '## Hergebruik en UX',
    '',
    'Bestaande kit.',
    '',
    ...regels,
    '',
  ].join('\n');
}

const GEARCHIVEERD = { 'docs/specs/archief/a.md': spec('vervallen') };

describe('specarchief-en-bouwvorm/AC-4: links lossen op naar het specarchief', () => {
  test('specarchief-en-bouwvorm/AC-4 een link ../adr/<adr>.md in een gearchiveerde spec: groen', async () => {
    const file = 'docs/specs/archief/a.md';
    const files = { ...ADR, [file]: spec('vervallen', 'a', ['Zie [0001](../adr/0001-demo.md).']) };
    expect(await linkMeldingen(files, file)).toStrictEqual([]);
  });

  test('specarchief-en-bouwvorm/AC-4 een link a.md in een gebouwde spec naar een gearchiveerde a.md: groen', async () => {
    const file = 'docs/specs/b.md';
    const files = { ...GEARCHIVEERD, [file]: spec('gebouwd # #120', 'b', ['Zie [a](a.md).']) };
    expect(await linkMeldingen(files, file)).toStrictEqual([]);
  });

  test('specarchief-en-bouwvorm/AC-4 een link ../specs/a.md vanuit een ADR naar een gearchiveerde a.md: groen', async () => {
    const file = 'docs/adr/0002-ander.md';
    const files = { ...GEARCHIVEERD, [file]: '# 0002 — Ander\n\nStatus: geaccepteerd\n\nZie [a](../specs/a.md).\n' };
    expect(await linkMeldingen(files, file)).toStrictEqual([]);
  });

  test.each([
    ['docs/operations/demo.md', '# Demo\n\nZie [a](../specs/a.md).\n'],
    ['README.md', '# Demo\n\nZie [a](docs/specs/a.md).\n'],
  ])('specarchief-en-bouwvorm/AC-4 een link naar die a.md vanuit %s: rood', async (file, tekst) => {
    expect(await linkMeldingen({ ...GEARCHIVEERD, [file]: tekst }, file)).toHaveLength(1);
  });
});

describe('specarchief-en-bouwvorm/AC-5: een naam uit het archief komt niet terug', () => {
  test('specarchief-en-bouwvorm/AC-5 docs/specs/a.md en docs/specs/archief/a.md samen: rood met de melding', async () => {
    const lijst = await meldingen({ ...GEARCHIVEERD, 'docs/specs/a.md': spec('voorstel') });
    expect(lijst).toContain(
      'docs/specs/a.md: de naam staat ook in docs/specs/archief/; een naam komt niet terug (ADR 0080)',
    );
  });

  test('specarchief-en-bouwvorm/AC-5 verschillende namen in beide mappen: geen melding over het archief', async () => {
    const lijst = await meldingen({ ...GEARCHIVEERD, 'docs/specs/b.md': spec('voorstel', 'b') });
    expect(lijst.filter((message) => message.includes('archief'))).toStrictEqual([]);
  });
});

describe('specarchief-en-bouwvorm/AC-7: regel 6 slaat alleen een gemarkeerde AC over', () => {
  const TEST = { 'test/demo.test.ts': "test('demo/AC-1 werkt', () => {});\n" };
  const acs = (tweede: string): string[] => [
    '## Acceptatiecriteria',
    '',
    '- **demo/AC-1** — Gegeven iets, dan iets.',
    `- **demo/AC-2**${tweede} — Gegeven meer, dan meer.`,
  ];
  const dekking = async (tweede: string): Promise<string[]> =>
    (await meldingen({ ...TEST, 'docs/specs/demo.md': spec('gebouwd # #120', 'demo', acs(tweede)) })).filter(
      (message) => message.startsWith('docs/specs/demo.md: AC-'),
    );

  test('specarchief-en-bouwvorm/AC-7 een gebouwde spec met een nieuwe AC (nog niet gebouwd) zonder test: groen', async () => {
    expect(await dekking(' (nog niet gebouwd)')).toStrictEqual([]);
  });

  test('specarchief-en-bouwvorm/AC-7 dezelfde AC zonder markering en zonder test: rood', async () => {
    expect(await dekking('')).toHaveLength(1);
  });
});

describe('specarchief-en-bouwvorm/AC-11: check-docs weigert de oude vorm met SHA in docs/specs/', () => {
  test('specarchief-en-bouwvorm/AC-11 gebouwd # #N; gevalideerd: <sha> in docs/specs/: rood met de melding', async () => {
    const lijst = await meldingen({ 'docs/specs/a.md': spec(`gebouwd # #130; gevalideerd: ${SHA}`) });
    expect(
      lijst.filter((message) => message.startsWith('docs/specs/a.md: statusregel met gevalideerd: ')),
    ).toHaveLength(1);
    expect(lijst.join('\n')).toMatch(
      /^docs\/specs\/a\.md: statusregel met gevalideerd: .+; schrijf status: gebouwd # #.+ \(ADR 0080\)$/m,
    );
  });

  test('specarchief-en-bouwvorm/AC-11 gebouwd # #N zonder SHA: geen melding over gevalideerd', async () => {
    const lijst = await meldingen({ 'docs/specs/a.md': spec('gebouwd # #130') });
    expect(lijst.filter((message) => message.includes('gevalideerd'))).toStrictEqual([]);
  });
});
