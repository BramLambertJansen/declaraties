import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Heading } from './heading.tsx';

afterEach(cleanup);

// typografie-en-layout/AC-4
test.each([
  [2, 'H2', 'text-xl'],
  [3, 'H3', 'text-lg'],
  [4, 'H4', 'text-base'],
] as const)('typografie-en-layout/AC-4: Heading level %i rendert %s met %s en font-semibold', (level, tag, size) => {
  render(
    <Heading level={level} id={`kop-${String(level)}`}>
      Kop
    </Heading>,
  );
  const heading = screen.getByRole('heading', { level, name: 'Kop' });
  expect(heading.tagName).toBe(tag);
  expect(heading.id).toBe(`kop-${String(level)}`);
  expect([...heading.classList]).toEqual(expect.arrayContaining([size, 'font-semibold']));
  for (const other of ['text-xl', 'text-lg', 'text-base'].filter((name) => name !== size))
    expect(heading.classList.contains(other)).toBe(false);
});

// Alleen voor de typecheck (`pnpm typecheck`): h1 blijft voorbehouden aan PageTitle en level is verplicht.
function invalidHeadings() {
  return [
    // @ts-expect-error -- typografie-en-layout/AC-4: level 1 bestaat niet (h1 alleen via PageTitle)
    <Heading key="een" level={1}>
      Te hoog
    </Heading>,
    // @ts-expect-error -- typografie-en-layout/AC-4: level is verplicht
    <Heading key="geen">Zonder niveau</Heading>,
  ];
}

// typografie-en-layout/AC-4
test('typografie-en-layout/AC-4: zonder id staat er geen leeg id op de kop', () => {
  render(<Heading level={2}>Zonder id</Heading>);
  expect(screen.getByRole('heading', { level: 2, name: 'Zonder id' }).hasAttribute('id')).toBe(false);
  expect(invalidHeadings()).toHaveLength(2);
});
