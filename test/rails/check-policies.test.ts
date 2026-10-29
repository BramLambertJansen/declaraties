import { expect, test } from 'vitest';
import { pgTapBronnen, policiesZonderTest } from '../../scripts/kit/check-policies.mjs';

// check-policies: een policy telt pas als een pgTAP-assert met haar naam begint; een naam alleen in commentaar telt niet.
test('een policy zonder assert op naam faalt; met assert niet', () => {
  const sources = [
    "-- user_roles_select_own wordt hieronder getest\nselect ok(true, 'user_roles_select_own: ziet alleen eigen rol');",
    '-- accounts_select_admin: alleen in commentaar',
  ];

  expect(policiesZonderTest(['user_roles_select_own', 'accounts_select_admin'], sources)).toStrictEqual([
    'accounts_select_admin',
  ]);
});

test('de pgTAP-bronnen worden gelezen', () => {
  expect(pgTapBronnen().some((source) => source.includes("'user_roles_select_own: "))).toBe(true);
});
