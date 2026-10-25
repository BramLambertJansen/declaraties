import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { snelleGates } from '../../scripts/kit/gate-fast.mjs';

function run(memoryGiB: number, red = '') {
  const dir = mkdtempSync(path.join(tmpdir(), 'gate-memory-'));
  try {
    const hook = path.join(dir, 'memory.mjs');
    writeFileSync(
      hook,
      `Object.defineProperty(process, 'availableMemory', { value: () => ${String(memoryGiB)} * 1024 ** 3 });`,
    );
    const stub = path.join(dir, 'pnpm');
    writeFileSync(
      stub,
      `#!${process.execPath}
const fs = require('node:fs');
const script = process.argv[2];
const root = process.env.GATE_MEMORY_FIXTURE;
fs.appendFileSync(root + '/calls', script + '\\n');
if (script !== 'lint' && script !== 'test:unit') process.exit(0);
let owner = false;
try { fs.mkdirSync(root + '/heavy'); owner = true; }
catch (error) { if (error.code !== 'EEXIST') throw error; fs.writeFileSync(root + '/overlap', 'yes'); }
setTimeout(() => {
  if (owner) fs.rmdirSync(root + '/heavy');
  process.exit(script === process.env.GATE_MEMORY_RED ? 2 : 0);
}, 200);
`,
    );
    chmodSync(stub, 0o755);
    const result = spawnSync(process.execPath, ['--import', hook, 'scripts/kit/gate-fast.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, GATE_MEMORY_FIXTURE: dir, GATE_MEMORY_RED: red },
    });
    return {
      ...result,
      overlap: existsSync(path.join(dir, 'overlap')),
      calls: readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('weinig geheugen: lint en tests overlappen niet; alle snelle gates draaien één keer', () => {
  const result = run(1);
  expect(result.status).toBe(0);
  expect(result.overlap).toBe(false);
  expect(result.calls.toSorted()).toStrictEqual(snelleGates().toSorted());
});

test('voldoende geheugen: de bestaande parallelle zware banen blijven beschikbaar', () => {
  const result = run(64);
  expect(result.status).toBe(0);
  expect(result.overlap).toBe(true);
});

test('ook met weinig geheugen blijft een mislukte test rood en draaien de overige controles', () => {
  const result = run(1, 'test:unit');
  expect(result.status).toBe(1);
  expect(result.overlap).toBe(false);
  expect(result.calls.toSorted()).toStrictEqual(snelleGates().toSorted());
  expect(result.stdout).toContain('gate:fast rood: test:unit');
});
