import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { Toaster, ToastProvider } from '#core/web/ui/toast.tsx';
import { components } from '#web/ui/component-metadata.ts';
import { DesignSystemPage } from './design-system-page.tsx';
import { exampleTarget } from './example-targets.ts';

// Spec designsystem-toolbox, AC-1 t/m AC-5: de catalogus als toolbox met tabbladen per soort (`vak`), een ingeklapte
// componentenlijst en een gebruikszin per voorbeeldsectie. Opzet zoals design-system-page.test.tsx.
afterEach(cleanup);

// jsdom kent geen scrollIntoView; showExample scrolt na de focus naar de sectie.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

function setup(entry: string) {
  const route = createRootRoute({ component: DesignSystemPage });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: [entry] }) });
  render(
    <ToastProvider>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
      <Toaster />
    </ToastProvider>,
  );
  return router;
}

const TABS = [
  'Basis',
  'Acties',
  'Formulieren',
  'Meldingen en status',
  'Gegevens tonen',
  'Navigatie en layout',
  'Patronen',
];

const INTRO =
  'De gereedschapskist van deze app: alle onderdelen en stijlen waarmee schermen worden gebouwd, met live voorbeelden in het echte thema. Alles hier is voorbeelddata; niets wijzigt echte gegevens.';

function normalized(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function precedes(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function selectedTab(): string {
  const tablist = screen.getByRole('tablist', { name: 'Onderdelen per soort' });
  return normalized(within(tablist).getByRole('tab', { selected: true }).textContent);
}

function listToggle(): HTMLElement {
  return screen.getByRole('button', { name: 'Lijst met alle componenten' });
}

describe('designsystem-toolbox/AC-1: opbouw van de pagina', () => {
  test('designsystem-toolbox/AC-1: kop, inleiding, Componentenindex met dichte lijst en de tabbladen in volgorde', async () => {
    setup('/');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Design system' });
    const intro = screen.getByText(
      (_, element) => element?.tagName === 'P' && normalized(element.textContent) === INTRO,
    );
    const index = screen.getByRole('region', { name: 'Componentenindex' });
    expect(
      within(index).getByText(
        'Zoek een onderdeel op naam of variant. Toon opent het juiste tabblad en springt naar het voorbeeld.',
      ),
    ).toBeTruthy();
    expect(
      within(index).getByRole('button', { name: 'Lijst met alle componenten' }).getAttribute('aria-expanded'),
    ).toBe('false');
    const tablist = screen.getByRole('tablist', { name: 'Onderdelen per soort' });
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((tab) => normalized(tab.textContent)),
    ).toEqual(TABS);
    expect(precedes(heading, intro)).toBe(true);
    expect(precedes(intro, index)).toBe(true);
    expect(precedes(index, tablist)).toBe(true);
  });
});

describe('designsystem-toolbox/AC-2: tabblad uit de zoekparameter vak', () => {
  test('designsystem-toolbox/AC-2: ?vak=formulieren maakt Formulieren actief en verbergt de andere panelen', async () => {
    setup('/?vak=formulieren');
    expect(await screen.findByRole('region', { name: 'Formulier: toestanden' })).toBeTruthy();
    expect(selectedTab()).toBe('Formulieren');
    const tablist = screen.getByRole('tablist', { name: 'Onderdelen per soort' });
    const panels = within(tablist)
      .getAllByRole('tab')
      .map((tab) => ({
        selected: tab.getAttribute('aria-selected') === 'true',
        panel: document.getElementById(tab.getAttribute('aria-controls') ?? ''),
      }));
    expect(panels).toHaveLength(TABS.length);
    for (const { selected, panel } of panels) {
      expect(panel).not.toBeNull();
      expect(panel?.hidden).toBe(!selected);
    }
  });

  test.each(['/?vak=onzin', '/'])('designsystem-toolbox/AC-2: %s selecteert Basis', async (entry) => {
    setup(entry);
    expect(await screen.findByRole('region', { name: 'Tokens' })).toBeTruthy();
    expect(selectedTab()).toBe('Basis');
    expect(screen.queryByRole('region', { name: 'Formulier: toestanden' })).toBeNull();
  });

  test('designsystem-toolbox/AC-2: een ander tabblad kiezen zet vak in de URL', async () => {
    const router = setup('/');
    await screen.findByRole('tablist', { name: 'Onderdelen per soort' });
    fireEvent.click(screen.getByRole('tab', { name: 'Acties' }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ vak: 'acties' });
    });
    expect(selectedTab()).toBe('Acties');
    expect(screen.getByRole('region', { name: 'Button' })).toBeTruthy();
  });
});

describe('designsystem-toolbox/AC-3: Toon opent het tabblad en focust het voorbeeld', () => {
  test('designsystem-toolbox/AC-3: Toon Combobox vanaf Basis opent Formulieren als nieuwe stap, q blijft, sectie heeft focus', async () => {
    const router = setup('/');
    await screen.findByRole('tablist', { name: 'Onderdelen per soort' });
    fireEvent.change(screen.getByLabelText('Component zoeken'), { target: { value: 'Combobox' } });
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ q: 'Combobox' });
    });
    expect(selectedTab()).toBe('Basis');
    const historyBefore = router.history.length;

    const show = screen.getByRole('button', { name: 'Toon Combobox' });
    const targetId = show.getAttribute('aria-controls');
    expect(targetId).toBeTruthy();
    fireEvent.click(show);

    await waitFor(() => {
      expect(selectedTab()).toBe('Formulieren');
    });
    await waitFor(() => {
      expect(document.activeElement?.id).toBe(targetId);
    });
    const focused = document.getElementById(targetId ?? '');
    expect(focused === null ? null : within(focused).getByRole('heading', { level: 2, name: 'Combobox' })).toBeTruthy();
    expect(router.state.location.search).toMatchObject({ q: 'Combobox', vak: 'formulieren' });
    expect(router.state.location.href).toContain('q=');
    expect(router.history.length).toBe(historyBefore + 1);

    // Terug in de browser herstelt het vorige tabblad (spec: Focus en toetsenbord).
    router.history.back();
    await waitFor(() => {
      expect(selectedTab()).toBe('Basis');
    });
  });

  test('designsystem-toolbox/AC-3: Toon TokenSwatch zonder vak in de URL zet vak=basis als nieuwe stap en focust', async () => {
    const router = setup('/?q=TokenSwatch');
    await screen.findByRole('tablist', { name: 'Onderdelen per soort' });
    expect(selectedTab()).toBe('Basis');
    const historyBefore = router.history.length;

    const show = screen.getByRole('button', { name: 'Toon TokenSwatch' });
    const targetId = show.getAttribute('aria-controls');
    fireEvent.click(show);

    await waitFor(() => {
      expect(document.activeElement?.id).toBe(targetId);
    });
    expect(router.state.location.search).toMatchObject({ q: 'TokenSwatch', vak: 'basis' });
    expect(router.history.length).toBe(historyBefore + 1);
  });
});

describe('designsystem-toolbox/AC-4: de lijst volgt de zoekopdracht', () => {
  test('designsystem-toolbox/AC-4: met ?q=tabs bij openen is de lijst open', async () => {
    setup('/?q=tabs');
    await screen.findByRole('region', { name: 'Componentenindex' });
    expect(listToggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Toon Tabs' })).toBeTruthy();
  });

  test('designsystem-toolbox/AC-4: zonder q dicht, tijdens typen open', async () => {
    setup('/');
    await screen.findByRole('region', { name: 'Componentenindex' });
    expect(listToggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Toon Tabs' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Component zoeken'), { target: { value: 'tabs' } });
    await waitFor(() => {
      expect(listToggle().getAttribute('aria-expanded')).toBe('true');
    });
  });
});

// Steekproef uit elk tabblad: sectietitel en gebruikszin letterlijk uit de tabel in de spec.
const USAGE: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
  ['basis', [['Tokens', 'De basis van het uiterlijk: alle andere onderdelen gebruiken deze waarden.']]],
  [
    'acties',
    [
      ['Button', 'Voor een actie. Eén primary per scherm; destructive alleen voor iets wat niet terug kan.'],
      ['CopyButton', 'Een waarde zoals een adres of code met één klik kopiëren.'],
      ['ConfirmDialog', 'Een onomkeerbare actie laten bevestigen; de focus staat op Annuleren.'],
    ],
  ],
  [
    'formulieren',
    [
      ['Form, Field en Input', 'Elk formulier gaat via Form; Field geeft label, uitleg en foutmelding.'],
      ['Combobox', 'Eén keuze uit een lange lijst, met zoeken.'],
      ['PasswordInput en DateInput', 'Een wachtwoord dat je kunt tonen, en een datum.'],
    ],
  ],
  [
    'meldingen',
    [
      ['Notice', 'Een melding die op de pagina blijft staan, in vier tonen.'],
      ['StatusBadge', 'De status van een item in een lijst of tabel.'],
      ['RouteError en NotFound', 'Foutschermen: iets ging mis, geen toegang, niet gevonden.'],
    ],
  ],
  [
    'gegevens',
    [
      ['DataTable', 'Een tabel met zoeken, filteren, sorteren, selecteren en meer laden.'],
      ['DescriptionList', 'Kenmerken van één item: term en waarde.'],
      ['QrCode', 'Een QR-code, bijvoorbeeld om een authenticator-app te koppelen.'],
    ],
  ],
  [
    'layout',
    [
      ['PageHeader', 'De kop van elke pagina, met titel en hoofdactie.'],
      ['Breadcrumbs', 'Laat zien waar een pagina in de structuur zit.'],
      ['Text, Heading, Stack en Inline', 'Tekst, koppen en afstand; gebruik deze in plaats van eigen klassen.'],
    ],
  ],
  [
    'patronen',
    [
      ['Selectie en bulkacties', 'Meerdere rijen kiezen en in één keer verwerken.'],
      ['Verversen met behoud van inhoud', 'Gegevens verversen terwijl de oude inhoud zichtbaar blijft.'],
    ],
  ],
];

describe('designsystem-toolbox/AC-5: gebruikszin per sectie', () => {
  test.each(USAGE)(
    'designsystem-toolbox/AC-5: secties in ?vak=%s tonen hun gebruikszin onder de titel',
    async (vak, sections) => {
      setup(`/?vak=${vak}`);
      await screen.findByRole('tablist', { name: 'Onderdelen per soort' });
      for (const [title, sentence] of sections) {
        const region = screen.getByRole('region', { name: title });
        const heading = within(region).getAllByRole('heading', { level: 2, name: title })[0];
        const usage = within(region).getByText(sentence);
        expect(heading).toBeTruthy();
        if (heading !== undefined) expect(precedes(heading, usage)).toBe(true);
      }
    },
  );
});

// designsystem-toolbox/AC-7: de dekking blijft zonder uitzonderingen; elk component uit de bronindex heeft een vindplaats
// in een tabblad, en die sectie staat in de pagina (ook als haar tabblad dicht is). check:catalogus bewijst de bron.
test('designsystem-toolbox/AC-7: elk component uit de bronindex heeft een voorbeeld in een tabblad', async () => {
  setup('/');
  await screen.findByRole('tablist', { name: 'Onderdelen per soort' });
  const missing = components.filter((item) => {
    const target = exampleTarget(item.naam);
    return target === undefined || document.getElementById(target.id) === null;
  });
  expect(missing.map((item) => item.naam)).toStrictEqual([]);
});
