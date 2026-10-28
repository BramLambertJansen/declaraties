import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Stack } from './stack.tsx';

afterEach(cleanup);

const GAPS = ['gap-1', 'gap-2', 'gap-4', 'gap-6', 'gap-8'];

// typografie-en-layout/AC-5
test('typografie-en-layout/AC-5: Stack zonder props is een div met flex flex-col gap-4', () => {
  render(<Stack data-testid="stapel">Inhoud</Stack>);
  const element = screen.getByTestId('stapel');
  expect(element.tagName).toBe('DIV');
  expect([...element.classList]).toEqual(expect.arrayContaining(['flex', 'flex-col', 'gap-4']));
});

// typografie-en-layout/AC-5
test.each([
  ['xs', 'gap-1'],
  ['sm', 'gap-2'],
  ['md', 'gap-4'],
  ['lg', 'gap-6'],
  ['xl', 'gap-8'],
] as const)('typografie-en-layout/AC-5: gap="%s" geeft alleen %s', (gap, expected) => {
  render(
    <Stack gap={gap} data-testid="stapel">
      Inhoud
    </Stack>,
  );
  const classes = [...screen.getByTestId('stapel').classList];
  expect(classes).toContain(expected);
  expect(classes.filter((name) => GAPS.includes(name))).toStrictEqual([expected]);
});

// typografie-en-layout/AC-5
test.each([
  ['section', 'SECTION'],
  ['ul', 'UL'],
  ['ol', 'OL'],
] as const)('typografie-en-layout/AC-5: as="%s" rendert dat element en native props gaan door', (as, tag) => {
  render(
    <Stack as={as} aria-label="Voorbeeldstapel">
      {as === 'section' ? <p>Eerste</p> : <li>Eerste</li>}
    </Stack>,
  );
  const element = screen.getByLabelText('Voorbeeldstapel');
  expect(element.tagName).toBe(tag);
  expect([...element.classList]).toEqual(expect.arrayContaining(['flex', 'flex-col', 'gap-4']));
});
