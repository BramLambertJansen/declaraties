import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { unsafeCast } from '#core/shared/unsafe-cast.ts';
import { StatusBadge, type StatusBadgeProps } from './status-badge.tsx';

afterEach(cleanup);

// semantische-tokens/AC-11: de statustonen van StatusBadge op de nieuwe tokens. De tonen bestaan pas na de bouw (3b);
// tot dan zou het type ze weigeren, vandaar unsafeCast.
const tone = (value: string) =>
  unsafeCast<StatusBadgeProps['tone']>(value, 'tonen success/warning bestaan pas na de bouw van 3b');

test.each([
  ['success', 'Voltooid', ['bg-success', 'text-success-foreground']],
  ['warning', 'Verloopt binnenkort', ['bg-warning', 'text-warning-foreground']],
] as const)('semantische-tokens/AC-11: StatusBadge tone=%s heeft %s', (value, label, classes) => {
  render(<StatusBadge tone={tone(value)}>{label}</StatusBadge>);
  const badge = screen.getByText(label);
  expect([...badge.classList]).toEqual(expect.arrayContaining([...classes]));
  for (const neutral of ['bg-muted', 'text-muted-foreground']) expect(badge.classList.contains(neutral)).toBe(false);
});
