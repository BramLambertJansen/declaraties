import { cleanup, render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { afterEach, expect, test } from 'vitest';

// semantische-tokens/AC-21 (3c). TokenSwatch bestaat nog niet; een statische import zou typecheck breken. Daarom laden we
// de barrel en het bronbestand via import.meta.glob (Vite): ontbreekt het, dan is de glob leeg en faalt de assertie, niet
// de import. Na de bouw kan dit een gewone import worden.
interface Barrel {
  readonly TokenSwatch?: ComponentType<{ color: string }>;
}
const barrel = Object.values(import.meta.glob<Barrel>('./index.ts', { eager: true }))[0];
const source = import.meta.glob<Barrel>('./token-swatch.tsx', { eager: true });

afterEach(cleanup);

function swatch(color: string) {
  const TokenSwatch = barrel?.TokenSwatch;
  expect(TokenSwatch, 'TokenSwatch in src/web/ui/index.ts').toBeTypeOf('function');
  return render(TokenSwatch === undefined ? null : createElement(TokenSwatch, { color }));
}

test('semantische-tokens/AC-21: TokenSwatch staat in src/web/ui/token-swatch.tsx en in src/web/ui/index.ts', () => {
  expect(Object.keys(source)).toStrictEqual(['./token-swatch.tsx']);
  expect(barrel?.TokenSwatch, 'export uit index.ts').toBeTypeOf('function');
  expect(barrel?.TokenSwatch).toBe(Object.values(source)[0]?.TokenSwatch);
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
