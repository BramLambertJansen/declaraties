import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// Spec rolhek-dicht AC-3: de doctor (volledig en --machine) controleert Claude Code 2.1.295 of nieuwer, de versie waarin
// `onFailure` kwam. Fixture en stubs zijn een eigen kopie van test/scripts/doctor.test.ts, met een stub `claude` die
// `--version` beantwoordt. Zonder stub staat er geen `claude` op het pad (CI).
const ROOT = path.join(import.meta.dirname, '../..');
const dirs: string[] = [];
type Options = { stack?: boolean; claude?: string | null };

function stub(root: string, name: string, body: string) {
  const file = path.join(root, 'bin', name);
  writeFileSync(file, `#!/usr/bin/env bash\nprintf '%s\\n' '${name}' >> "$STUB_LOG"\n${body}\n`);
  chmodSync(file, 0o755);
}

function fixture(options: Options) {
  const root = mkdtempSync(path.join(tmpdir(), 'doctor-claude-'));
  dirs.push(root);
  for (const folder of ['bin', 'scripts', '.git/hooks']) mkdirSync(path.join(root, folder), { recursive: true });
  for (const file of ['mise.toml', 'package.json', 'scripts/doctor.sh', 'scripts/bootstrap.sh'])
    cpSync(path.join(ROOT, file), path.join(root, file));
  writeFileSync(path.join(root, '.git/hooks/pre-commit'), '#!/bin/sh\nlefthook run pre-commit\n');
  chmodSync(path.join(root, '.git/hooks/pre-commit'), 0o755);
  writeFileSync(path.join(root, 'log'), '');
  writeFileSync(path.join(root, 'os-release'), 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n');
  stub(
    root,
    'mise',
    `
if [[ "\${1:-}" != exec || "\${4:-}" != --version && "\${4:-}" != version ]]; then exit 0; fi
tool="$3"
if [[ "$tool" == pnpm ]]; then sed -nE 's/.*"packageManager": "pnpm@([^"]+)".*/\\1/p' package.json
else
  version=$(sed -nE 's/^'"$tool"' = "([^"]+)"/\\1/p' mise.toml)
  [[ "$tool" == node ]] && printf v
  printf '%s\\n' "$version"
fi`,
  );
  stub(root, 'sysctl', '[[ "$*" == *max_user_watches* ]] && echo 524288 || echo 0');
  stub(root, 'timeout', '[[ "$STUB_STACK" == up ]]');
  for (const tool of ['bwrap', 'docker', 'git', 'gh', 'jq', 'socat']) stub(root, tool, 'true');
  const claude = options.claude ?? null;
  if (claude !== null) stub(root, 'claude', `[[ "\${1:-}" == --version ]] && printf '%s\\n' '${claude}'`);
  return root;
}

function run(args: string[], options: Options = {}) {
  const root = fixture(options);
  const result = spawnSync('bash', [path.join(root, 'scripts', 'doctor.sh'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      HOME: root,
      PATH: `${root}/bin:/usr/bin:/bin`,
      STUB_LOG: path.join(root, 'log'),
      STUB_STACK: options.stack === true ? 'up' : 'down',
      STUB_FAIL: '',
      DOCTOR_OS_RELEASE: path.join(root, 'os-release'),
    },
  });
  return {
    ...result,
    lines: result.stdout.split('\n'),
    calls: readFileSync(path.join(root, 'log'), 'utf8').split('\n'),
  };
}

afterEach(() => {
  for (const root of dirs.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Volledig met draaiende stack en --machine slagen verder overal, zodat alleen de Claude-controle de exitcode bepaalt.
const MODI = [
  { modus: 'volledig', args: [], stack: true },
  { modus: '--machine', args: ['--machine'], stack: false },
];

describe('rolhek-dicht/AC-3: doctor controleert de Claude Code-versie', () => {
  test.each(MODI)('rolhek-dicht/AC-3: $modus faalt bij 2.1.294 met de te-oud-melding', ({ args, stack }) => {
    const result = run(args, { stack, claude: '2.1.294 (Claude Code)' });
    const i = result.lines.indexOf(
      '✗ Claude Code 2.1.294 is te oud: het rolhek valt pas vanaf 2.1.295 dicht bij storing',
    );

    expect(i, result.stdout).toBeGreaterThanOrEqual(0);
    expect(result.lines[i + 1]).toBe('  → werk Claude Code bij');
    expect(result.status).toBe(1);
    expect(result.calls).toContain('claude');
  });

  test.each(MODI)('rolhek-dicht/AC-3: $modus faalt bij onleesbare uitvoer', ({ args, stack }) => {
    const result = run(args, { stack, claude: 'banaan' });
    const i = result.lines.indexOf(
      '✗ Claude Code-versie onleesbaar: het rolhek valt pas vanaf 2.1.295 dicht bij storing',
    );

    expect(i, result.stdout).toBeGreaterThanOrEqual(0);
    expect(result.lines[i + 1]).toBe('  → werk Claude Code bij');
    expect(result.status).toBe(1);
  });

  test.each(MODI.flatMap((modus) => ['2.1.295', '2.1.317'].map((versie) => ({ ...modus, versie }))))(
    'rolhek-dicht/AC-3: $modus slaagt bij $versie met een ✓-regel',
    ({ args, stack, versie }) => {
      const result = run(args, { stack, claude: `${versie} (Claude Code)` });

      expect(result.lines, result.stdout).toContain(`✓ Claude Code ${versie}`);
      expect(result.lines.filter((regel) => regel.startsWith('✗'))).toStrictEqual([]);
      expect(result.status).toBe(0);
    },
  );

  test.each(MODI)('rolhek-dicht/AC-3: $modus zonder claude op het pad slaat de controle over', ({ args, stack }) => {
    const result = run(args, { stack, claude: null });

    expect(result.lines, result.stdout).toContain('· Claude Code niet gevonden: versiecontrole overgeslagen');
    expect(result.lines.filter((regel) => regel.startsWith('✗') && regel.includes('Claude'))).toStrictEqual([]);
    expect(result.status).toBe(0);
  });

  test('rolhek-dicht/AC-3: --quick roept claude niet aan', () => {
    const result = run(['--quick'], { claude: '2.1.294 (Claude Code)' });

    expect(result.calls).not.toContain('claude');
    expect(result.stdout).not.toContain('Claude Code');
    expect(result.status).toBe(0);
  });

  // Dynamisch geladen: zo hangen de proces-tests hierboven niet af van de JS-module.
  test('rolhek-dicht/AC-3: de minimumversie in doctor.sh is gelijk aan MIN_CLAUDE_VERSIE', async () => {
    const { MIN_CLAUDE_VERSIE } = await import('../../rails/hooks/lib/claude-versie.mjs');
    const doctor = readFileSync(path.join(ROOT, 'scripts/doctor.sh'), 'utf8');

    expect(MIN_CLAUDE_VERSIE).toBe('2.1.295');
    expect(doctor).toContain(MIN_CLAUDE_VERSIE);
  });
});
