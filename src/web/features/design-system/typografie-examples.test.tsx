import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Toaster, ToastProvider } from '#core/web/ui/toast.tsx';
import { DesignSystemPage } from './design-system-page.tsx';
import { exampleTarget } from './example-targets.ts';

afterEach(cleanup);

const SECTION = 'Text, Heading, Stack en Inline';

function setup() {
  const route = createRootRoute({ component: DesignSystemPage });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(
    <ToastProvider>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
      <Toaster />
    </ToastProvider>,
  );
}

async function section() {
  return within(await screen.findByRole('region', { name: SECTION }, { timeout: 2000 }));
}

// typografie-en-layout/AC-10
test('typografie-en-layout/AC-10: één vindplaats met de uitleg uit de spec voor alle vier componenten', () => {
  const text =
    'Typografie en afstand uit componenten: tekstgrootte, toon en gewicht, koppen per niveau en verticale of horizontale stapels.';
  const targets = ['Text', 'Heading', 'Stack', 'Inline'].map((name) => exampleTarget(name));
  expect(targets.map((target) => target?.text)).toStrictEqual([text, text, text, text]);
  expect(new Set(targets.map((target) => target?.id)).size).toBe(1);
});

// typografie-en-layout/AC-10
test('typografie-en-layout/AC-10: de sectie toont elke Text-variant met de letterlijke voorbeeldteksten', async () => {
  setup();
  const view = await section();
  const cases: readonly [string, string, readonly string[]][] = [
    ['Standaardtekst in de basisgrootte.', 'P', ['text-base', 'text-foreground', 'font-normal']],
    ['Kleine tekst.', 'P', ['text-sm']],
    ['Gedempte toelichting.', 'P', ['text-muted-foreground']],
    ['Nadruk met medium gewicht.', 'P', ['font-medium']],
    ['Tekst in een span.', 'SPAN', []],
    ['Tekst in een div.', 'DIV', []],
    ['Gedempte toelichting op een kaart.', 'P', ['text-muted-foreground']],
  ];
  for (const [text, tag, classes] of cases) {
    const element = view.getByText(text);
    expect(element.tagName, text).toBe(tag);
    expect([...element.classList], text).toEqual(expect.arrayContaining([...classes]));
  }
});

// typografie-en-layout/AC-10: de numerieke variant van Heading wordt niet door de catalogus afgedwongen, wel hier.
test('typografie-en-layout/AC-10: Heading toont niveau 2, 3 en 4 binnen de sectie', async () => {
  setup();
  const view = await section();
  for (const level of [2, 3, 4]) {
    const heading = view.getByRole('heading', { level, name: `Kop van niveau ${String(level)}` });
    expect(heading.tagName).toBe(`H${String(level)}`);
  }
});

// typografie-en-layout/AC-10
test('typografie-en-layout/AC-10: Stack per gap, als ul, ol en section; Inline per gap, align en justify', async () => {
  setup();
  const view = await section();
  for (const gap of ['xs', 'sm', 'md', 'lg', 'xl'])
    expect(view.getAllByText(`Afstand ${gap}`).length).toBeGreaterThan(0);
  for (const align of ['start', 'center', 'baseline']) expect(view.getByText(`Uitlijning ${align}`)).toBeTruthy();
  for (const justify of ['start', 'between', 'end']) expect(view.getByText(`Verdeling ${justify}`)).toBeTruthy();
  expect(view.getByRole('region', { name: 'Voorbeeldsectie' }).tagName).toBe('SECTION');
  const lists = view.getAllByRole('list');
  expect(lists.some((list) => list.tagName === 'UL')).toBe(true);
  expect(lists.some((list) => list.tagName === 'OL')).toBe(true);
  expect(view.getAllByText('Eerste').length).toBeGreaterThan(1);
  expect(view.getAllByText('Concept').length).toBeGreaterThan(0);
});

// typografie-en-layout/AC-10
test('typografie-en-layout/AC-10: de componentindex vindt Text, Heading, Stack en Inline in core', async () => {
  setup();
  await section();
  const search = screen.getByLabelText('Component zoeken');
  for (const [name, file] of [
    ['Text', 'text'],
    ['Heading', 'heading'],
    ['Stack', 'stack'],
    ['Inline', 'inline'],
  ] as const) {
    fireEvent.change(search, { target: { value: name } });
    const row = screen.getByRole('row', { name: new RegExp(`^${name} `) });
    expect(within(row).getByText(`src/core/web/ui/${file}.tsx`)).toBeTruthy();
  }
});
