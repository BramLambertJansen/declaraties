import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { logUnexpectedError } from './safe-error-log.ts';

// Foutlogging mag nooit persoonsgegevens bevatten: alleen requestId, route, errorClass, code en label.
const EMAIL = 'alice@example.com';

function pgError(): Error {
  return Object.assign(new Error(`duplicate key value (${EMAIL}) SELECT * FROM users WHERE email = $1`), {
    code: '23505',
    detail: `Key (email)=(${EMAIL}) already exists.`,
    query: 'insert into users (email) values ($1)',
    parameters: [EMAIL],
    where: `PL/pgSQL ${EMAIL}`,
    cause: new Error(EMAIL),
  });
}

describe('logUnexpectedError', () => {
  const spy = vi.spyOn(console, 'error');
  beforeEach(() => {
    spy.mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockReset();
  });

  test('logt precies één keer, met een string en een plain object met alleen toegestane velden', () => {
    logUnexpectedError({ requestId: 'req-1', route: '/api/notes/:id', label: 'route' }, pgError());

    expect(spy).toHaveBeenCalledOnce();
    const call: readonly unknown[] = spy.mock.calls[0] ?? [];
    const [first, second, ...rest] = call;
    expect(typeof first).toBe('string');
    expect(rest).toEqual([]);
    expect(second).toEqual({
      requestId: 'req-1',
      route: '/api/notes/:id',
      errorClass: 'Error',
      code: '23505',
      label: 'route',
    });
  });

  test('een AppError-achtige of SQLSTATE-code blijft, een vrije tekstcode niet', () => {
    logUnexpectedError({ requestId: 'r' }, Object.assign(new Error('x'), { code: 'ECONNRESET' }));
    logUnexpectedError({ requestId: 'r' }, Object.assign(new Error('x'), { code: 'tekst met spaties alice' }));

    expect(JSON.stringify(spy.mock.calls)).not.toContain('ECONNRESET');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('spaties');
    expect(spy.mock.calls[0]?.[1]).not.toHaveProperty('code');
  });

  test('de constructor-naam komt als errorClass in de log', () => {
    class VerbindingFout extends Error {}
    logUnexpectedError({ requestId: 'r' }, new VerbindingFout('x'));

    expect(spy.mock.calls[0]?.[1]).toMatchObject({ errorClass: 'VerbindingFout' });
  });

  test('geen e-mailadres, SQL, stack, detail of cause in enig argument', () => {
    logUnexpectedError({ requestId: 'req-2', route: '/api/users' }, pgError());

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain('req-2');
    for (const lek of [
      EMAIL,
      'alice',
      'SELECT',
      'insert into',
      'duplicate key',
      'detail',
      'already exists',
      'stack',
      'at ',
    ]) {
      expect(logged).not.toContain(lek);
    }
    for (const veld of ['message', 'query', 'parameters', 'where', 'cause']) {
      expect(logged).not.toContain(`"${veld}"`);
    }
  });

  test('niet-Error waarden crashen niet en lekken niets', () => {
    for (const waarde of [`fout voor ${EMAIL}`, { message: EMAIL, detail: EMAIL }, null, undefined, 42]) {
      spy.mockClear();
      expect(() => {
        logUnexpectedError({ requestId: 'r' }, waarde);
      }).not.toThrow();
      expect(spy).toHaveBeenCalledOnce();
      expect(JSON.stringify(spy.mock.calls)).not.toContain('alice');
      expect(spy.mock.calls[0]?.[1]).toMatchObject({ errorClass: 'NonError' });
    }
  });

  test('een kapotte fout (gooiende getter of Proxy) laat de functie niet gooien', () => {
    const getter = new Error('x');
    Object.defineProperty(getter, 'code', {
      get() {
        throw new Error(EMAIL);
      },
    });
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error(EMAIL);
        },
        getPrototypeOf() {
          throw new Error(EMAIL);
        },
        has() {
          throw new Error(EMAIL);
        },
      },
    );

    expect(() => {
      logUnexpectedError({ requestId: 'r' }, getter);
      logUnexpectedError({ requestId: 'r' }, proxy);
    }).not.toThrow();
    expect(JSON.stringify(spy.mock.calls)).not.toContain('alice');
  });

  test('een gooiende console.error breekt het request ook niet', () => {
    spy.mockImplementation(() => {
      throw new Error('stderr dicht');
    });

    expect(() => {
      logUnexpectedError({ requestId: 'r' }, new Error('x'));
    }).not.toThrow();
  });
});
