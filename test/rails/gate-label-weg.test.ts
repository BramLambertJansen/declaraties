import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// compacte-kennisbasis-rails/AC-14 (labeldeel) en AC-16: het gate-label en zijn helper bestaan niet meer.
describe('compacte-kennisbasis-rails/AC-14: het gate-label is weg', () => {
  test('compacte-kennisbasis-rails/AC-14 package.json heeft geen script pr:label-gate', () => {
    const tekst = readFileSync('package.json', 'utf8');

    expect(tekst).not.toContain('pr:label-gate');
    expect(tekst).not.toContain('pr-gate-label');
  });

  test('compacte-kennisbasis-rails/AC-14 scripts/kit/pr-gate-label.mjs bestaat niet', () => {
    expect(existsSync('scripts/kit/pr-gate-label.mjs')).toBe(false);
  });

  test('compacte-kennisbasis-rails/AC-14 guard.yml reageert niet op labeled of unlabeled en noemt geen label', () => {
    const tekst = readFileSync('.github/workflows/guard.yml', 'utf8');
    const types = /pull_request_target:\s*\n\s*types:\s*\[([^\]]*)\]/.exec(tekst)?.[1] ?? '';

    expect(types).toContain('synchronize');
    expect(types).not.toMatch(/labeled/);
    expect(tekst).not.toMatch(/label/i);
  });

  test('compacte-kennisbasis-rails/AC-14 de ratchetmelding noemt geen label', () => {
    expect(readFileSync('scripts/kit/ratchet.mjs', 'utf8')).not.toMatch(/label/i);
  });

  test('compacte-kennisbasis-rails/AC-16 diff-guard.mjs leest geen label meer', () => {
    const bron = readFileSync('scripts/kit/diff-guard.mjs', 'utf8');

    expect(bron).not.toContain('gate-wijziging');
    expect(bron).not.toMatch(/\.labels\b|\/labels`/);
  });
});
