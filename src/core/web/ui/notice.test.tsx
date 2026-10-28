import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, test } from 'vitest';
import { unsafeCast } from '#core/shared/unsafe-cast.ts';
import { Notice } from './notice.tsx';

afterEach(cleanup);

// semantische-tokens/AC-12 (OV-7): success en warning zijn een status (role="status"), alleen error onderbreekt
// (role="alert"). De tonen success/warning bestaan pas na de bouw (3b); tot dan zou het type ze weigeren.
const tone = (value: string) =>
  unsafeCast<NonNullable<ComponentProps<typeof Notice>['tone']>>(
    value,
    'tonen success/warning bestaan pas na de bouw van 3b',
  );

test.each([
  ['success', 'Wijzigingen opgeslagen.', ['border-success', 'text-success']],
  ['warning', 'Je sessie verloopt over 5 minuten.', ['border-warning', 'text-warning']],
] as const)('semantische-tokens/AC-12: Notice tone=%s rendert role="status" met %s', (value, text, classes) => {
  render(<Notice tone={tone(value)}>{text}</Notice>);
  const notice = screen.getByRole('status');
  expect(notice.textContent).toBe(text);
  expect([...notice.classList]).toEqual(expect.arrayContaining([...classes]));
  expect(notice.classList.contains('bg-muted')).toBe(false);
});

test('semantische-tokens/AC-12: error blijft role="alert" en zonder tone blijven de klassen van info gelijk', () => {
  render(<Notice tone="error">Er ging iets mis.</Notice>);
  expect(screen.getByRole('alert').textContent).toBe('Er ging iets mis.');
  cleanup();

  render(<Notice>Uitnodiging verstuurd.</Notice>);
  expect([...screen.getByRole('status').classList].sort()).toStrictEqual(
    ['rounded-md', 'border', 'px-3', 'py-2', 'text-sm', 'border-border', 'bg-muted', 'text-foreground'].sort(),
  );
});
