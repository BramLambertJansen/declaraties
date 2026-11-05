import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { compare } from '../../scripts/kit/ratchet.mjs';

// De ratchet faalt in beide richtingen (framework §4, ADR 0045): een nieuwe overtreding, én een opgeloste die nog
// in de baseline staat.
describe('ratchet: .kit/baseline.json', () => {
  const violation = (key: string) => ({ key, message: '' });

  test('gelijk aan de baseline: niets', () => {
    expect(compare(['a'], [violation('a')])).toStrictEqual({ nieuw: [], opgelost: [] });
  });

  test('nieuwe overtreding faalt', () => {
    expect(compare(['a'], [violation('a'), violation('b')]).nieuw).toStrictEqual([violation('b')]);
  });

  test('opgeloste overtreding die nog in de baseline staat, faalt', () => {
    expect(compare(['a', 'b'], [violation('a')]).opgelost).toStrictEqual(['b']);
  });
});

describe('ratchet: ESLint bulk-suppressions', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ratchet-'));
  const eslintBin = path.resolve('node_modules/eslint/bin/eslint.js');
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function eslint(...args: string[]): number | null {
    return spawnSync(process.execPath, [eslintBin, ...args, 'a.js'], { cwd: dir }).status;
  }

  writeFileSync(path.join(dir, 'eslint.config.js'), "export default [{ rules: { 'no-var': 'error' } }];\n");
  writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');

  test('bestaande overtreding is onderdrukt', () => {
    writeFileSync(path.join(dir, 'a.js'), 'var a = 1;\nexport { a };\n');

    expect(eslint('--suppress-all')).toBe(0);
    expect(eslint()).toBe(0);
  });

  test('nieuwe overtreding faalt', () => {
    writeFileSync(path.join(dir, 'a.js'), 'var a = 1;\nvar b = 2;\nexport { a, b };\n');

    expect(eslint()).not.toBe(0);
  });

  test('opgeloste overtreding die nog onderdrukt is, faalt tot lint:prune', () => {
    writeFileSync(path.join(dir, 'a.js'), 'const a = 1;\nexport { a };\n');

    expect(eslint()).not.toBe(0);
    expect(eslint('--prune-suppressions')).toBe(0);
    expect(eslint()).toBe(0);
  });
});
