import { describe, expect, test } from 'vitest';
import { prStatus, sessionStart } from '../../rails/hooks/lib/werkstraat.mjs';

// SessionStart toont de open PR van de branch met CI- en reviewstatus (ontwikkelgemak 1). `prStatus` vertaalt de uitvoer van
// `gh pr view --json …` naar één regel; sessionStart vraagt gh alleen buiten main/HEAD en zwijgt als gh faalt (fail-open).

const GH_ARGS = ['pr', 'view', '--json', 'number,state,isDraft,reviewDecision,statusCheckRollup'];

function pr(velden: Record<string, unknown>): string {
  return JSON.stringify({ number: 12, state: 'OPEN', isDraft: false, reviewDecision: '', ...velden });
}

const run = (name: string, status: string, conclusion: string | null) => ({ name, status, conclusion });
const context = (naam: string, state: string) => ({ context: naam, state });

describe('prStatus', () => {
  test.each([
    'kapot',
    '',
    'null',
    '[]',
    '"PR"',
    JSON.stringify({ number: '12', state: 'OPEN' }),
    JSON.stringify({ state: 'OPEN' }),
  ])('onleesbaar of zonder numeriek nummer: lege tekst (%s)', (uitvoer) => {
    expect(prStatus(uitvoer)).toBe('');
  });

  test('open PR zonder checks en zonder reviewbesluit', () => {
    expect(prStatus(pr({ statusCheckRollup: [] }))).toBe('PR #12 (open): geen checks');
  });

  test('ontbrekende checklijst telt als geen checks', () => {
    expect(prStatus(JSON.stringify({ number: 5, state: 'OPEN', isDraft: false, reviewDecision: null }))).toBe(
      'PR #5 (open): geen checks',
    );
  });

  test('concept met groene, rode en lopende checks (CheckRun en StatusContext) en gevraagde wijzigingen', () => {
    const uitvoer = pr({
      number: 7,
      isDraft: true,
      reviewDecision: 'CHANGES_REQUESTED',
      statusCheckRollup: [
        run('build', 'COMPLETED', 'SUCCESS'),
        run('lint', 'COMPLETED', 'FAILURE'),
        run('e2e', 'IN_PROGRESS', null),
        run('docs', 'COMPLETED', 'NEUTRAL'),
        run('optioneel', 'COMPLETED', 'SKIPPED'),
        context('ci/extern', 'ERROR'),
        context('ci/wacht', 'PENDING'),
        context('ci/ok', 'SUCCESS'),
      ],
    });

    expect(prStatus(uitvoer)).toBe(
      'PR #7 (open, concept): checks 4 groen, 2 rood (lint, ci/extern), 2 bezig; review: wijzigingen gevraagd',
    );
  });

  test.each(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])(
    'conclusie %s telt als rood',
    (conclusion) => {
      expect(prStatus(pr({ statusCheckRollup: [run('x', 'COMPLETED', conclusion)] }))).toBe(
        'PR #12 (open): checks 0 groen, 1 rood (x), 0 bezig',
      );
    },
  );

  test.each(['FAILURE', 'ERROR'])('status-context %s telt als rood', (state) => {
    expect(prStatus(pr({ statusCheckRollup: [context('ci/y', state)] }))).toBe(
      'PR #12 (open): checks 0 groen, 1 rood (ci/y), 0 bezig',
    );
  });

  test('wachtrij, lopend en EXPECTED tellen als bezig; zonder rode staat er 0 rood', () => {
    const uitvoer = pr({
      statusCheckRollup: [
        run('a', 'QUEUED', null),
        run('b', 'IN_PROGRESS', null),
        context('c', 'EXPECTED'),
        run('d', 'COMPLETED', 'SUCCESS'),
      ],
    });

    expect(prStatus(uitvoer)).toBe('PR #12 (open): checks 1 groen, 0 rood, 3 bezig');
  });

  test('gemerged en goedgekeurd: met de aanwijzing voor nieuw werk vanaf een verse origin/main', () => {
    const uitvoer = pr({
      number: 3,
      state: 'MERGED',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [run('build', 'COMPLETED', 'SUCCESS')],
    });

    expect(prStatus(uitvoer)).toBe(
      'PR #3 (gemerged): checks 1 groen, 0 rood, 0 bezig; review: goedgekeurd — gemerged: begin nieuw werk vanaf een verse origin/main',
    );
  });

  test('gesloten met review nodig', () => {
    expect(prStatus(pr({ number: 4, state: 'CLOSED', reviewDecision: 'REVIEW_REQUIRED', statusCheckRollup: [] }))).toBe(
      'PR #4 (gesloten): geen checks; review: review nodig',
    );
  });
});

interface RunOptions {
  readonly timeout?: number;
  readonly env?: Record<string, string>;
}

function prDeps(opties: { branch: string; ghCode?: number; ghOutput?: string }) {
  const calls: string[] = [];
  const ghOptions: RunOptions[] = [];
  return {
    calls,
    ghOptions,
    deps: {
      run: (command: string, args: readonly string[], runOptions: RunOptions = {}) => {
        const line = [command, ...args].join(' ');
        calls.push(line);
        if (command === 'gh') {
          ghOptions.push(runOptions);
          return { code: opties.ghCode ?? 0, output: opties.ghOutput ?? '' };
        }
        if (line.startsWith('git rev-parse')) return { code: 0, output: `${opties.branch}\n` };
        if (line.startsWith('git rev-list')) return { code: 0, output: '0\t0' };
        return { code: 0, output: 'x' };
      },
      changed: () => [],
      read: () => null,
    },
  };
}

describe('session-start: open PR', () => {
  test('feature-branch: vraagt gh zonder prompt en met harde timeout, en toont de PR-regel', () => {
    const fake = prDeps({ branch: 'feat/x', ghOutput: pr({ statusCheckRollup: [] }) });
    const text = sessionStart(fake.deps).stdout ?? '';

    expect(fake.calls).toContain(['gh', ...GH_ARGS].join(' '));
    expect(fake.ghOptions).toStrictEqual([
      { timeout: 5000, env: { GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' } },
    ]);
    expect(text.split('\n')).toContain('PR #12 (open): geen checks');
    expect(text).toContain('Branch: feat/x');
  });

  test('gh faalt (geen PR, geen netwerk): geen PR-regel, de hook gaat door', () => {
    const fake = prDeps({ branch: 'feat/x', ghCode: 1, ghOutput: 'no pull requests found for branch "feat/x"' });
    const text = sessionStart(fake.deps).stdout ?? '';

    expect(fake.ghOptions).toHaveLength(1);
    expect(text).not.toContain('PR #');
    expect(text).not.toContain('no pull requests');
    expect(text).toContain('Branch: feat/x');
  });

  test('onleesbare gh-uitvoer: geen lege regel in de context', () => {
    const text = sessionStart(prDeps({ branch: 'feat/x', ghOutput: 'kapot' }).deps).stdout ?? '';

    expect(text).not.toContain('PR #');
    expect(text.split('\n')).not.toContain('');
  });

  test.each(['main', 'HEAD'])('op %s draait gh niet', (branch) => {
    const fake = prDeps({ branch, ghOutput: pr({ statusCheckRollup: [] }) });
    const text = sessionStart(fake.deps).stdout ?? '';

    expect(fake.calls.filter((call) => call.startsWith('gh '))).toStrictEqual([]);
    expect(text).not.toContain('PR #');
  });
});
