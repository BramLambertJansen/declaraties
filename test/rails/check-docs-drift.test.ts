import { expect, test } from 'vitest';
import { driftVanRepo, driftWaarschuwing } from '../../scripts/kit/check-docs-drift.mjs';

// check:docs-drift (AGENTS.md "Docs in dezelfde PR"): waarschuwt bij src/ zonder docs/ of CHANGELOG.md, nooit bij tests of
// gegenereerde bestanden, en zwijgt als de doc meewijzigt.
test('src/ zonder doc geeft een waarschuwing', () => {
  expect(driftWaarschuwing(['src/api/routes/notes.ts'])).toContain('src/ wijzigt (1 bestand)');
});

test.each([['docs/specs/notes.md'], ['CHANGELOG.md']])('%s bij een wijziging in src/ is stil', (doc) => {
  expect(driftWaarschuwing(['src/api/routes/notes.ts', doc])).toBeNull();
});

test('alleen tests, gegenereerde bestanden of niet-src zijn stil', () => {
  expect(
    driftWaarschuwing(['src/api/notes.test.ts', 'src/web/routeTree.gen.ts', 'src/api/db/schema.ts', 'package.json']),
  ).toBeNull();
});

test('een onleesbare base is een waarschuwing, geen fout', () => {
  expect(driftVanRepo('.', 'bestaat-niet-ref')).toContain('niet te lezen');
});
