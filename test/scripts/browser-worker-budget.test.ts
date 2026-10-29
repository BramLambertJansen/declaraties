import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { z } from 'zod';

const root = path.join(import.meta.dirname, '../..');
const resultSchema = z.object({ workers: z.number().nullable(), forbidOnly: z.boolean(), testDir: z.string() });

// Totaal én beschikbaar geheugen vast (scripts/kit/geheugen.mjs), zonder override uit de omgeving.
function workers(memoryGiB: number) {
  const dir = mkdtempSync(path.join(tmpdir(), 'browser-workers-'));
  try {
    const hook = path.join(dir, 'memory.mjs');
    writeFileSync(
      hook,
      `import os from 'node:os';
const bytes = ${String(memoryGiB)} * 1024 ** 3;
Object.defineProperty(process, 'availableMemory', { value: () => bytes });
Object.defineProperty(os, 'totalmem', { value: () => bytes });`,
    );
    const script =
      "import config from './playwright.config.ts'; console.log(JSON.stringify({ workers: config.workers ?? null, forbidOnly: config.forbidOnly, testDir: config.testDir }));";
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'GATE_WEINIG_GEHEUGEN'));
    const result = spawnSync(process.execPath, ['--import', hook, '--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
      env,
    });
    expect(result.status, result.stderr).toBe(0);
    return resultSchema.parse(JSON.parse(result.stdout));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('weinig beschikbaar geheugen: één browserworker voor dezelfde e2e-suite', () => {
  expect(workers(1)).toStrictEqual({ workers: 1, forbidOnly: true, testDir: 'e2e' });
});

test('voldoende geheugen: de helft van de CPU’s, minstens één en hooguit vier browserworkers', () => {
  const expected = Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2)));
  expect(workers(64)).toStrictEqual({ workers: expected, forbidOnly: true, testDir: 'e2e' });
});
