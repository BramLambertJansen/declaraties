import { describe, expect, test } from 'vitest';
import { driftWaarschuwing } from '../../scripts/kit/check-docs-drift.mjs';
import { docsDrift, postEdit, stop } from '../../rails/hooks/lib/werkstraat.mjs';

// Ontwikkelgemakken 3 en 4: de Stop-hook herinnert één keer aan docs-drift (zelfde regel als check:docs-drift), en een
// bewerkte migratie krijgt de hint voor `pnpm db:generate` als context, zonder zelf iets te draaien.
const ROOT = '/repo';

function fakeDeps(options: { failing?: readonly string[]; changed?: readonly string[] } = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      run: (command: string, args: readonly string[]) => {
        const line = [command, ...args].join(' ');
        calls.push(line);
        const failed = (options.failing ?? []).some((part) => line.includes(part));
        return { code: failed ? 1 : 0, output: failed ? `fout in ${line}` : '' };
      },
      changed: () => [...(options.changed ?? [])],
      read: () => null,
    },
  };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function blocked(result: { stdout?: string }): string | null {
  if (result.stdout === undefined) return null;
  const parsed: unknown = JSON.parse(result.stdout);
  return isRecord(parsed) && parsed['decision'] === 'block' && typeof parsed['reason'] === 'string'
    ? parsed['reason']
    : null;
}

const GEVALLEN: readonly (readonly string[])[] = [
  ['src/a.ts'],
  ['src/a.ts', 'docs/b.md'],
  ['src/a.ts', 'CHANGELOG.md'],
  ['src/a.test.ts'],
  ['src/web/x.spec.tsx'],
  ['src/web/routeTree.gen.ts'],
  ['src/api/db/schema.ts'],
  ['scripts/x.mjs'],
  ['src/a.css'],
  [],
];

describe('docsDrift', () => {
  test('src/ zonder docs: tekst noemt docs-drift en docs/ of CHANGELOG.md', () => {
    const tekst = docsDrift(['src/a.ts']);

    expect(tekst).toContain('docs-drift');
    expect(tekst).toContain('docs/ of CHANGELOG.md');
  });

  test.each(
    [
      ['src/a.ts', 'docs/b.md'],
      ['src/a.ts', 'CHANGELOG.md'],
      ['src/a.test.ts'],
      ['src/web/x.spec.tsx'],
      ['src/web/routeTree.gen.ts'],
      ['src/api/db/schema.ts'],
      ['scripts/x.mjs'],
      [],
    ].map((files) => ({ files })),
  )('geen drift: $files', ({ files }) => {
    expect(docsDrift(files)).toBeNull();
  });

  test.each(GEVALLEN.map((files) => [files]))('zelfde regel als check:docs-drift: %j', (files) => {
    expect(docsDrift(files) === null).toBe(driftWaarschuwing(files) === null);
  });
});

describe('stop: docs-drift', () => {
  test('checks groen en drift: blokkeert met de herinnering, opnieuw stoppen mag', () => {
    const { deps } = fakeDeps({ changed: ['src/a.ts'] });
    const reason = blocked(stop({ stop_hook_active: false }, deps));

    expect(reason).toContain('docs-drift');
    expect(reason).toContain('opnieuw stoppen');
    expect(reason).not.toContain('✗');
  });

  test('checks rood en drift: één rapport met de rode check én docs-drift', () => {
    const { deps } = fakeDeps({ changed: ['src/a.ts'], failing: ['tsc'] });
    const reason = blocked(stop({}, deps));

    expect(reason).toContain('✗ typecheck');
    expect(reason).toContain('docs-drift');
  });

  test('geen drift (docs meegewijzigd): groen blijft niets', () => {
    const { deps, calls } = fakeDeps({ changed: ['src/a.ts', 'docs/b.md'] });

    expect(stop({}, deps)).toStrictEqual({});
    expect(calls).toHaveLength(3);
  });

  test('stop_hook_active: geen tweede herinnering en niets draaien', () => {
    const { deps, calls } = fakeDeps({ changed: ['src/a.ts'] });

    expect([stop({ stop_hook_active: true }, deps), calls]).toStrictEqual([{}, []]);
  });

  test('alleen niet-code onder src/: gedrag zoals nu (niets)', () => {
    const { deps, calls } = fakeDeps({ changed: ['src/a.css'] });

    expect([stop({}, deps), calls]).toStrictEqual([{}, []]);
  });
});

describe('post-edit: migratie', () => {
  const edit = (file: string) => ({ tool_name: 'Write', tool_input: { file_path: file } });

  test('nieuwe migratie: context met pnpm db:generate en het snapshot, zonder commando of exit 2', () => {
    const { deps, calls } = fakeDeps();
    const result = postEdit(edit(`${ROOT}/db/migrations/20261028120000_tabel.sql`), { root: ROOT, deps });

    expect(calls).toStrictEqual([]);
    expect(result.exit).toBeUndefined();
    expect(result.stderr).toBeUndefined();
    const parsed: unknown = JSON.parse(result.stdout ?? 'null');
    const specifiek = isRecord(parsed) ? parsed['hookSpecificOutput'] : undefined;
    expect(isRecord(specifiek) ? specifiek['hookEventName'] : undefined).toBe('PostToolUse');
    const context = isRecord(specifiek) ? specifiek['additionalContext'] : undefined;
    expect(typeof context).toBe('string');
    expect(context).toContain('pnpm db:generate');
    expect(context).toContain('db/schema.snapshot.sql');
  });

  test.each([`${ROOT}/db/tests/x.sql`, `${ROOT}/db/migrations/sub/x.sql`, '/elders/db/migrations/x.sql'])(
    'andere sql (%s): niets',
    (file) => {
      const { deps, calls } = fakeDeps();

      expect([postEdit(edit(file), { root: ROOT, deps }), calls]).toStrictEqual([{}, []]);
    },
  );
});
