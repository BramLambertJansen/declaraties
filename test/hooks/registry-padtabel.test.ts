import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { readRegistry } from '../../rails/hooks/lib/task-authority.mjs';
import { OUDE_DECISIONS_TEKST, REPO, object } from '../rails/padtabel-kit';

// padtabel/AC-14 (ADR 0079 punt 8, spec Werking 8): .claude/decisions.json zonder dode records; readRegistry leest de nieuwe
// vorm en het oude register van 30cc352.
const OUD = object(JSON.parse(OUDE_DECISIONS_TEKST));
const TEKST = readFileSync(path.join(REPO, '.claude/decisions.json'), 'utf8');

describe('padtabel/AC-14 decisions.json met alleen version en requiredChecks', () => {
  // Na 30cc352 mag main een verplichte check toevoegen (ADR 0078: leerpunt-bewijs); geen check van 30cc352 mag wegvallen.
  test('precies version en requiredChecks, zonder een verplichte check van 30cc352 te verliezen (padtabel/AC-14)', () => {
    const ruw = object(JSON.parse(TEKST));
    expect(Object.keys(ruw).sort()).toEqual(['requiredChecks', 'version']);
    expect(ruw['version']).toBe(OUD['version']);
    expect(ruw['requiredChecks']).toEqual(
      expect.arrayContaining(Array.isArray(OUD['requiredChecks']) ? OUD['requiredChecks'] : [null]),
    );
  });

  test('readRegistry leest het huidige register, decisions leeg (padtabel/AC-14)', () => {
    const ruw = object(JSON.parse(TEKST));
    expect(readRegistry(TEKST)).toEqual({ version: 1, requiredChecks: ruw['requiredChecks'], decisions: [] });
  });

  test('readRegistry leest ook het register van 30cc352 met zijn 26 records (padtabel/AC-14)', () => {
    const registry = readRegistry(OUDE_DECISIONS_TEKST);
    expect(registry.decisions).toHaveLength(26);
    expect(registry.requiredChecks).toEqual(OUD['requiredChecks']);
  });

  test('een andere sleutel blijft een fout (padtabel/AC-14)', () => {
    const tekst = JSON.stringify({ version: 1, requiredChecks: ['gate:fast'], extra: [] });
    expect(() => readRegistry(tekst)).toThrow();
  });
});
