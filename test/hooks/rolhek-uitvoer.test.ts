import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { uitvoer } from '../../rails/hooks/lib/rolhek-uitvoer.mjs';

// Spec rolhek-dicht AC-4: met `onFailure: "block"` is ongeldige uitvoer ook een storing. Elke uitvoervorm van het rolhek
// heeft daarom exitcode 0 of 2, en stdout leeg of één JSON-object met alleen de veldnamen uit de Claude Code-docs voor
// PreToolUse. Eerst de pure vorm (rails/hooks/lib/rolhek-uitvoer.mjs), dan het echte script als proces.
const BUITEN = ['hookSpecificOutput'];
const BINNEN = ['hookEventName', 'permissionDecision', 'permissionDecisionReason', 'additionalContext'];

function keysOf(value: unknown): string[] {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
}

function child(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

// De vormregels uit AC-4; geeft de afwijkingen terug (leeg = geldig), zodat een falende test zegt wat er mis is.
function vormfouten(result: { exitCode: number | null; stdout: string }): string[] {
  const fouten: string[] = [];
  if (result.exitCode !== 0 && result.exitCode !== 2) fouten.push(`exitcode ${String(result.exitCode)}`);
  if (result.stdout === '') return fouten;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return [...fouten, `stdout is geen JSON: ${result.stdout}`];
  }
  const buiten = keysOf(parsed);
  if (buiten.length === 0) fouten.push('stdout is geen niet-leeg JSON-object');
  fouten.push(...buiten.filter((key) => !BUITEN.includes(key)).map((key) => `onbekende sleutel ${key}`));
  const binnen = child(parsed, 'hookSpecificOutput');
  fouten.push(
    ...keysOf(binnen)
      .filter((key) => !BINNEN.includes(key))
      .map((key) => `onbekende binnensleutel ${key}`),
  );
  if (child(binnen, 'hookEventName') !== 'PreToolUse') fouten.push('hookEventName is niet PreToolUse');
  return fouten;
}

describe('rolhek-dicht/AC-4: uitvoer(decision) per vorm', () => {
  const VORMEN = [
    { vorm: 'deny', decision: { deny: ['push naar main is verboden', 'tweede reden'], ask: [], context: [] } },
    { vorm: 'ask', decision: { deny: [], ask: ['a', 'b'], context: [] } },
    { vorm: 'allow', decision: { deny: [], ask: [], context: [], allow: true } },
    { vorm: 'alleen context', decision: { deny: [], ask: [], context: ['c1', 'c2'] } },
    { vorm: 'ask+context', decision: { deny: [], ask: ['a'], context: ['c'] } },
    { vorm: 'leeg', decision: { deny: [], ask: [], context: [] } },
  ];

  test.each(VORMEN)('rolhek-dicht/AC-4: $vorm voldoet aan de vormregels', ({ decision }) => {
    expect(vormfouten(uitvoer(decision))).toStrictEqual([]);
  });

  test('rolhek-dicht/AC-4: deny geeft exit 2, lege stdout en per reden een stderr-regel', () => {
    expect(uitvoer({ deny: ['push naar main is verboden', 'tweede reden'], ask: ['a'], context: ['c'] })).toStrictEqual(
      {
        exitCode: 2,
        stdout: '',
        stderr: 'rolhek: push naar main is verboden\nrolhek: tweede reden\n',
      },
    );
  });

  test('rolhek-dicht/AC-4: ask geeft permissionDecision ask met de redenen samengevoegd met "; "', () => {
    const result = uitvoer({ deny: [], ask: ['a', 'b'], context: [] });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toStrictEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'a; b' },
    });
  });

  test('rolhek-dicht/AC-4: allow geeft permissionDecision allow zonder reden', () => {
    const result = uitvoer({ deny: [], ask: [], context: [], allow: true });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toStrictEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
    });
  });

  test('rolhek-dicht/AC-4: alleen context geeft additionalContext samengevoegd met een regeleinde', () => {
    const result = uitvoer({ deny: [], ask: [], context: ['c1', 'c2'] });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toStrictEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'c1\nc2' },
    });
  });

  test('rolhek-dicht/AC-4: ask+context geeft beide, en ask wint van allow', () => {
    const result = uitvoer({ deny: [], ask: ['a'], context: ['c'], allow: true });

    expect(JSON.parse(result.stdout)).toStrictEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: 'a',
        additionalContext: 'c',
      },
    });
  });

  test('rolhek-dicht/AC-4: leeg geeft exit 0 zonder uitvoer', () => {
    expect(uitvoer({ deny: [], ask: [], context: [] })).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
  });
});

// Procesniveau: het echte hook-script, zoals test/hooks/rolhek-script.test.ts het draait (app-origin, geen onderhoudsmodus).
const root = process.cwd();
const APP_ORIGIN = {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'remote.origin.url',
  GIT_CONFIG_VALUE_0: 'https://github.com/acme/app.git',
};

function run(input: string): { exitCode: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', ['rails/hooks/rolhek.mjs'], {
    input,
    encoding: 'utf8',
    env: { ...process.env, ...APP_ORIGIN, CLAUDE_PROJECT_DIR: root },
  });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

const bash = (command: string) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: root });
// Edit door de hoofdsessie (geen agent_type) op een bestaand testbestand: alleen context ("is een bestaande test").
const editBestaandeTest = JSON.stringify({
  tool_name: 'Edit',
  tool_input: { file_path: `${root}/test/hooks/rolhek.test.ts`, old_string: 'Rolhek', new_string: 'Het rolhek' },
  cwd: root,
});

/** Het soort uitvoer: exitcode, of stdout leeg is, de permissionDecision en of er additionalContext is. */
function soort(result: { exitCode: number | null; stdout: string }) {
  const binnen: unknown = result.stdout === '' ? undefined : child(JSON.parse(result.stdout), 'hookSpecificOutput');
  return {
    exitCode: result.exitCode,
    stdoutLeeg: result.stdout === '',
    permissionDecision: child(binnen, 'permissionDecision'),
    context: typeof child(binnen, 'additionalContext') === 'string',
  };
}

// Allow (automatische runner of "Status uit main") vraagt een vertrouwde basis van main (runnerIsTrusted, authority uit
// het anker); dat is als proces niet op te zetten zonder vertrouwde runner-opzet, dus allow staat alleen bij uitvoer().
describe('rolhek-dicht/AC-4: het rolhek als proces', () => {
  test.each([
    {
      vorm: 'deny',
      input: bash('git push origin main'),
      verwacht: { exitCode: 2, stdoutLeeg: true, permissionDecision: undefined, context: false },
    },
    {
      vorm: 'ask',
      input: bash('echo x > scripts/x.ts'),
      verwacht: { exitCode: 0, stdoutLeeg: false, permissionDecision: 'ask' },
    },
    {
      vorm: 'alleen context',
      input: editBestaandeTest,
      verwacht: { exitCode: 0, stdoutLeeg: false, permissionDecision: undefined, context: true },
    },
    {
      vorm: 'leeg',
      input: bash('ls'),
      verwacht: { exitCode: 0, stdoutLeeg: true, permissionDecision: undefined, context: false },
    },
  ])(
    'rolhek-dicht/AC-4: $vorm als proces voldoet aan de vormregels en geeft het juiste soort uitvoer',
    ({ input, verwacht }) => {
      const result = run(input);

      expect(vormfouten(result), result.stdout + result.stderr).toStrictEqual([]);
      expect(soort(result)).toMatchObject(verwacht);
    },
  );

  test('rolhek-dicht/AC-4: deny als proces zet de reden op stderr', () => {
    expect(run(bash('git push origin main')).stderr).toBe('rolhek: push naar main is verboden; open een PR\n');
  });

  test('rolhek-dicht/AC-4: alleen context als proces heeft precies hookEventName en additionalContext', () => {
    const result = run(editBestaandeTest);

    expect(keysOf(child(JSON.parse(result.stdout), 'hookSpecificOutput')).sort()).toStrictEqual([
      'additionalContext',
      'hookEventName',
    ]);
    expect(result.stdout).toContain('is een bestaande test');
  });
});
