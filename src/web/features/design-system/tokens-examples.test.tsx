import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Toaster, ToastProvider } from '#core/web/ui/toast.tsx';
import { DesignSystemPage } from './design-system-page.tsx';

// semantische-tokens/AC-20 (3c): de sectie "Tokens" op /design-system. CSS is in vitest leeg (ook met ?raw), dus de
// kleurnamen komen uit de letterlijke voorbeelden (`<TokenSwatch color="…"`) in de catalogusbron; dat die precies de
// --color-*-namen uit @theme en de color-unie zijn, bewijst test/ui/tokens-catalogus.test.ts. Bronnen als tekst via
// import.meta.glob (?raw): zonder voorbeelden faalt een assertie, niet een import.
afterEach(cleanup);

const EXAMPLES = Object.entries(
  import.meta.glob<string>('/src/web/features/design-system/*.tsx', { query: '?raw', import: 'default', eager: true }),
)
  .filter(([file]) => !file.endsWith('.test.tsx'))
  .map(([, text]) => text)
  .join('\n');
const SWATCH_COLORS = [...EXAMPLES.matchAll(/<TokenSwatch\b[^>]*\bcolor=["']([\w-]+)["']/g)].map(
  (match) => match[1] ?? '',
);

const escape = (value: string) => value.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
const SIZES = ['sm', 'base', 'lg', 'xl', '2xl'] as const;
const WEIGHTS = ['normal', 'medium', 'semibold'] as const;

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

async function tokensSection() {
  setup();
  await screen.findByRole('heading', { level: 1 }, { timeout: 2000 });
  const region = screen.queryByRole('region', { name: 'Tokens' });
  expect(region, 'sectie "Tokens"').not.toBeNull();
  return region ?? document.createElement('section');
}

test('semantische-tokens/AC-20: de sectie Tokens heeft id example-tokens, de uitleg en de vijf subkoppen', async () => {
  const region = await tokensSection();
  expect(region.id).toBe('example-tokens');
  const view = within(region);
  expect(
    view.getByText(
      'Kleur, typografie, dichtheid, lagen en beweging uit de tokens; een app past ze aan in src/web/styles/theme.css.',
    ),
  ).toBeTruthy();
  expect(view.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toStrictEqual([
    'Kleur',
    'Typografie',
    'Dichtheid',
    'Lagen',
    'Beweging',
  ]);
});

test('semantische-tokens/AC-20: een TokenSwatch per --color-*-naam, met de naam als label', async () => {
  const region = await tokensSection();
  const view = within(region);
  expect(SWATCH_COLORS.length, 'letterlijke TokenSwatch-voorbeelden').toBeGreaterThan(20);
  expect(new Set(SWATCH_COLORS).size).toBe(SWATCH_COLORS.length);
  for (const name of SWATCH_COLORS) expect(view.getAllByText(name, { exact: true }), name).toHaveLength(1);
  // Elk vlak is aria-hidden; precies één per kleur, dus geen extra of ontbrekend voorbeeld.
  expect(region.querySelectorAll('[aria-hidden="true"]')).toHaveLength(SWATCH_COLORS.length);
});

test('semantische-tokens/AC-20: een TypeSample voor elke size, elke weight en family="mono"', async () => {
  const view = within(await tokensSection());
  const sizes = SIZES.map(escape).join('|');
  const weights = WEIGHTS.map(escape).join('|');
  for (const size of SIZES)
    expect(view.getAllByText(new RegExp(`^Tekst ${escape(size)} · (${weights})$`)).length, size).toBeGreaterThan(0);
  for (const weight of WEIGHTS)
    expect(view.getAllByText(new RegExp(`^Tekst (${sizes}) · ${escape(weight)}$`)).length, weight).toBeGreaterThan(0);
  const mono = view.getAllByText(new RegExp(`^Code (${sizes})$`));
  expect(mono.length).toBeGreaterThan(0);
  expect(mono.every((element) => element.classList.contains('font-mono'))).toBe(true);
});

test('semantische-tokens/AC-20: een DescriptionList met de klassen voor dichtheid, lagen en beweging', async () => {
  const region = await tokensSection();
  const rows = [...region.querySelectorAll('dl dt')].map((term) => [
    term.textContent.trim(),
    term.nextElementSibling?.textContent ?? '',
  ]);
  const expected: readonly (readonly [string, readonly string[]])[] = [
    ['min-h-control', ['2.75rem']],
    ['z-sticky', ['--layer-sticky', '10']],
    ['z-dropdown', ['--layer-dropdown', '20']],
    ['z-overlay', ['--layer-overlay', '30']],
    ['z-modal', ['--layer-modal', '40']],
    ['z-toast', ['--layer-toast', '50']],
    ['duration-fast', ['--motion-fast', '150ms']],
    ['duration-normal', ['--motion-normal', '200ms']],
    ['ease-standard', ['--motion-ease-standard', 'cubic-bezier(0.4, 0, 0.2, 1)']],
    ['ease-out', ['--motion-ease-out', 'cubic-bezier(0, 0, 0.2, 1)']],
  ];
  expect(rows.map(([term]) => term)).toStrictEqual(expected.map(([term]) => term));
  for (const [term, parts] of expected) {
    const value = rows.find(([candidate]) => candidate === term)?.[1] ?? '';
    for (const part of parts) expect(value, `${term}: ${part}`).toContain(part);
  }
});
