import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// De app-barrel src/web/ui/index.ts is de enige importbron voor features (framework §7). Elke publieke export van de
// onderdelen uit de specs ui-kit-basics (AC-9) en ui-collections (AC-1) moet er via bereikbaar zijn, waarden en types.
const root = new URL('../../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');

const BASICS = [
  'textarea',
  'checkbox',
  'radio-group',
  'form-checkbox-field',
  'form-radio-group-field',
  'status-badge',
  'empty-state',
];
const COLLECTIONS = ['combobox', 'form-combobox-field', 'accordion', 'list', 'description-list'];
// Bestaande namen die ongewijzigd moeten blijven werken (ui-collections/AC-1).
const EXISTING = ['Input', 'Select', 'Button', 'Form', 'FormField', 'Field', 'AsyncView', 'Dialog', 'DropdownMenu'];

function barrelNames(): Set<string> {
  const names = new Set<string>();
  for (const match of read('src/web/ui/index.ts').matchAll(/^export \{([^}]*)\}/gm))
    for (const part of (match[1] ?? '').split(',')) names.add(part.trim().replace(/^type\s+/, ''));
  names.delete('');
  return names;
}

function publicNames(component: string): string[] {
  const source = read(`src/core/web/ui/${component}.tsx`);
  return [...source.matchAll(/^export (?:function|interface|type|const|class) (\w+)/gm)].map((match) => match[1] ?? '');
}

test.each([
  ['ui-kit-basics/AC-9', BASICS],
  ['ui-collections/AC-1', COLLECTIONS],
])('%s: elke publieke export van de nieuwe onderdelen staat in de app-barrel', (_ac, components) => {
  const barrel = barrelNames();
  const missing = components.flatMap((component) => {
    const names = publicNames(component);
    expect(names.length, `${component} heeft publieke exports`).toBeGreaterThan(0);
    return names.filter((name) => !barrel.has(name)).map((name) => `${component}: ${name}`);
  });

  expect(missing).toStrictEqual([]);
});

test('ui-collections/AC-1: bestaande importnamen blijven in de app-barrel', () => {
  const barrel = barrelNames();

  expect(EXISTING.filter((name) => !barrel.has(name))).toStrictEqual([]);
});
