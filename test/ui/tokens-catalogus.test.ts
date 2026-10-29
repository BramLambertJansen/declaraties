import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

// semantische-tokens/AC-20 (3c): de TokenSwatch-voorbeelden op /design-system zijn precies de --color-*-namen uit @theme
// (behalve transparent en current), en dat is ook de color-unie van TokenSwatch. Brontest zoals
// test/ui/typografie-en-layout.test.ts; in vitest is CSS leeg, daarom staat dit deel niet naast de DOM-test
// (src/web/features/design-system/tokens-examples.test.tsx), die de voorbeelden in de sectie "Tokens" toetst.
const root = path.join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const escape = (value: string) => value.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
const SWATCH = 'src/web/ui/token-swatch.tsx';
const CATALOGUE = 'src/web/features/design-system';

const themeBlock = /@theme inline\s*\{([\s\S]*?)\n\}/.exec(read('src/core/web/styles/index.css'))?.[1] ?? '';
const THEME_COLORS = [...themeBlock.matchAll(/^\s*--color-([a-z][\w-]*)\s*:/gm)]
  .map((match) => match[1] ?? '')
  .filter((name) => name !== 'transparent' && name !== 'current')
  .sort();

const examples = readdirSync(path.join(root, CATALOGUE))
  .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
  .map((file) => read(`${CATALOGUE}/${file}`))
  .join('\n');

test('semantische-tokens/AC-20: de color-unie van TokenSwatch is precies de --color-*-verzameling uit @theme', () => {
  expect(THEME_COLORS, 'de brontest leest index.css').toEqual(
    expect.arrayContaining(['primary', 'warning-foreground']),
  );
  expect(existsSync(path.join(root, SWATCH)), SWATCH).toBe(true);
  const source = existsSync(path.join(root, SWATCH)) ? read(SWATCH) : '';
  const literal = (name: string) => new RegExp(`['"]${escape(name)}['"]`).test(source);
  expect(
    THEME_COLORS.filter((name) => !literal(name)),
    'ontbreekt in de unie',
  ).toStrictEqual([]);
  expect(['transparent', 'current'].filter(literal), 'hoort niet in de unie').toStrictEqual([]);
});

test('semantische-tokens/AC-20: de catalogus heeft precies één letterlijk TokenSwatch-voorbeeld per kleur', () => {
  const colors = [...examples.matchAll(/<TokenSwatch\b[^>]*\bcolor=["']([\w-]+)["']/g)].map((match) => match[1] ?? '');
  expect(colors.toSorted()).toStrictEqual(THEME_COLORS);
});
