import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { errorTexts } from '#web/copy/errors.ts';
import { createAppRouter } from '#web/lib/router.ts';

// Spec eigen-account: /account en het profielmenu met de bestandsroutes van de app; de API is hier nagebootst (de echte
// flows staan in e2e/eigen-account.spec.ts).
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

function show(path: string, me: { naam: string } | null) {
  const calls: Call[] = [];
  let naam = me?.naam ?? '';
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (me === null) return Promise.resolve(new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 }));
    // De sectie Sessies (deel 2) leest de eigen sessies; deze tests gaan over naam en wachtwoord.
    if (url.startsWith('/api/me/sessions')) return Promise.resolve(new Response(JSON.stringify({ items: [] })));
    if (method === 'PATCH' && typeof body === 'object' && body !== null && 'naam' in body) {
      naam = String(body.naam);
      return Promise.resolve(new Response('null'));
    }
    return Promise.resolve(new Response(JSON.stringify({ id: 'u1', naam, email: 'anna@example.test', rol: 'user' })));
  });
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
  return { router, calls };
}

describe('/account (spec eigen-account)', () => {
  test('anoniem: naar /login met de terugweg', async () => {
    const { router } = show('/account', null);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toEqual({ redirect: '/account' });
  });

  test('AC-1: het profielmenu heeft "Mijn account" boven "Uitloggen" en opent /account', async () => {
    const { router } = show('/', { naam: 'Anna de Vries' });

    // Radix opent het menu op toetsenbord of pointer, niet op een losse click.
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Profielmenu' }), { key: 'Enter' });
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toStrictEqual(['Mijn account', 'Uitloggen']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mijn account' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Mijn account' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/account');
  });

  test('de secties staan in de volgorde van de spec; de naam is ingevuld', async () => {
    show('/account', { naam: 'Anna de Vries' });

    await screen.findByRole('heading', { level: 1, name: 'Mijn account' });
    // De secties verschijnen zodra `me` en de sessies binnen zijn (alleen timing: de lijst met sessies is erbij gekomen).
    await screen.findByRole('textbox', { name: 'Naam' });
    const sections = within(screen.getByRole('main')).getAllByRole('heading', { level: 2 });
    expect(sections.map((heading) => heading.textContent).slice(0, 2)).toStrictEqual(['Naam', 'Wachtwoord']);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Naam' }).value).toBe('Anna de Vries');
  });

  test('AC-2: naam opslaan: PATCH /api/me, melding en nieuwe initialen in het profielmenu', async () => {
    const { calls } = show('/account', { naam: 'Anna de Vries' });

    fireEvent.change(await screen.findByRole('textbox', { name: 'Naam' }), { target: { value: 'Nieuwe Naam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Naam opslaan' }));

    expect((await screen.findByRole('status')).textContent).toBe('Je naam is opgeslagen.');
    expect(calls).toContainEqual({ method: 'PATCH', url: '/api/me', body: { naam: 'Nieuwe Naam' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Profielmenu' }).textContent).toBe('NN');
    });
  });

  test('wachtwoord: herhaling anders geeft de spectekst en geen request', async () => {
    const { calls } = show('/account', { naam: 'Anna de Vries' });

    fireEvent.change(await screen.findByLabelText('Huidig wachtwoord'), { target: { value: 'oud-wachtwoord' } });
    fireEvent.change(screen.getByLabelText('Nieuw wachtwoord'), { target: { value: 'nieuw-wachtwoord-1' } });
    fireEvent.change(screen.getByLabelText('Nieuw wachtwoord herhalen'), { target: { value: 'nieuw-wachtwoord-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wachtwoord wijzigen' }));

    expect(await screen.findByText('De wachtwoorden zijn niet gelijk.')).toBeTruthy();
    expect(calls.some((call) => call.url.includes('change-password'))).toBe(false);
  });
});
