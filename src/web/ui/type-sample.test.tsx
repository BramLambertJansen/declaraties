import { cleanup, render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { afterEach, describe, expect, test } from 'vitest';

// semantische-tokens/AC-21 (3c). TypeSample bestaat nog niet; een statische import zou typecheck breken. Daarom laden we
// de barrel en het bronbestand via import.meta.glob (Vite): ontbreekt het, dan is de glob leeg en faalt de assertie, niet
// de import. Na de bouw kan dit een gewone import worden.
const SIZES = ['sm', 'base', 'lg', 'xl', '2xl'] as const;
const WEIGHTS = ['normal', 'medium', 'semibold'] as const;
interface TypeSampleProps {
  readonly size?: (typeof SIZES)[number];
  readonly weight?: (typeof WEIGHTS)[number];
  readonly family?: 'sans' | 'mono';
}
interface Barrel {
  readonly TypeSample?: ComponentType<TypeSampleProps>;
}
const barrel = Object.values(import.meta.glob<Barrel>('./index.ts', { eager: true }))[0];
const source = import.meta.glob<Barrel>('./type-sample.tsx', { eager: true });

afterEach(cleanup);

function sample(props: TypeSampleProps, text: string) {
  const TypeSample = barrel?.TypeSample;
  expect(TypeSample, 'TypeSample in src/web/ui/index.ts').toBeTypeOf('function');
  render(TypeSample === undefined ? null : createElement(TypeSample, props));
  return [...screen.getByText(text, { exact: true }).classList];
}

// Alleen de klassen van de tokenfamilies tellen; kleur (text-foreground) of layout mag erbij.
const sizeClasses = (classes: readonly string[]) => classes.filter((cls) => /^text-(sm|base|lg|xl|2xl)$/.test(cls));
const weightClasses = (classes: readonly string[]) =>
  classes.filter((cls) => /^font-(normal|medium|semibold|bold|light)$/.test(cls));

test('semantische-tokens/AC-21: TypeSample staat in src/web/ui/type-sample.tsx en in src/web/ui/index.ts', () => {
  expect(Object.keys(source)).toStrictEqual(['./type-sample.tsx']);
  expect(barrel?.TypeSample, 'export uit index.ts').toBeTypeOf('function');
  expect(barrel?.TypeSample).toBe(Object.values(source)[0]?.TypeSample);
});

describe('semantische-tokens/AC-21: size en weight geven precies text-{size} en font-{weight}', () => {
  for (const size of SIZES)
    for (const weight of WEIGHTS)
      test(`${size} · ${weight}`, () => {
        const classes = sample({ size, weight }, `Tekst ${size} · ${weight}`);
        expect(sizeClasses(classes)).toStrictEqual([`text-${size}`]);
        expect(weightClasses(classes)).toStrictEqual([`font-${weight}`]);
        expect(classes).not.toContain('font-mono');
      });
});

test('semantische-tokens/AC-21: family="mono" heeft font-mono en de tekst "Code {size}"', () => {
  const classes = sample({ size: 'sm', family: 'mono' }, 'Code sm');
  expect(classes).toContain('font-mono');
  expect(sizeClasses(classes)).toStrictEqual(['text-sm']);
  expect(classes).not.toContain('font-sans');
});
