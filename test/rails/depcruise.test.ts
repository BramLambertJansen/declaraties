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
  // Spec koppelingsregister: createOutboundClient (outbound/create.ts) alleen binnen src/core/api; de app gaat via het register.
  ['src/api/uitgaande-client.ts', ['uitgaande-client-alleen-in-core']],
  // Ook de bouwstenen achter create.ts en de registerclient: elk pad een eigen fixture, met precies deze ene regel.
  ['src/api/uitgaande-client-client.ts', ['uitgaande-client-alleen-in-core']],
  ['src/api/uitgaande-client-config.ts', ['uitgaande-client-alleen-in-core']],
  ['src/api/register-client.ts', ['uitgaande-client-alleen-in-core']],
  ['src/api/register-reading.ts', ['uitgaande-client-alleen-in-core']],
  // Het register (src/core/api/integrations) maakt de client en leest de schakelaar via db/integration-switch.ts.
  ['src/core/api/integrations/register.ts', []],
];

// Spec koppelingsvorm (AC-12): een route kent alleen de poort, een poort geen HTTP of adapter, en de contracttestfabriek
// (integrations/testing.ts) alleen in tests; de fabriek zelf mag vitest, de nep-partner en het register gebruiken.
const koppelingCases: [file: string, rules: string[]][] = [
  ['src/api/routes/koppeling-adapter.ts', ['koppeling-via-poort']],
  ['src/api/routes/koppeling-schemas.ts', ['koppeling-via-poort']],
  ['src/api/routes/koppeling-poort.ts', []],
  ['src/api/integrations/poort-http/port.ts', ['poort-zonder-http']],
  ['src/api/integrations/poort-register/port.ts', ['poort-zonder-http']],
  ['src/api/integrations/poort-adapter/port.ts', ['poort-zonder-http']],
  ['src/api/integrations/proef/port.ts', []],
  ['src/api/integrations/proef/adapter.ts', []],
  ['src/api/integrations/proef/contract.test.ts', []],
  ['src/api/integratie-testing-in-code.ts', ['testing-alleen-in-tests']],
  ['src/core/api/integrations/testing.ts', []],
];

describe('koppelingsvorm/AC-12: koppelingsregels in .dependency-cruiser.mjs', () => {
  test.each(koppelingCases)('koppelingsvorm/AC-12: %s → %j', (file, rules) => {
    expect(rulesFor(file)).toStrictEqual(rules);
  });
});

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
