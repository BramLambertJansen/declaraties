import { expect, test } from 'vitest';

// semantische-tokens/AC-22 (3c), brontest: TokenSwatch en TypeSample zijn alleen voor de catalogus. Features en routes
// buiten src/web/features/design-system gebruiken ze niet; de catalogus wel (anders bewijst het verbod niets, en faalt
// de test vóór de bouw op een assertie).
// Bronnen als tekst via import.meta.glob (?raw), zodat de test in de web-zone geen node:fs nodig heeft.
const sources = import.meta.glob<string>(['/src/web/features/**/*.{ts,tsx}', '/src/web/routes/**/*.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const NAMES = /\b(TokenSwatch|TypeSample)\b/;
const isTest = (file: string) => /\.(test|spec)\.tsx?$/.test(file);
const inCatalogue = (file: string) => file.startsWith('/src/web/features/design-system/');
const files = Object.entries(sources).filter(([file]) => !isTest(file));

test('semantische-tokens/AC-22: TokenSwatch en TypeSample alleen in src/web/features/design-system, en daar wel', () => {
  expect(
    files.some(([file]) => file.startsWith('/src/web/routes/')),
    'de brontest leest routes',
  ).toBe(true);
  expect(
    files.some(([file]) => file.startsWith('/src/web/features/accounts/')),
    'de brontest leest features',
  ).toBe(true);
  const outside = files.filter(([file, text]) => !inCatalogue(file) && NAMES.test(text)).map(([file]) => file);
  expect(outside, 'gebruik buiten de catalogus').toStrictEqual([]);
  const catalogue = files.filter(([file]) => inCatalogue(file)).map(([, text]) => text);
  expect(
    catalogue.some((text) => /<TokenSwatch\b/.test(text)),
    'TokenSwatch in de catalogus',
  ).toBe(true);
  expect(
    catalogue.some((text) => /<TypeSample\b/.test(text)),
    'TypeSample in de catalogus',
  ).toBe(true);
});
