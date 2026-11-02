import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';

// meting-kerncijfers AC-1: de sleutel van een subagent-aanroep is `agent <type>`; nooit andere inputvelden (prompt).
const root = process.cwd();

type SleutelFn = (tool: string, input: Record<string, unknown>, cwd: string) => string;

async function laad(): Promise<SleutelFn> {
  const mod: unknown = await import(pathToFileURL(path.join(root, 'rails/hooks/lib/meting.mjs')).href);
  const fn: unknown =
    typeof mod === 'object' && mod !== null ? Object.entries(mod).find(([n]) => n === 'sleutel')?.[1] : undefined;
  if (typeof fn !== 'function') throw new Error('sleutel ontbreekt');
  return (tool, input, cwd) => {
    const uit: unknown = Reflect.apply(fn, undefined, [tool, input, cwd]);
    return typeof uit === 'string' ? uit : '<geen string>';
  };
}

test.each([
  ['Agent', 'reviewer', 'agent reviewer'],
  ['Task', 'tester', 'agent tester'],
  ['Agent', 'general-purpose', 'agent general-purpose'],
  ['Agent', 'a1', 'agent a1'],
  ['Agent', 'a'.repeat(64), `agent ${'a'.repeat(64)}`],
  ['Agent', 'a'.repeat(65), 'agent'],
])('meting-kerncijfers AC-1: %s met subagent_type %j geeft %j', async (tool, type, verwacht) => {
  const sleutel = await laad();
  expect(sleutel(tool, { subagent_type: type }, root)).toBe(verwacht);
});

test.each<[string, Record<string, unknown>]>([
  ['ontbrekend', {}],
  ['niet-string (getal)', { subagent_type: 5 }],
  ['niet-string (object)', { subagent_type: { a: 1 } }],
  ['null', { subagent_type: null }],
  ['leeg', { subagent_type: '' }],
  ['hoofdletters', { subagent_type: 'Reviewer' }],
  ['begint met cijfer', { subagent_type: '1abc' }],
  ['begint met streepje', { subagent_type: '-x' }],
  ['spatie', { subagent_type: 'rev iewer' }],
  ['newline', { subagent_type: 'reviewer\nrm -rf' }],
  ['underscore', { subagent_type: 'a_b' }],
  ['pad', { subagent_type: '../etc' }],
])('meting-kerncijfers AC-1: ongeldig type (%s) geeft kale `agent`', async (_naam, input) => {
  const sleutel = await laad();
  expect(sleutel('Agent', input, root)).toBe('agent');
});

test('meting-kerncijfers AC-1: prompt en andere velden lekken nooit in de sleutel', async () => {
  const sleutel = await laad();
  const geheim = 'GEHEIM-prompt-tekst';
  const input = { subagent_type: 'reviewer', prompt: geheim, description: geheim, command: geheim, file_path: geheim };
  expect(sleutel('Agent', input, root)).toBe('agent reviewer');
  expect(sleutel('Task', { prompt: geheim, description: geheim }, root)).toBe('agent');
  expect(sleutel('Agent', { subagent_type: geheim, prompt: geheim }, root)).toBe('agent');
});
