import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { conflictMarkerViolations, markerRegels } from '../../scripts/kit/conflictmarkers.mjs';
import { checks, strikt } from '../../scripts/kit/ratchet.mjs';

// Leerpunt #495: conflictmarkers in Markdown, YAML of JSON haalden geen check. De markers worden hier opgebouwd, zodat dit
// bestand zelf er geen in kolom 1 bevat.
const BEGIN = '<'.repeat(7);
const MIDDEN = '='.repeat(7);
const BASIS = '|'.repeat(7);
const EIND = '>'.repeat(7);
const conflict = (...regels: string[]) => `${regels.join('\n')}\n`;

describe('conflictmarkers: markerRegels', () => {
  test('een volledig conflict met labels: begin, midden en eind', () => {
    const tekst = conflict('# Kop', `${BEGIN} HEAD`, 'ons', MIDDEN, 'hun', `${EIND} origin/main`, 'rest');

    expect(markerRegels(tekst)).toStrictEqual([2, 4, 6]);
  });

  test('markers zonder label, met diff3-basis en met CRLF', () => {
    const tekst = [BEGIN, 'ons', `${BASIS} merged common ancestors`, 'basis', MIDDEN, 'hun', EIND, ''].join('\r\n');

    expect(markerRegels(tekst)).toStrictEqual([1, 3, 5, 7]);
  });

  test('een BOM voor de eerste marker verbergt hem niet', () => {
    expect(markerRegels(`\uFEFF${BEGIN} HEAD\nons\n`)).toStrictEqual([1]);
  });

  test('een half conflict telt ook: alleen begin of alleen eind', () => {
    expect(markerRegels(conflict(`${BEGIN} HEAD`, 'ons'))).toStrictEqual([1]);
    expect(markerRegels(conflict('hun', `${EIND} origin/main`))).toStrictEqual([2]);
  });

  test('geen marker: setext-kop, ingesprongen, langere reeks, midden in de regel', () => {
    const tekst = conflict(
      'Titel',
      MIDDEN,
      `    ${BEGIN} HEAD`,
      `> ${EIND} origin/main`,
      `${BEGIN}< HEAD`,
      `${EIND}>`,
      `tekst ${BEGIN} HEAD`,
      `${MIDDEN}=`,
      BASIS,
    );

    expect(markerRegels(tekst)).toStrictEqual([]);
  });
});

describe('conflictmarkers: getrackte bestanden', () => {
  const mappen: string[] = [];
  afterEach(() => {
    for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
  });

  function repo(bestanden: Record<string, string | Buffer>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'conflictmarkers-'));
    mappen.push(root);
    expect(spawnSync('git', ['init', '-q'], { cwd: root }).status).toBe(0);
    for (const [naam, inhoud] of Object.entries(bestanden)) {
      mkdirSync(path.dirname(path.join(root, naam)), { recursive: true });
      writeFileSync(path.join(root, naam), inhoud);
    }
    expect(spawnSync('git', ['add', '-A'], { cwd: root }).status).toBe(0);
    return root;
  }

  test('meldt pad en regel in Markdown, YAML en JSON; niet in een ongetrackt bestand', () => {
    const marker = conflict('a', `${BEGIN} HEAD`, 'b', MIDDEN, 'c', `${EIND} x`);
    const root = repo({ 'CHANGELOG.md': marker, 'docs/a.yml': marker, 'b.json': 'ok\n' });
    writeFileSync(path.join(root, 'los.md'), marker);

    expect(conflictMarkerViolations(root).map(({ key }) => key)).toStrictEqual([
      'CHANGELOG.md:2',
      'CHANGELOG.md:4',
      'CHANGELOG.md:6',
      'docs/a.yml:2',
      'docs/a.yml:4',
      'docs/a.yml:6',
    ]);
  });

  test('slaat een binair bestand over (NUL in het begin)', () => {
    const root = repo({ 'plaatje.png': Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(`\n${BEGIN} HEAD\n`)]) });

    expect(conflictMarkerViolations(root)).toStrictEqual([]);
  });

  test('ontbrekende invoer: getrackt maar uit de werkmap verwijderd telt als leeg, niet als fout', () => {
    const root = repo({ 'weg.md': 'tekst\n', 'blijft.md': conflict(`${BEGIN} HEAD`) });
    rmSync(path.join(root, 'weg.md'));

    expect(conflictMarkerViolations(root).map(({ key }) => key)).toStrictEqual(['blijft.md:1']);
  });

  test('ontbrekende invoer: geen git-repository breekt de check af in plaats van niets te melden', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'conflictmarkers-'));
    mappen.push(root);

    expect(() => conflictMarkerViolations(root)).toThrow();
  });

  test('de huidige repository heeft geen conflictmarkers', () => {
    expect(conflictMarkerViolations(process.cwd())).toStrictEqual([]);
  });
});

describe('conflictmarkers: kanaal strikt van pnpm ratchet', () => {
  test('staat in strikt, niet in de baseline-checks', () => {
    expect(Object.keys(strikt)).toContain('conflictmarkers');
    expect(Object.keys(checks)).not.toContain('conflictmarkers');
  });
});
