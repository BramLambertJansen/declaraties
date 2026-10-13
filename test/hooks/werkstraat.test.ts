import { describe, expect, test } from 'vitest';
import {
  changedFromStatus,
  lastLines,
  nonAssertionFailures,
  postEdit,
  sessionStart,
  stop,
  subagentStop,
} from '../../.claude/hooks/lib/werkstraat.mjs';

// De werkstraat-hooks (framework §8): per hook de beslissing met echte payloads; de commando's zijn nagebootst en
// vastgelegd, zodat de test ook bewijst wát er draait (netwerk alleen voor de fetch van session-start, nooit een database).
const ROOT = '/repo';

function fakeDeps(options: { failing?: readonly string[]; changed?: readonly string[]; output?: string } = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      run: (command: string, args: readonly string[]) => {
        const line = [command, ...args].join(' ');
        calls.push(line);
        const failed = (options.failing ?? []).some((part) => line.includes(part));
        return { code: failed ? 1 : 0, output: options.output ?? (failed ? `fout in ${line}` : 'feat/x') };
      },
      changed: () => [...(options.changed ?? [])],
      read: () => null,
    },
  };
}

function blocked(result: { stdout?: string }): string | null {
  if (result.stdout === undefined) return null;
  const parsed: unknown = JSON.parse(result.stdout);
  return typeof parsed === 'object' && parsed !== null && 'reason' in parsed ? String(parsed.reason) : null;
}

describe('post-edit', () => {
  const edit = (file: string) => ({ tool_name: 'Edit', tool_input: { file_path: file } });

  test('ts-bestand: Prettier schrijft, ESLint controleert; schoon → niets', () => {
    const { deps, calls } = fakeDeps();

    expect(postEdit(edit(`${ROOT}/src/a.ts`), { root: ROOT, deps })).toStrictEqual({});
    expect(calls.map((call) => call.split(' ').slice(0, 3).join(' '))).toStrictEqual([
      'pnpm exec prettier',
      'pnpm exec eslint',
    ]);
  });

  test('ESLint-fout: exit 2 met de melding voor Claude', () => {
    const { deps } = fakeDeps({ failing: ['eslint'] });

    const result = postEdit(edit(`${ROOT}/src/a.ts`), { root: ROOT, deps });

    expect(result.exit).toBe(2);
    expect(result.stderr).toContain('ESLint in src/a.ts');
  });

  test.each([
    { name: 'markdown: alleen Prettier', file: `${ROOT}/docs/a.md`, calls: 1 },
    { name: 'buiten de repo: niets', file: '/tmp/a.ts', calls: 0 },
    { name: 'node_modules: niets', file: `${ROOT}/node_modules/x/a.ts`, calls: 0 },
    { name: 'afbeelding: niets', file: `${ROOT}/src/a.png`, calls: 0 },
  ])('$name', ({ file, calls }) => {
    const fake = fakeDeps();
    postEdit(edit(file), { root: ROOT, deps: fake.deps });

    expect(fake.calls).toHaveLength(calls);
  });
});

describe('stop', () => {
  test('groen: niets; draait typecheck, lint en de bijbehorende unit-tests (geen int, geen e2e)', () => {
    const { deps, calls } = fakeDeps({ changed: ['src/a.ts', 'docs/b.md'] });

    expect(stop({ stop_hook_active: false }, deps)).toStrictEqual({});
    expect(calls).toStrictEqual([
      'pnpm exec tsc -b',
      'pnpm exec eslint --max-warnings 0 --no-warn-ignored src/a.ts',
      'pnpm exec vitest related --run --project unit --project web src/a.ts',
    ]);
  });

  test('rood: blokkeert met de laatste regels', () => {
    const { deps } = fakeDeps({ changed: ['src/a.ts'], failing: ['tsc'] });

    expect(blocked(stop({}, deps))).toContain('✗ typecheck');
  });

  test.each([
    { name: 'stop_hook_active: direct stoppen (geen lus)', payload: { stop_hook_active: true }, changed: ['src/a.ts'] },
    { name: 'plan mode', payload: { permission_mode: 'plan' }, changed: ['src/a.ts'] },
    { name: 'geen gewijzigde code', payload: {}, changed: ['docs/a.md'] },
  ])('$name: niets draaien', ({ payload, changed }) => {
    const { deps, calls } = fakeDeps({ changed, failing: ['tsc'] });

    expect([stop(payload, deps), calls]).toStrictEqual([{}, []]);
  });
});

describe('subagent-stop', () => {
  test('developer: groen vóór klaar, ook bij een schone werkmap', () => {
    const green = fakeDeps();
    const red = fakeDeps({ failing: ['gate:fast'] });

    expect([subagentStop({ agent_type: 'developer' }, green.deps), green.calls]).toStrictEqual([
      {},
      ['pnpm gate:fast'],
    ]);
    expect(blocked(subagentStop({ agent_type: 'developer' }, red.deps))).toContain('Groen vóór klaar');
  });

  test('tester: rode lint of typecheck blokkeert', () => {
    const { deps } = fakeDeps({ changed: ['src/a.test.ts'], failing: ['eslint'] });

    expect(blocked(subagentStop({ agent_type: 'tester' }, deps))).toContain('lint en typecheck');
  });

  test('tester: een test die op een import faalt blokkeert; een rode assertie niet', () => {
    const report = (message: string) =>
      JSON.stringify({
        testResults: [
          { name: 'src/a.test.ts', assertionResults: [{ title: 't', status: 'failed', failureMessages: [message] }] },
        ],
      });
    const importError = fakeDeps({
      changed: ['src/a.test.ts'],
      failing: ['vitest'],
      output: report('TypeError: x is not a function'),
    });
    const assertion = fakeDeps({ changed: ['src/a.test.ts'], output: report('AssertionError: expected 1 to be 2') });

    expect(blocked(subagentStop({ agent_type: 'tester' }, importError.deps))).toContain('niet op een assertie');
    expect(subagentStop({ agent_type: 'tester' }, assertion.deps)).toStrictEqual({});
  });

  test('reviewer: zonder rapport-kop blokkeren, met kop klaar', () => {
    const { deps } = fakeDeps();

    expect(
      blocked(subagentStop({ agent_type: 'reviewer', last_assistant_message: 'Ziet er goed uit.' }, deps)),
    ).toContain('## Bevindingen');
    expect(
      subagentStop(
        { agent_type: 'reviewer', last_assistant_message: '## Bevindingen\nGeen blokkerende bevindingen.' },
        deps,
      ),
    ).toStrictEqual({});
  });

  test('andere agents: niets', () => {
    const { deps, calls } = fakeDeps();

    expect([subagentStop({ agent_type: 'Explore' }, deps), calls]).toStrictEqual([{}, []]);
  });
});

test('session-start: branch, wijzigingen, specs, laatste uitslag en de stack als context', () => {
  const { deps } = fakeDeps({ changed: ['src/a.ts'] });
  const text = sessionStart(deps).stdout ?? '';

  expect(text).toContain('Branch: feat/x');
  expect(text).toContain('Gewijzigde bestanden: src/a.ts');
  expect(text).toContain('geen e2e-uitslag');
  expect(text).toContain('node scripts/kit/feiten.mjs');
});

test('hulpjes: git status en de laatste regels', () => {
  expect(changedFromStatus(' M src/a.ts\n?? b.ts\n D weg.ts\nR  oud.ts -> nieuw.ts\n')).toStrictEqual([
    'src/a.ts',
    'b.ts',
    'nieuw.ts',
  ]);
  expect(lastLines(Array.from({ length: 50 }, (_, i) => String(i)).join('\n')).split('\n')).toHaveLength(40);
  expect(
    nonAssertionFailures(
      JSON.stringify({ testResults: [{ name: 'a.test.ts', assertionResults: [], message: 'Failed to load x' }] }),
    ),
  ).toStrictEqual(['a.test.ts: Failed to load x']);
});

// SessionStart haalt origin/main op en meldt een achterstand: een verouderde lokale basis gaf een verkeerde conclusie over
// wat er al op main stond (docs/reviews/2026-10-13-wrijving.md). De fetch heeft een harde procestimeout en vraagt nooit om
// credentials; een mislukte fetch blokkeert niets (fail-open).
const FETCH = 'git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main';

interface RunOptions {
  readonly timeout?: number;
  readonly env?: Record<string, string>;
}

function lagDeps(options: { fetchCode?: number; counts?: string; countsCode?: number }) {
  const calls: string[] = [];
  const fetchOptions: RunOptions[] = [];
  return {
    calls,
    fetchOptions,
    deps: {
      run: (command: string, args: readonly string[], runOptions: RunOptions = {}) => {
        const line = [command, ...args].join(' ');
        calls.push(line);
        if (line === FETCH) {
          fetchOptions.push(runOptions);
          return { code: options.fetchCode ?? 0, output: '' };
        }
        if (line.startsWith('git rev-list')) return { code: options.countsCode ?? 0, output: options.counts ?? '0\t0' };
        return { code: 0, output: 'feat/x' };
      },
      changed: () => [],
      read: () => null,
    },
  };
}

test('session-start: haalt origin/main op en meldt hoeveel commits de branch achterloopt', () => {
  const { deps, calls } = lagDeps({ counts: '34\t1' });
  const text = sessionStart(deps).stdout ?? '';

  expect(calls).toContain(FETCH);
  expect(text).toContain('34 commits achter op origin/main');
});

test('session-start: de fetch krijgt een harde timeout en vraagt niet om een wachtwoord en laat het SSH-commando van de gebruiker met rust', () => {
  const { deps, fetchOptions } = lagDeps({});
  sessionStart(deps);

  expect(fetchOptions).toHaveLength(1);
  expect(fetchOptions[0]?.timeout).toBe(5000);
  expect(fetchOptions[0]?.env?.['GIT_TERMINAL_PROMPT']).toBe('0');
  expect(fetchOptions[0]?.env?.['GIT_SSH_COMMAND']).toBeUndefined();
});

test('session-start: geen achterstand, geen melding', () => {
  expect(sessionStart(lagDeps({ counts: '0\t3' }).deps).stdout ?? '').not.toContain('achter op origin/main');
});

test('session-start: een mislukte fetch meldt dat, en de hook gaat door', () => {
  const text = sessionStart(lagDeps({ fetchCode: 1 }).deps).stdout ?? '';

  expect(text).toContain('origin/main ophalen mislukt');
  expect(text).toContain('Branch: feat/x');
});

test('session-start: een mislukte fetch én een achterstand geven beide meldingen', () => {
  const text = sessionStart(lagDeps({ fetchCode: 1, counts: '5\t0' }).deps).stdout ?? '';

  expect(text).toContain('origin/main ophalen mislukt');
  expect(text).toContain('5 commits achter op origin/main');
});

test('session-start: zonder bekende origin/main geen melding (een app zonder remote)', () => {
  const text = sessionStart(lagDeps({ fetchCode: 1, countsCode: 128, counts: 'fatal' }).deps).stdout ?? '';

  expect(text).not.toContain('origin/main');
});
