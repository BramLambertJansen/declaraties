import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Bron-eisen van spec typografie-en-layout die de DOM niet kan bewijzen: welke klassen in features staan, dat Section
// Heading gebruikt en dat de vier componenten via de app-barrel bereikbaar zijn.
const root = new URL('../../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');

// Alle klassen uit className="…" en className={cn('…')}-achtige letterlijke strings in de bron.
function classNames(source: string): string[] {
  const literals = [...source.matchAll(/className=(?:"([^"]*)"|\{[^}]*?'([^']*)'[^}]*\})/g)].map(
    (match) => match[1] ?? match[2] ?? '',
  );
  return literals.flatMap((literal) => literal.split(/\s+/)).filter((name) => name !== '');
}

function barrelNames(): Set<string> {
  const names = new Set<string>();
  for (const match of read('src/web/ui/index.ts').matchAll(/^export \{([^}]*)\}/gm))
    for (const part of (match[1] ?? '').split(',')) names.add(part.trim().replace(/^type\s+/, ''));
  names.delete('');
  return names;
}

test('typografie-en-layout/AC-7: Section rendert de titel met <Heading level={2} id={id}>', () => {
  const source = read('src/web/ui/section.tsx');
  expect(source).toMatch(/<Heading level=\{2\} id=\{id\}>/);
  expect(source).not.toMatch(/<h2\b/);
});

test('typografie-en-layout/AC-8: sessions-section.tsx heeft geen font-*, text-* of ml-* klasse meer en gebruikt Inline en Text', () => {
  const source = read('src/web/features/account/sessions-section.tsx');
  expect(classNames(source).filter((name) => /^(font-|text-|ml-)/.test(name))).toStrictEqual([]);
  expect(source).toMatch(/<Inline gap="sm">/);
  expect(source).toMatch(/<Text as="span" weight="medium">/);
  expect(source).toMatch(/<Text as="span" tone="muted">/);
});

test('typografie-en-layout/AC-9: accounts-page.tsx heeft geen text-sm of text-muted-foreground meer en gebruikt Text', () => {
  const source = read('src/web/features/accounts/accounts-page.tsx');
  expect(source).not.toMatch(/text-sm|text-muted-foreground/);
  expect(source).toMatch(/<Text size="sm" tone="muted" aria-live="polite">/);
});

test('typografie-en-layout/AC-10: Text, Heading, Stack en Inline staan in de app-barrel', () => {
  const barrel = barrelNames();
  expect(['Text', 'Heading', 'Stack', 'Inline'].filter((name) => !barrel.has(name))).toStrictEqual([]);
  for (const file of ['text', 'heading', 'stack', 'inline'])
    expect(read('src/web/ui/index.ts')).toContain(`'#core/web/ui/${file}.tsx'`);
});
