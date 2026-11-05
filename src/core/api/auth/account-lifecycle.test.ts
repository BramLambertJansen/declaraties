import { APIError } from 'better-auth/api';
import { deleteSessionCookie } from 'better-auth/cookies';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { createAccountLifecycle } from './account-lifecycle.ts';
import { dropRejectedSession } from './session-guard.ts';

vi.mock('better-auth/cookies', async (original) => ({
  ...(await original<typeof import('better-auth/cookies')>()),
  deleteSessionCookie: vi.fn(),
}));

const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const USER_ID = 'lifecycle-unit-user';

function setupLifecycle(
  user: object | null = { id: USER_ID, sessionVersion: 2 },
  requiresMfa: (userId: string) => Promise<boolean> = () => Promise.resolve(false),
) {
  const query = vi.fn(() => Promise.resolve({ rowCount: 1 }));
  const database = unsafeCast<Pool>({ query }, 'Unit-testpool voert alleen de loginregistratiequery uit');
  const lifecycle = createAccountLifecycle(database, requiresMfa);
  const deleteSession = vi.fn(() => Promise.resolve());
  const setNewSession = vi.fn();
  const context = {
    path: '/sign-in/email',
    context: {
      internalAdapter: { findUserById: vi.fn(() => Promise.resolve(user)), deleteSession },
      newSession: { user: user ?? { id: USER_ID }, session: { token: 'lifecycle-unit-token' } },
      setNewSession,
    },
  };
  const endpoint = unsafeCast<Parameters<typeof lifecycle.afterEndpoint>[0]>(
    context,
    'Unit-testcontext bevat uitsluitend de endpointvelden die account-lifecycle leest',
  );
  return { lifecycle, query, context, endpoint, deleteSession, setNewSession };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sessieaanmaak met een vastgelegde accountgeneratie', () => {
  test('neemt de serverversie over en weigert een generatieverandering binnen dezelfde request', async () => {
    const user = { id: USER_ID, sessionVersion: 2 };
    const setup = setupLifecycle(user);
    const input = { userId: USER_ID };

    await expect(setup.lifecycle.beforeSession(input, setup.context)).resolves.toStrictEqual({
      data: { userId: USER_ID, sessionVersion: 2 },
    });
    user.sessionVersion = 3;

    await expect(setup.lifecycle.beforeSession(input, setup.context)).rejects.toMatchObject({
      body: { code: 'UNAUTHENTICATED' },
    });
  });

  test('een sessievervanging mag een oude sessiegeneratie niet opwaarderen', async () => {
    const setup = setupLifecycle({ id: USER_ID, sessionVersion: 3 });
    const context = {
      context: { ...setup.context.context, session: { session: { sessionVersion: 2 } } },
    };

    await expect(setup.lifecycle.beforeSession({ userId: USER_ID }, context)).rejects.toMatchObject({
      body: { code: 'UNAUTHENTICATED' },
    });
  });

  test('een snapshot voor een andere gebruiker kan niet worden hergebruikt', async () => {
    const setup = setupLifecycle();
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);

    await expect(setup.lifecycle.beforeSession({ userId: 'andere-gebruiker' }, setup.context)).rejects.toMatchObject({
      body: { code: 'UNAUTHENTICATED' },
    });
  });

  test.each([
    [{ id: USER_ID, sessionVersion: 2, blockedAt: new Date(NOW) }, 'ACCOUNT_BLOCKED'],
    [{ id: USER_ID, sessionVersion: 2, deactivatedAt: new Date(NOW) }, 'ACCOUNT_DEACTIVATED'],
    [{ id: USER_ID, sessionVersion: -1 }, 'UNAUTHENTICATED'],
    [null, 'UNAUTHENTICATED'],
  ] as const)('een onbeschikbaar account %j geeft een gecontroleerde fout %s', async (user, code) => {
    const setup = setupLifecycle(user);
    const result = await setup.lifecycle
      .beforeSession({ userId: USER_ID }, setup.context)
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(APIError);
    expect(result).toMatchObject({ body: { code } });
  });

  test('scriptcontexten blijven ondersteund en bestaande users beginnen op generatie nul', async () => {
    const setup = setupLifecycle({ id: USER_ID });

    await expect(setup.lifecycle.beforeSession({ userId: USER_ID }, null)).resolves.toBeUndefined();
    await expect(setup.lifecycle.beforeSession({ userId: USER_ID }, undefined)).resolves.toBeUndefined();
    await expect(setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context)).resolves.toBeUndefined();
  });
});

describe('laatste login registreren en falende registratie opruimen', () => {
  test('schrijft het vastgelegde account en de generatie met de serverdatum', async () => {
    const setup = setupLifecycle();
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);

    await setup.lifecycle.afterEndpoint(setup.endpoint, NOW);

    expect(setup.query).toHaveBeenCalledExactlyOnceWith(expect.any(String), [USER_ID, 2, new Date(NOW).toISOString()]);
    expect(setup.deleteSession).not.toHaveBeenCalled();
    expect(setup.setNewSession).not.toHaveBeenCalled();
  });

  test('een nieuwe login zonder snapshot wordt geweigerd en opgeruimd', async () => {
    const setup = setupLifecycle();

    await expect(setup.lifecycle.afterEndpoint(setup.endpoint, NOW)).rejects.toMatchObject({
      body: { code: 'UNAUTHENTICATED' },
    });

    expect(setup.query).not.toHaveBeenCalled();
    expect(deleteSessionCookie).toHaveBeenCalledExactlyOnceWith(setup.endpoint);
    expect(setup.setNewSession).toHaveBeenCalledExactlyOnceWith(null);
    expect(setup.deleteSession).toHaveBeenCalledExactlyOnceWith('lifecycle-unit-token');
  });

  test('de MFA-eis uit de rollen voorkomt registratie tot de verificatiestap', async () => {
    const requiresMfa = vi.fn(() => Promise.resolve(true));
    const setup = setupLifecycle({ id: USER_ID, sessionVersion: 2 }, requiresMfa);
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);

    await setup.lifecycle.afterEndpoint(setup.endpoint, NOW);

    expect(requiresMfa).toHaveBeenCalledExactlyOnceWith(USER_ID);
    expect(setup.query).not.toHaveBeenCalled();
    setup.context.path = '/two-factor/verify-totp';
    await setup.lifecycle.afterEndpoint(setup.endpoint, NOW);
    expect(setup.query).toHaveBeenCalledOnce();
  });

  test('een gebruiker met TOTP krijgt na het wachtwoord nog geen loginregistratie', async () => {
    const setup = setupLifecycle({ id: USER_ID, sessionVersion: 2, twoFactorEnabled: true });
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);

    await setup.lifecycle.afterEndpoint(setup.endpoint, NOW);

    expect(setup.query).not.toHaveBeenCalled();
  });

  test('een fout bij het bepalen van de MFA-eis maakt de nieuwe login onbruikbaar', async () => {
    const failure = new Error('Rollen opvragen mislukt');
    const setup = setupLifecycle({ id: USER_ID, sessionVersion: 2 }, () => Promise.reject(failure));
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);

    await expect(setup.lifecycle.afterEndpoint(setup.endpoint, NOW)).rejects.toBe(failure);

    expect(setup.query).not.toHaveBeenCalled();
    expect(deleteSessionCookie).toHaveBeenCalledExactlyOnceWith(setup.endpoint);
    expect(setup.setNewSession).toHaveBeenCalledExactlyOnceWith(null);
    expect(setup.deleteSession).toHaveBeenCalledExactlyOnceWith('lifecycle-unit-token');
  });

  test('een ingetrokken snapshot maakt cookie en nieuwe sessie onbruikbaar', async () => {
    const setup = setupLifecycle();
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);
    setup.query.mockResolvedValueOnce({ rowCount: 0 });

    await expect(setup.lifecycle.afterEndpoint(setup.endpoint, NOW)).rejects.toMatchObject({
      body: { code: 'UNAUTHENTICATED' },
    });
    expect(deleteSessionCookie).toHaveBeenCalledExactlyOnceWith(setup.endpoint);
    expect(setup.setNewSession).toHaveBeenCalledExactlyOnceWith(null);
    expect(setup.deleteSession).toHaveBeenCalledExactlyOnceWith('lifecycle-unit-token');
  });

  test('ook bij een mislukte fysieke opruiming blijft de oorspronkelijke registratiefout gelden', async () => {
    const setup = setupLifecycle();
    const failure = new Error('Loginregistratie mislukt');
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);
    setup.query.mockRejectedValueOnce(failure);
    setup.deleteSession.mockRejectedValueOnce(new Error('Sessieverwijdering mislukt'));

    await expect(setup.lifecycle.afterEndpoint(setup.endpoint, NOW)).rejects.toBe(failure);
    expect(deleteSessionCookie).toHaveBeenCalledExactlyOnceWith(setup.endpoint);
    expect(setup.setNewSession).toHaveBeenCalledExactlyOnceWith(null);
  });

  test('een gewone sessie-opvraging registreert geen login', async () => {
    const setup = setupLifecycle();
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);
    setup.context.path = '/get-session';

    await setup.lifecycle.afterEndpoint(setup.endpoint, NOW);

    expect(setup.query).not.toHaveBeenCalled();
  });
});

describe('MFA-challenge binden aan de oorspronkelijke accountgeneratie', () => {
  test('slaat de snapshot apart op met dezelfde vervaldatum als de uitdaging', async () => {
    const setup = setupLifecycle();
    const expiresAt = new Date(NOW + 60_000);
    const write = vi.fn(() => Promise.resolve());
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);

    await setup.lifecycle.bindChallenge(
      { identifier: '2fa-challenge', value: USER_ID, expiresAt },
      setup.context.context,
      write,
    );

    expect(write).toHaveBeenCalledExactlyOnceWith({
      identifier: 'lifecycle:2fa-challenge',
      value: JSON.stringify({ userId: USER_ID, sessionVersion: 2 }),
      expiresAt,
    });
  });

  test.each(['2fa-attempts-challenge', 'password-reset-challenge'])(
    'verificatierecord %s krijgt geen login-snapshot',
    async (identifier) => {
      const setup = setupLifecycle();
      const write = vi.fn(() => Promise.resolve());
      await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);

      await setup.lifecycle.bindChallenge(
        { identifier, value: USER_ID, expiresAt: new Date(NOW) },
        setup.context.context,
        write,
      );

      expect(write).not.toHaveBeenCalled();
    },
  );

  test('een andere request of een andere gebruiker erft de snapshot niet', async () => {
    const setup = setupLifecycle();
    const write = vi.fn(() => Promise.resolve());
    await setup.lifecycle.beforeSession({ userId: USER_ID }, setup.context);

    await setup.lifecycle.bindChallenge(
      { identifier: '2fa-challenge', value: USER_ID, expiresAt: new Date(NOW) },
      {},
      write,
    );
    await setup.lifecycle.bindChallenge(
      { identifier: '2fa-challenge', value: 'andere-gebruiker', expiresAt: new Date(NOW) },
      setup.context.context,
      write,
    );

    expect(write).not.toHaveBeenCalled();
  });
});

function setupSessionGuard(user: object) {
  const deleteUserSessions = vi.fn(() => Promise.reject(new Error('Opruimen mislukt')));
  const deleteSession = vi.fn(() => Promise.reject(new Error('Opruimen mislukt')));
  const warn = vi.fn();
  const context = {
    path: '/get-session',
    context: {
      session: { user, session: { token: 'oude-sessie', createdAt: new Date(NOW), sessionVersion: 2 } },
      internalAdapter: { deleteUserSessions, deleteSession },
      logger: { warn },
    },
  };
  const endpoint = unsafeCast<Parameters<typeof dropRejectedSession>[0]>(
    context,
    'Unit-testcontext bevat de bestaande sessie en opruimfuncties van de auth-guard',
  );
  return { context, endpoint, deleteUserSessions, deleteSession, warn };
}

describe('sessieweigering blijft gelden als fysieke opruiming mislukt', () => {
  test.each(['blockedAt', 'deactivatedAt'])('een maatregel %s weigert de sessie bij een opruimfout', async (field) => {
    const setup = setupSessionGuard({ id: USER_ID, sessionVersion: 2, [field]: new Date(NOW) });

    await expect(dropRejectedSession(setup.endpoint, NOW)).resolves.toBe(true);

    expect(setup.context.context.session).toBeNull();
    expect(deleteSessionCookie).toHaveBeenCalledExactlyOnceWith(setup.endpoint);
    expect(setup.deleteUserSessions).toHaveBeenCalledExactlyOnceWith(USER_ID);
    expect(setup.deleteSession).not.toHaveBeenCalled();
    expect(setup.warn).toHaveBeenCalledOnce();
  });

  test('een ingetrokken generatie verwijdert alleen de oude sessie en blijft geweigerd bij fouten', async () => {
    const setup = setupSessionGuard({ id: USER_ID, sessionVersion: 3 });

    await expect(dropRejectedSession(setup.endpoint, NOW)).resolves.toBe(true);

    expect(setup.context.context.session).toBeNull();
    expect(setup.deleteSession).toHaveBeenCalledExactlyOnceWith('oude-sessie');
    expect(setup.deleteUserSessions).not.toHaveBeenCalled();
    expect(setup.warn).toHaveBeenCalledOnce();
  });

  test('een geldige sessie blijft intact zonder cookie of database te wijzigen', async () => {
    const setup = setupSessionGuard({ id: USER_ID, sessionVersion: 2 });

    await expect(dropRejectedSession(setup.endpoint, NOW)).resolves.toBe(false);

    expect(setup.context.context.session).not.toBeNull();
    expect(deleteSessionCookie).not.toHaveBeenCalled();
    expect(setup.deleteSession).not.toHaveBeenCalled();
    expect(setup.deleteUserSessions).not.toHaveBeenCalled();
  });
});
