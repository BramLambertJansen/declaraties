import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Text } from './text.tsx';

afterEach(cleanup);

function classesOf(element: HTMLElement) {
  return [...element.classList];
}

// typografie-en-layout/AC-1
test('typografie-en-layout/AC-1: Text zonder props is een p met text-base, text-foreground en font-normal', () => {
  render(<Text>Standaardtekst</Text>);
  const element = screen.getByText('Standaardtekst');
  expect(element.tagName).toBe('P');
  expect(classesOf(element)).toEqual(expect.arrayContaining(['text-base', 'text-foreground', 'font-normal']));
});

// typografie-en-layout/AC-1
test.each([
  ['span', 'SPAN'],
  ['div', 'DIV'],
] as const)('typografie-en-layout/AC-1: Text as="%s" rendert precies dat element', (as, tag) => {
  const view = render(<Text as={as}>Inhoud</Text>);
  expect(screen.getByText('Inhoud').tagName).toBe(tag);
  expect(view.container.querySelector('p')).toBeNull();
});

// typografie-en-layout/AC-2
test('typografie-en-layout/AC-2: size="sm" geeft text-sm en geen text-base', () => {
  render(<Text size="sm">Klein</Text>);
  const classes = classesOf(screen.getByText('Klein'));
  expect(classes).toContain('text-sm');
  expect(classes).not.toContain('text-base');
});

// typografie-en-layout/AC-2
test('typografie-en-layout/AC-2: size="base" geeft text-base en geen text-sm', () => {
  render(<Text size="base">Basis</Text>);
  const classes = classesOf(screen.getByText('Basis'));
  expect(classes).toContain('text-base');
  expect(classes).not.toContain('text-sm');
});

// typografie-en-layout/AC-2
test('typografie-en-layout/AC-2: tone="muted" geeft text-muted-foreground en geen text-foreground', () => {
  render(<Text tone="muted">Gedempt</Text>);
  const classes = classesOf(screen.getByText('Gedempt'));
  expect(classes).toContain('text-muted-foreground');
  expect(classes).not.toContain('text-foreground');
});

// typografie-en-layout/AC-2
test('typografie-en-layout/AC-2: weight="medium" geeft font-medium en geen font-normal', () => {
  render(<Text weight="medium">Nadruk</Text>);
  const classes = classesOf(screen.getByText('Nadruk'));
  expect(classes).toContain('font-medium');
  expect(classes).not.toContain('font-normal');
});

// typografie-en-layout/AC-3
test('typografie-en-layout/AC-3: aria-live en id gaan door; className komt naast de receptklassen', () => {
  render(
    <Text aria-live="polite" id="status-regel" className="truncate" size="sm" tone="muted">
      3 accounts getoond.
    </Text>,
  );
  const element = screen.getByText('3 accounts getoond.');
  expect(element.getAttribute('aria-live')).toBe('polite');
  expect(element.id).toBe('status-regel');
  expect(classesOf(element)).toEqual(
    expect.arrayContaining(['truncate', 'text-sm', 'text-muted-foreground', 'font-normal']),
  );
});
