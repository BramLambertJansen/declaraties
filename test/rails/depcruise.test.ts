import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { dependencyViolations } from '../../scripts/kit/depcruise.mjs';

// Fixtures voor .dependency-cruiser.mjs (framework §1.5, §2): een mini-project met per regel een overtreding,
// ook via bekende omzeilingen (alias, re-export, dynamische import), en wat wél mag.
const fixtures = path.join(import.meta.dirname, 'fixtures/depcruise');
const violations = await dependencyViolations(fixtures);

function rulesFor(file: string): string[] {
  return [
    ...new Set(violations.filter((violation) => violation.from === file).map((violation) => violation.rule)),
  ].sort();
}

const cases: [file: string, rules: string[]][] = [
  ['src/core/api/relatief.ts', ['core-niet-naar-app']],
  ['src/core/shared/alias.ts', ['core-niet-naar-app', 'shared-alleen-shared']],
  ['src/core/web/dynamisch.ts', ['core-niet-naar-app']],
  ['src/shared/doorgeef.ts', ['shared-alleen-shared']],
  ['src/web/waarde-uit-api.ts', ['web-niet-naar-api']],
  ['src/web/type-uit-api.ts', ['web-niet-naar-api']],
  ['src/web/andere-api.ts', ['web-niet-naar-api']],
  ['src/api/naar-web.ts', ['api-niet-naar-web']],
  ['src/web/db.ts', ['database-alleen-in-core-db']],
  ['src/api/db.ts', ['api-alleen-querybouwer']],
  ['src/api/db/schema.ts', ['api-alleen-querybouwer']],
  ['src/api/drizzle-buiten-schema.ts', []],
  ['src/api/drizzle-driver.ts', ['api-alleen-querybouwer']],
  ['src/api/a.ts', ['geen-cycles']],
  ['src/web/onbekend.ts', ['niet-oplosbaar']],
  ['src/core/api/db/pool.ts', []],
  ['src/web/x.ts', []],
  ['src/api/db-intern.ts', ['db-alleen-via-index']],
  ['src/api/audit-toegestaan.ts', []],
  ['src/api/testing-in-code.ts', ['testing-alleen-in-tests']],
  ['src/api/testing.int.test.ts', []],
];

describe('lagenregels in .dependency-cruiser.mjs', () => {
  test.each(cases)('%s → %j', (file, rules) => {
    expect(rulesFor(file)).toStrictEqual(rules);
  });

  test('elke regel heeft minstens één fixture die faalt', async () => {
    const { default: config } = await import('../../.dependency-cruiser.mjs');
    const covered = new Set(violations.map((violation) => violation.rule));

    expect(config.forbidden.map((rule) => rule.name).filter((name) => !covered.has(name))).toStrictEqual([]);
  });
});
