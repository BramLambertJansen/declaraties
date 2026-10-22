// Ratchet (framework §4, ADR 0045): bestaande overtredingen staan in .kit/baseline.json. Een nieuwe overtreding faalt;
// een opgeloste die nog in de baseline staat ook, tot `pnpm ratchet:update` hem weghaalt. Zo daalt schuld alleen.
// De baseline laten groeien is een gate-wijziging (.kit/ is beschermd). ESLint heeft een eigen ratchet:
// eslint-suppressions.json met `pnpm lint:prune`.
import { readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { docsViolations } from './check-docs.mjs';
import { dependencyViolations } from './depcruise.mjs';

const BASELINE = '.kit/baseline.json';

/** @typedef {{ key: string, message: string }} Violation */

/** @type {Record<string, () => Promise<Violation[]>>} */
const checks = {
  'dependency-cruiser': () => dependencyViolations(process.cwd()),
  'check-docs': () => docsViolations(process.cwd()),
};

/**
 * @param {readonly string[]} baseline
 * @param {readonly Violation[]} current
 */
export function compare(baseline, current) {
  const known = new Set(baseline);
  const found = new Set(current.map((violation) => violation.key));
  return {
    nieuw: current.filter((violation) => !known.has(violation.key)),
    opgelost: baseline.filter((key) => !found.has(key)),
  };
}

/** @returns {Record<string, string[]>} */
function readBaseline() {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`${BASELINE} is geen object`);
  return Object.fromEntries(
    Object.keys(checks).map((name) => {
      const keys = Object.entries(parsed).find(([key]) => key === name)?.[1] ?? [];
      if (!Array.isArray(keys) || !keys.every((key) => typeof key === 'string'))
        throw new Error(`${BASELINE}: ${name} is geen lijst`);
      return [name, keys];
    }),
  );
}

async function update() {
  /** @type {Record<string, string[]>} */
  const baseline = {};
  for (const [name, run] of Object.entries(checks))
    baseline[name] = (await run()).map((violation) => violation.key).sort();
  // Via Prettier: anders keurt format:check de baseline af zodra hij een lange lijst bevat.
  const options = (await resolveConfig(BASELINE)) ?? {};
  writeFileSync(BASELINE, await format(JSON.stringify(baseline), { ...options, filepath: BASELINE }));
  console.info(
    `${BASELINE} bijgewerkt. Groeit hij, dan is dit een gate-wijziging (label gate-wijziging + akkoord eigenaar).`,
  );
}

async function check() {
  const baseline = readBaseline();
  let failed = false;
  for (const [name, run] of Object.entries(checks)) {
    const { nieuw, opgelost } = compare(baseline[name] ?? [], await run());
    for (const violation of nieuw) console.error(`✗ ${name}: ${violation.key}\n  ${violation.message}`);
    for (const key of opgelost) console.error(`✗ ${name}: opgelost maar nog in ${BASELINE}: ${key}`);
    if (opgelost.length > 0) console.error('  Haal opgeloste overtredingen weg met `pnpm ratchet:update`.');
    failed ||= nieuw.length > 0 || opgelost.length > 0;
  }
  if (failed) process.exitCode = 1;
  else console.info(`✓ ratchet: geen nieuwe of opgeloste overtredingen (${Object.keys(checks).join(', ')})`);
}

if (import.meta.main) await (process.argv.includes('--update') ? update() : check());
