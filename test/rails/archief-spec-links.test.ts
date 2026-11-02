import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// adr-archief (ADR 0053 punt 4): een spec direct in docs/specs/ (of docs/template/specs/) met een eigenaarstatus mag niet
// wijzigen, dus een link naar docs/adr/NNNN-*.md lost ook op naar docs/adr/archief/NNNN-*.md. Overal elders blijft de
// letterlijke link streng (die links gaan mee naar het nieuwe pad).
const mappen: string[] = [];

afterEach(() => {
  for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'archief-spec-links-'));
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

/** De linkmeldingen ("wijst naar niets") over `file`. */
async function linkMeldingen(files: Record<string, string>, file: string): Promise<string[]> {
  return (await docsViolations(repo(files)))
    .filter(({ message }) => message.includes(file) && message.includes('wijst naar niets'))
    .map(({ message }) => message);
}

const OUD = '# 0015 — Demo\n\nStatus: vervallen\n';
const ARCHIEF_ADR = { 'docs/adr/archief/0015-demo.md': OUD };
const spec = (link: string): string => `---\nstatus: goedgekeurd\n---\n\n# Demo\n\nZie [x](${link}).\n`;

describe('adr-archief: links vanuit specs naar gearchiveerde ADRs', () => {
  test('adr-archief een spec in docs/specs/ met een link naar docs/adr/NNNN-*.md dat in archief/ staat: groen', async () => {
    const file = 'docs/specs/demo.md';
    expect(await linkMeldingen({ ...ARCHIEF_ADR, [file]: spec('../adr/0015-demo.md') }, file)).toStrictEqual([]);
  });

  test('adr-archief idem met een anker: groen', async () => {
    const file = 'docs/specs/demo.md';
    expect(await linkMeldingen({ ...ARCHIEF_ADR, [file]: spec('../adr/0015-demo.md#besluit') }, file)).toStrictEqual(
      [],
    );
  });

  test('adr-archief een spec onder docs/template/specs/ met een link naar een gearchiveerde ADR: groen', async () => {
    const file = 'docs/template/specs/demo.md';
    expect(await linkMeldingen({ ...ARCHIEF_ADR, [file]: spec('../../adr/0015-demo.md') }, file)).toStrictEqual([]);
  });

  test('adr-archief een spec met een link naar een ADR die nergens bestaat: rood', async () => {
    const file = 'docs/specs/demo.md';
    const meldingen = await linkMeldingen({ ...ARCHIEF_ADR, [file]: spec('../adr/0099-weg.md') }, file);
    expect(meldingen).toHaveLength(1);
  });

  test('adr-archief een spec met een link naar een niet-ADR die niet bestaat (../reviews/x.md): geen archief-terugval, rood', async () => {
    const file = 'docs/specs/demo.md';
    const meldingen = await linkMeldingen({ ...ARCHIEF_ADR, [file]: spec('../reviews/x.md') }, file);
    expect(meldingen).toHaveLength(1);
  });

  test('adr-archief docs/framework.md met een link naar het oude pad van een gearchiveerde ADR: nog steeds rood', async () => {
    const file = 'docs/framework.md';
    const meldingen = await linkMeldingen(
      { ...ARCHIEF_ADR, [file]: '# Framework\n\nZie [0015](adr/0015-demo.md).\n' },
      file,
    );
    expect(meldingen).toHaveLength(1);
  });

  test('adr-archief docs/operations/*.md met een link naar het oude pad van een gearchiveerde ADR: nog steeds rood', async () => {
    const file = 'docs/operations/demo.md';
    const meldingen = await linkMeldingen(
      { ...ARCHIEF_ADR, [file]: '# Demo\n\nZie [0015](../adr/0015-demo.md).\n' },
      file,
    );
    expect(meldingen).toHaveLength(1);
  });

  test('adr-archief een ADR in docs/adr/ met een link naar een gearchiveerde ADR: nog steeds groen', async () => {
    const file = 'docs/adr/0061-actief.md';
    const tekst = '# 0061 — Actief\n\nStatus: geaccepteerd\n\nZie [0015](0015-demo.md).\n';
    expect(await linkMeldingen({ ...ARCHIEF_ADR, [file]: tekst }, file)).toStrictEqual([]);
  });
});
