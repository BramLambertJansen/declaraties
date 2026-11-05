import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// scripts/runner.sh: images eerst binnenhalen, elke poging begrensd met `timeout`, zodat een hangende pull (gezien op
// mcr.microsoft.com, PR #101) niet de 30 minuten van gate:slow opeet. docker en timeout zijn stubs op PATH.
const SCRIPT = path.join(import.meta.dirname, '../../scripts/runner.sh');
const dirs: string[] = [];

// timeout-stub: logt zijn argumenten. Zolang HANGS > 0 telt hij af en geeft 124 (zoals de echte bij een time-out);
// anders voert hij het commando na de duur uit.
const TIMEOUT = `
echo "timeout $*" >> "$STUB_DIR/log"
hangs=$(cat "$STUB_DIR/hangs")
if (( hangs > 0 )); then echo $((hangs - 1)) > "$STUB_DIR/hangs"; exit 124; fi
while [[ "$1" == -* ]]; do shift; done
shift
exec "$@"
`;
const DOCKER = 'echo "docker $*" >> "$STUB_DIR/log"';

function run(suite: string, hangs: number) {
  const dir = mkdtempSync(path.join(tmpdir(), 'runner-'));
  dirs.push(dir);
  mkdirSync(path.join(dir, 'scripts'));
  mkdirSync(path.join(dir, 'node_modules'));
  const script = path.join(dir, 'scripts/runner.sh');
  writeFileSync(script, readFileSync(SCRIPT, 'utf8'));
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  if (init.status !== 0) throw new Error(init.stderr);
  writeFileSync(path.join(dir, 'timeout'), `#!/usr/bin/env bash\n${TIMEOUT}`);
  writeFileSync(path.join(dir, 'docker'), `#!/usr/bin/env bash\n${DOCKER}\n`);
  chmodSync(path.join(dir, 'timeout'), 0o755);
  chmodSync(path.join(dir, 'docker'), 0o755);
  writeFileSync(path.join(dir, 'hangs'), String(hangs));
  writeFileSync(path.join(dir, 'log'), '');
  // --sta-wijzigingen-toe: de test gaat over de pull, niet over de HEAD-controle (en een werkmap kan vuil zijn).
  const result = spawnSync('bash', [script, suite, '--sta-wijzigingen-toe'], {
    encoding: 'utf8',
    cwd: dir,
    env: { HOME: dir, TMPDIR: tmpdir(), PATH: `${dir}:/usr/bin:/bin`, STUB_DIR: dir },
  });
  const calls = readFileSync(path.join(dir, 'log'), 'utf8').split('\n').filter(Boolean);
  const pulls = calls.filter((call) => call.startsWith('timeout '));
  const runs = calls.filter((call) => call.startsWith('docker ') && call.includes(' run --rm --build '));
  return { status: result.status, stderr: result.stderr, pulls, runs };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/runner.sh: images binnenhalen', () => {
  test('ui: één begrensde pull van ui-runner en zijn afhankelijkheden, daarna de run', () => {
    const { status, pulls, runs } = run('ui', 0);

    expect(status).toBe(0);
    expect(pulls).toHaveLength(1);
    expect(pulls[0]).toMatch(/^timeout --kill-after=\S+ 300 docker compose /);
    expect(pulls[0]).toMatch(/ pull --ignore-buildable --include-deps ui-runner$/);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatch(/ run --rm --build ui-runner$/);
  });

  test('db: haalt de images van test-pgtap en runner binnen', () => {
    const { status, pulls } = run('db', 0);

    expect(status).toBe(0);
    expect(pulls[0]).toMatch(/ pull --ignore-buildable --include-deps test-pgtap runner$/);
  });

  test('één hangende pull: tweede poging, daarna gewoon de tests', () => {
    const { status, pulls, runs } = run('ui', 1);

    expect([status, pulls.length, runs.length]).toStrictEqual([0, 2, 1]);
  });

  test('blijft hangen: na drie pogingen een duidelijke fout en geen tests', () => {
    const { status, stderr, pulls, runs } = run('ui', 3);

    expect([status, pulls.length, runs.length]).toStrictEqual([1, 3, 0]);
    expect(stderr).toContain('images binnenhalen faalde na 3 pogingen');
  });
});
