import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { TokenSwatch, type TokenColor } from './index.ts';
import * as sourceModule from './token-swatch.tsx';

// semantische-tokens/AC-21 (3c). Statische import uit de barrel, zodat de echte props-types gecontroleerd worden; de
// glob toetst alleen dat het bronbestand precies src/web/ui/token-swatch.tsx is.
const source = import.meta.glob('./token-swatch.tsx');

afterEach(cleanup);

function swatch(color: TokenColor) {
  expect(TokenSwatch, 'TokenSwatch in src/web/ui/index.ts').toBeTypeOf('function');
  return render(<TokenSwatch color={color} />);
}

test('semantische-tokens/AC-21: TokenSwatch staat in src/web/ui/token-swatch.tsx en in src/web/ui/index.ts', () => {
  expect(Object.keys(source)).toStrictEqual(['./token-swatch.tsx']);
  expect(TokenSwatch, 'export uit index.ts').toBeTypeOf('function');
  expect(TokenSwatch).toBe(sourceModule.TokenSwatch);
});

test('semantische-tokens/AC-21: het vlak heeft aria-hidden="true" en de tokennaam is zichtbare tekst', () => {
  const { container } = swatch('primary');
  const surfaces = [...container.querySelectorAll('[aria-hidden="true"]')];
  expect(surfaces).toHaveLength(1);
  expect(surfaces[0]?.textContent).toBe('');
  const label = screen.getByText('primary', { exact: true });
  expect(label.closest('[aria-hidden="true"]')).toBeNull();
  expect(label.closest('[hidden]')).toBeNull();
  expect(label.classList.contains('sr-only')).toBe(false);
});

test('semantische-tokens/AC-21: elke tokennaam als eigen label, ook een samengestelde', () => {
  swatch('success-foreground');
  expect(screen.getByText('success-foreground', { exact: true })).toBeTruthy();
  expect(screen.queryByText('success', { exact: true })).toBeNull();
});
