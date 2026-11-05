import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { TypeSample, type TypeSampleProps } from './index.ts';
import * as sourceModule from './type-sample.tsx';

// semantische-tokens/AC-21 (3c). Statische import uit de barrel, zodat de echte props-types gecontroleerd worden; de
// glob toetst alleen dat het bronbestand precies src/web/ui/type-sample.tsx is.
const SIZES = ['sm', 'base', 'lg', 'xl', '2xl'] as const;
const WEIGHTS = ['normal', 'medium', 'semibold'] as const;
const source = import.meta.glob('./type-sample.tsx');

afterEach(cleanup);

function sample(props: TypeSampleProps, text: string) {
  expect(TypeSample, 'TypeSample in src/web/ui/index.ts').toBeTypeOf('function');
  render(<TypeSample {...props} />);
  return [...screen.getByText(text, { exact: true }).classList];
}

// Alleen de klassen van de tokenfamilies tellen; kleur (text-foreground) of layout mag erbij.
const sizeClasses = (classes: readonly string[]) => classes.filter((cls) => /^text-(sm|base|lg|xl|2xl)$/.test(cls));
const weightClasses = (classes: readonly string[]) =>
  classes.filter((cls) => /^font-(normal|medium|semibold|bold|light)$/.test(cls));

test('semantische-tokens/AC-21: TypeSample staat in src/web/ui/type-sample.tsx en in src/web/ui/index.ts', () => {
  expect(Object.keys(source)).toStrictEqual(['./type-sample.tsx']);
  expect(TypeSample, 'export uit index.ts').toBeTypeOf('function');
  expect(TypeSample).toBe(sourceModule.TypeSample);
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
