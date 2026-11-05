// check-policies (AGENTS.md "elke policy een pgTAP-test op naam", framework §6): elke RLS-policy in de database heeft in
// db/tests/*.sql een assert waarvan de beschrijving met de policynaam begint ('<naam>: …'). De lijst policies komt uit
// pg_policies van de gemigreerde test-database (test/datapad/policies.int.test.ts, in pnpm test:db).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Policies zonder assert die hun naam noemt.
 * @param {readonly string[]} policies
 * @param {readonly string[]} testSources de tekst van de pgTAP-bestanden
 * @returns {string[]}
 */
export function policiesZonderTest(policies, testSources) {
  return policies.filter((name) => !testSources.some((source) => source.includes(`'${name}: `)));
}

/** @param {string} [root] */
export function pgTapBronnen(root = '.') {
  const dir = path.join(root, 'db/tests');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(path.join(dir, file), 'utf8'));
}
