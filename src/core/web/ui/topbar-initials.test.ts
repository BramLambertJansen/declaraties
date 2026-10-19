import { expect, test } from 'vitest';
import { initials } from './topbar.tsx';

test.each([
  ['\u{10428}da \u{10429}ert', '\u{10400}\u{10401}'],
  ['\u{10428}da Jansen', '\u{10400}J'],
  ['\u{10428}da', '\u{10400}'],
  ['Ada Lovelace', 'AL'],
  ['  ada   van   dijk ', 'AD'],
  ['Élodie', 'É'],
  ['', '?'],
])('initialen houden volledige Unicode-letters: %s', (name, expected) => {
  expect(initials(name)).toBe(expected);
});
