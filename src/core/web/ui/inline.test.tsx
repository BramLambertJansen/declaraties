import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Inline } from './inline.tsx';

afterEach(cleanup);

const GAPS = ['gap-1', 'gap-2', 'gap-4', 'gap-6', 'gap-8'];
const ALIGNS = ['items-start', 'items-center', 'items-baseline'];
const JUSTIFIES = ['justify-start', 'justify-between', 'justify-end'];

function classes() {
  return [...screen.getByTestId('rij').classList];
}

// typografie-en-layout/AC-6
test('typografie-en-layout/AC-6: Inline zonder props is een div met flex flex-row flex-wrap gap-2 items-center justify-start', () => {
  render(
    <Inline data-testid="rij" aria-label="Rij">
      Inhoud
    </Inline>,
  );
  const element = screen.getByTestId('rij');
  expect(element.tagName).toBe('DIV');
  expect(element.getAttribute('aria-label')).toBe('Rij');
  expect(classes()).toEqual(
    expect.arrayContaining(['flex', 'flex-row', 'flex-wrap', 'gap-2', 'items-center', 'justify-start']),
  );
});

// typografie-en-layout/AC-6
test.each([
  ['xs', 'gap-1'],
  ['sm', 'gap-2'],
  ['md', 'gap-4'],
  ['lg', 'gap-6'],
  ['xl', 'gap-8'],
] as const)('typografie-en-layout/AC-6: gap="%s" geeft alleen %s', (gap, expected) => {
  render(
    <Inline gap={gap} data-testid="rij">
      Inhoud
    </Inline>,
  );
  expect(classes().filter((name) => GAPS.includes(name))).toStrictEqual([expected]);
});

// typografie-en-layout/AC-6
test.each([
  ['start', 'items-start'],
  ['center', 'items-center'],
  ['baseline', 'items-baseline'],
] as const)('typografie-en-layout/AC-6: align="%s" geeft alleen %s', (align, expected) => {
  render(
    <Inline align={align} data-testid="rij">
      Inhoud
    </Inline>,
  );
  expect(classes().filter((name) => ALIGNS.includes(name))).toStrictEqual([expected]);
});

// typografie-en-layout/AC-6
test.each([
  ['start', 'justify-start'],
  ['between', 'justify-between'],
  ['end', 'justify-end'],
] as const)('typografie-en-layout/AC-6: justify="%s" geeft alleen %s', (justify, expected) => {
  render(
    <Inline justify={justify} data-testid="rij">
      Inhoud
    </Inline>,
  );
  expect(classes().filter((name) => JUSTIFIES.includes(name))).toStrictEqual([expected]);
});
