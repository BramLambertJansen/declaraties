import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

// De job `secrets` leest op een PR alleen de commits van die PR (`origin/main..HEAD`) en op main alle gefetchte refs.
// Alle refs scannen op een PR liet één valse melding op één branch elke open PR rood maken (#97, #99); de scan op main houdt
// de volledige dekking (framework §6). De test draait het `run`-blok uit ci.yml echt, met een betterleaks-stub die zijn
// argumenten teruggeeft: omdraaien of weghalen van een tak laat hem falen.
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const job = workflow.slice(workflow.indexOf('\n  secrets:'), workflow.indexOf('\n  image:'));

function runBlock(): string {
  const lines = job.split('\n');
  const start = lines.findIndex((line) => line.trim() === '- run: |');
  const end = lines.findIndex((line, index) => index > start && line.trim() === 'env:');
  if (start < 0 || end < 0) throw new Error('de job secrets heeft geen `run: |`-blok met een `env:` erna');
  const body = lines.slice(start + 1, end);
  const indent = (body[0] ?? '').length - (body[0] ?? '').trimStart().length;
  return body.map((line) => line.slice(indent)).join('\n');
}

function scan(event: string): string {
  const bin = mkdtempSync(path.join(tmpdir(), 'ci-scan-'));
  writeFileSync(path.join(bin, 'betterleaks'), '#!/bin/sh\necho "ARGS: $*"\n');
  chmodSync(path.join(bin, 'betterleaks'), 0o755);
  try {
    return execFileSync('bash', ['-eu', '-c', runBlock()], {
      encoding: 'utf8',
      env: { PATH: `${bin}:${process.env['PATH'] ?? ''}`, EVENT: event },
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test('op een PR alleen de commits van die PR, met eigen config en zonder inline allows', () => {
  const args = scan('pull_request');

  expect(args).toContain('--log-opts origin/main..HEAD');
  expect(args).toContain('-c scripts/kit/betterleaks.toml');
  expect(args).toContain('--ignore-gitleaks-allow');
});

test.each(['push', 'merge_group', 'workflow_dispatch'])('bij %s alle gefetchte refs, zonder beperking', (event) => {
  const args = scan(event);

  expect(args).not.toContain('--log-opts');
  expect(args).toContain('-c scripts/kit/betterleaks.toml');
  expect(args).toContain('--ignore-gitleaks-allow');
});

test('EVENT komt uit het event van de workflow, niet uit iets anders', () => {
  expect(job).toMatch(/env:\n\s+EVENT: \$\{\{ github\.event_name \}\}/);
});

test('de checkout haalt de hele geschiedenis op, zodat origin/main bestaat', () => {
  expect(job).toMatch(/fetch-depth: 0/);
  expect(job).toContain('name: secrets');
});
