import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { errorTexts } from '#web/copy/errors.ts';
import { createAppRouter } from '#web/lib/router.ts';

// Spec eigen-account, deel 2: de secties Sessies en E-mailadres op /account en de pagina /email-bevestigen, met letterlijke
// teksten uit de spec. De API is hier nagebootst (de echte flows staan in e2e/eigen-account-deel2.spec.ts). jsdom kent
// showModal niet; de stub opent alleen.
const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  // jsdom kent ook close niet; Dialog roept het aan zodra `open` weer false wordt (bevestigen of annuleren).
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  if (original === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  else Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

interface Session {
  readonly id: string;
  readonly apparaat: string;
  readonly aangemaakt: string;
  readonly laatstActief: string;
  readonly huidig: boolean;
}

const HERE: Session = {
  id: 's1',
  apparaat: 'Chrome op Windows',
  aangemaakt: '2026-10-11T08:00:00Z',
  laatstActief: '2026-10-11T09:00:00Z',
  huidig: true,
};
const PHONE: Session = { ...HERE, id: 's2', apparaat: 'Safari op iOS', huidig: false };
const LAPTOP: Session = { ...HERE, id: 's3', apparaat: 'Firefox op Linux', huidig: false };

interface Options {
  readonly path?: string;
  readonly me?: { naam: string; email: string } | null;
  readonly sessions?: readonly Session[];
  // Antwoord op POST /api/auth/change-email en /api/me/email/bevestigen; standaard gelukt.
  readonly changeEmail?: { status: number; body: unknown };
  readonly confirm?: { status: number; body: unknown };
}

function reply(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function show({
  path = '/account',
  me = { naam: 'Anna de Vries', email: 'anna@example.test' },
  ...options
}: Options = {}) {
  const calls: Call[] = [];
  let sessions = options.sessions ?? [HERE, PHONE];
  vi.stubGlobal('fetch', (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const method = init.method ?? 'GET';
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (me === null) return reply(401, { code: 'UNAUTHENTICATED' });
    if (url.endsWith('/api/auth/change-email'))
      return reply(options.changeEmail?.status ?? 200, options.changeEmail?.body ?? { status: true });
    if (url === '/api/me/email/bevestigen')
      return reply(options.confirm?.status ?? 200, options.confirm?.body ?? { stap: 'oud' });
    if (url === '/api/me/sessions/revoke-others') {
      sessions = sessions.filter((session) => session.huidig);
      return reply(200, null);
    }
    if (method === 'DELETE' && url.startsWith('/api/me/sessions/')) {
      sessions = sessions.filter((session) => session.id !== url.slice('/api/me/sessions/'.length));
      return reply(200, null);
    }
    if (url.startsWith('/api/me/sessions')) return reply(200, { items: sessions });
    return reply(200, { id: 'u1', naam: me.naam, email: me.email, rol: 'user' });
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

async function sessionsTable() {
  return screen.findByRole('region', { name: 'Sessies' });
}

describe('/account: sectie Sessies', () => {
  test('de vier secties staan in de volgorde van de spec', async () => {
    show();

    await screen.findByRole('heading', { level: 1, name: 'Mijn account' });
    await sessionsTable();
    const headings = within(screen.getByRole('main')).getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toStrictEqual([
      'Naam',
      'Wachtwoord',
      'Sessies',
      'E-mailadres',
    ]);
  });

  test('kolommen, verborgen kolom "Acties", apparaten en het label "Dit apparaat"', async () => {
    show();

    const table = within(await sessionsTable());
    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toStrictEqual([
      'Apparaat',
      'Ingelogd op',
      'Laatst actief',
      'Acties',
    ]);
    const [, hereRow, phoneRow] = table.getAllByRole('row');
    expect(within(hereRow ?? document.body).getByText('Chrome op Windows')).toBeTruthy();
    expect(within(hereRow ?? document.body).getByText('Dit apparaat')).toBeTruthy();
    expect(within(phoneRow ?? document.body).getByText('Safari op iOS')).toBeTruthy();
  });

  test('AC-6: de eigen sessie heeft geen knop "Beëindigen"; een andere wel', async () => {
    show();

    const table = within(await sessionsTable());
    const [, hereRow, phoneRow] = table.getAllByRole('row');
    expect(within(hereRow ?? document.body).queryByRole('button', { name: /Beëindigen/ })).toBeNull();
    expect(within(phoneRow ?? document.body).getByRole('button', { name: /Beëindigen/ })).toBeTruthy();
  });

  test('AC-6: Beëindigen opent de dialoog met het apparaat; de focus staat op Annuleren; Annuleren stuurt niets', async () => {
    const { calls } = show();
    const table = within(await sessionsTable());
    fireEvent.click(table.getByRole('button', { name: /Beëindigen/ }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Sessie beëindigen?' });
    expect(within(dialog).getByText('Het apparaat Safari op iOS wordt uitgelogd.')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Annuleren' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuleren' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  test('AC-6: bevestigen stuurt DELETE /api/me/sessions/s2, toont de melding en haalt de rij uit de lijst', async () => {
    const { calls } = show();
    fireEvent.click(within(await sessionsTable()).getByRole('button', { name: /Beëindigen/ }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Sessie beëindigen?' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Beëindigen' }));

    expect(await screen.findByText('De sessie is beëindigd.')).toBeTruthy();
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/me/sessions/s2', body: undefined });
    await waitFor(() => {
      expect(screen.queryByText('Safari op iOS')).toBeNull();
    });
    expect(screen.getByText('Dit apparaat')).toBeTruthy();
  });

  test('AC-7: "Alle andere sessies beëindigen": dialoog, POST revoke-others, alleen "Dit apparaat" blijft', async () => {
    const { calls } = show({ sessions: [HERE, PHONE, LAPTOP] });
    await sessionsTable();
    fireEvent.click(screen.getByRole('button', { name: 'Alle andere sessies beëindigen' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Alle andere sessies beëindigen?' });
    expect(within(dialog).getByText('Je blijft alleen op dit apparaat ingelogd.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beëindigen' }));

    expect(await screen.findByText('Je andere sessies zijn beëindigd.')).toBeTruthy();
    expect(calls).toContainEqual({ method: 'POST', url: '/api/me/sessions/revoke-others', body: {} });
    await waitFor(() => {
      expect(within(screen.getByRole('region', { name: 'Sessies' })).getAllByRole('row')).toHaveLength(2);
    });
    expect(screen.queryByText('Safari op iOS')).toBeNull();
    expect(screen.queryByText('Firefox op Linux')).toBeNull();
  });
});

describe('/account: sectie E-mailadres', () => {
  test('toont het huidige adres, het veld en de knop', async () => {
    show();

    expect(await screen.findByText('Huidig e-mailadres: anna@example.test')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Nieuw e-mailadres' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'E-mailadres wijzigen' })).toBeTruthy();
  });

  test('zelfde adres, ook met andere hoofdletters: "Dit is al je e-mailadres." en geen request', async () => {
    const { calls } = show();

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nieuw e-mailadres' }), {
      target: { value: 'ANNA@Example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'E-mailadres wijzigen' }));

    expect(await screen.findByText('Dit is al je e-mailadres.')).toBeTruthy();
    expect(calls.some((call) => call.url.includes('change-email'))).toBe(false);
  });

  test('geen geldig adres: veldfout en geen request', async () => {
    const { calls } = show();

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nieuw e-mailadres' }), {
      target: { value: 'geen-adres' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'E-mailadres wijzigen' }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Nieuw e-mailadres' }).getAttribute('aria-invalid')).toBe('true');
    });
    expect(calls.some((call) => call.url.includes('change-email'))).toBe(false);
  });

  test('AC-8: aanvragen: POST /api/auth/change-email met newEmail en de spectekst met het huidige adres', async () => {
    const { calls } = show();

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nieuw e-mailadres' }), {
      target: { value: 'nieuw@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'E-mailadres wijzigen' }));

    expect((await screen.findByRole('status')).textContent).toBe(
      'We hebben een bevestigingslink gestuurd naar anna@example.test. Daarna volgt een link naar het nieuwe adres.',
    );
    const request = calls.find((call) => call.url.endsWith('/api/auth/change-email'));
    expect(request?.method).toBe('POST');
    expect(request?.body).toMatchObject({ newEmail: 'nieuw@example.test' });
  });

  test('AC-10: SESSION_NOT_FRESH toont "Log opnieuw in om dit te wijzigen." als melding', async () => {
    show({ changeEmail: { status: 403, body: { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' } } });

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nieuw e-mailadres' }), {
      target: { value: 'nieuw@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'E-mailadres wijzigen' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Log opnieuw in om dit te wijzigen.');
    expect(screen.queryByText(/We hebben een bevestigingslink gestuurd/)).toBeNull();
  });
});

describe('/email-bevestigen', () => {
  test('anoniem: naar /login met de terugweg (inclusief het token)', async () => {
    const { router } = show({ path: '/email-bevestigen?token=abc', me: null });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toEqual({ redirect: '/email-bevestigen?token=abc' });
  });

  test('toont de titel en de knop "Bevestigen"; er gaat niets weg zolang je niet klikt (geen GET-bevestiging)', async () => {
    const { calls } = show({ path: '/email-bevestigen?token=abc' });

    expect(await screen.findByRole('heading', { level: 1, name: 'E-mailadres bevestigen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bevestigen' })).toBeTruthy();
    expect(calls.some((call) => call.url.includes('bevestigen'))).toBe(false);
  });

  test('stap 1: POST /api/me/email/bevestigen met het token en de tekst over de nieuwe link', async () => {
    const { calls } = show({ path: '/email-bevestigen?token=abc', confirm: { status: 200, body: { stap: 'oud' } } });

    fireEvent.click(await screen.findByRole('button', { name: 'Bevestigen' }));

    expect(
      await screen.findByText('Gelukt. Open nu de link die we naar je nieuwe e-mailadres hebben gestuurd.'),
    ).toBeTruthy();
    expect(calls).toContainEqual({ method: 'POST', url: '/api/me/email/bevestigen', body: { token: 'abc' } });
    expect(screen.queryByRole('link', { name: 'Naar Mijn account' })).toBeNull();
  });

  test('AC-8: stap 2: "Je e-mailadres is gewijzigd." met de link "Naar Mijn account"', async () => {
    show({ path: '/email-bevestigen?token=abc', confirm: { status: 200, body: { stap: 'nieuw' } } });

    fireEvent.click(await screen.findByRole('button', { name: 'Bevestigen' }));

    expect(await screen.findByText('Je e-mailadres is gewijzigd.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Naar Mijn account' }).getAttribute('href')).toBe('/account');
  });

  test('AC-11: EMAIL_LINK_INVALID: de spectekst als melding en de knop blijft bruikbaar', async () => {
    show({ path: '/email-bevestigen?token=abc', confirm: { status: 409, body: { code: 'EMAIL_LINK_INVALID' } } });

    fireEvent.click(await screen.findByRole('button', { name: 'Bevestigen' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Deze link is verlopen of al gebruikt. Vraag de wijziging opnieuw aan.',
    );
  });

  test('zonder token in de link: dezelfde foutmelding en geen request', async () => {
    const { calls } = show({ path: '/email-bevestigen' });

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Deze link is verlopen of al gebruikt. Vraag de wijziging opnieuw aan.',
    );
    expect(calls.some((call) => call.url.includes('bevestigen'))).toBe(false);
  });
});
