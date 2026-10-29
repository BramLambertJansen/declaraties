import { expect, test } from 'vitest';
import { AppError } from '../errors.ts';
import { createApp } from '../http/create-app.ts';
import { request } from '../http/request.test-helper.ts';
import { defineRoute, errors, fakeDeps, notesContract, type FakeUser } from '../route/fixture.test-helper.ts';
import type { RequestLogEntry } from './request-log.ts';

// Eén regel per request (framework §6, roadmap stuk 7): requestId, gebruiker-ID, duur en databasetijd; geen body, query of PII.
const notes = defineRoute(notesContract, ({ input, actor }) => {
  if (input.id === 'kapot') throw new AppError('NOTE_LOCKED');
  if (input.id === 'bug') throw new Error('onverwacht');
  return { id: input.id, by: actor.name };
});
const user: FakeUser = { role: 'user', sessionStrength: 'password' };

function loggedApp(actor: FakeUser | null) {
  const lines: RequestLogEntry[] = [];
  const deps = fakeDeps(actor);
  const app = createApp({
    appOrigin: 'http://localhost:5173',
    auth: deps.auth,
    withUser: deps.withUser,
    routes: [notes],
    errors,
    log: (entry) => lines.push(entry),
  });
  return { app, lines };
}

test('ingelogde route: één regel met routepatroon, gebruiker, status, duur en databasetijd', async () => {
  const { app, lines } = loggedApp(user);
  const response = await request(app, '/api/notes/geheim-id?q=jan@voorbeeld.nl');

  expect(response.status).toBe(200);
  expect(lines).toHaveLength(1);
  const [line] = lines;
  if (line === undefined) throw new Error('geen logregel');
  const { time, durationMs, dbMs, ...rest } = line;
  expect(rest).toStrictEqual({
    requestId: response.headers.get('x-request-id'),
    method: 'GET',
    route: '/api/notes/:id',
    status: 200,
    userId: 'u1',
  });
  expect(Number.isNaN(Date.parse(time))).toBe(false);
  expect(durationMs).toBeGreaterThanOrEqual(0);
  expect(dbMs).toBeGreaterThanOrEqual(0);
});

test('geen waarden uit pad, query, body of sessie in de regel', async () => {
  const { app, lines } = loggedApp(user);
  await request(app, '/api/notes/geheim-id?q=jan@voorbeeld.nl');

  const text = JSON.stringify(lines);
  for (const leak of ['geheim-id', 'jan@voorbeeld.nl', 't@test.local', 'Test', 'session_token']) {
    expect(text).not.toContain(leak);
  }
});

test('publieke route zonder database: userId en dbMs null', async () => {
  const { app, lines } = loggedApp(null);
  await request(app, '/api/health');

  expect(lines).toStrictEqual([
    expect.objectContaining({ route: '/api/health', status: 200, userId: null, dbMs: null }),
  ]);
});

const cases: readonly {
  readonly name: string;
  readonly actor: FakeUser | null;
  readonly path: string;
  readonly init?: RequestInit;
  readonly status: number;
  readonly userId: string | null;
}[] = [
  { name: 'niet ingelogd', actor: null, path: '/api/notes/n1', status: 401, userId: null },
  { name: 'foutcode uit de handler', actor: user, path: '/api/notes/kapot', status: 409, userId: 'u1' },
  { name: 'onverwachte fout', actor: user, path: '/api/notes/bug', status: 500, userId: 'u1' },
  { name: 'onbekende route', actor: user, path: '/api/onbekend', status: 404, userId: null },
  {
    name: 'CSRF geweigerd',
    actor: user,
    path: '/api/notes/n1',
    init: { method: 'POST', headers: { origin: 'https://evil.test' } },
    status: 403,
    userId: null,
  },
];

test.each(cases)(
  '$name: ook één regel, met de status van het antwoord',
  async ({ actor, path, init, status, userId }) => {
    const { app, lines } = loggedApp(actor);
    const response = await request(app, path, init);

    expect(response.status).toBe(status);
    expect(lines.map((line) => ({ status: line.status, userId: line.userId }))).toStrictEqual([{ status, userId }]);
  },
);

test('zonder log schrijft createApp niets en werkt de route gewoon', async () => {
  const deps = fakeDeps(user);
  const app = createApp({ auth: deps.auth, withUser: deps.withUser, routes: [notes], errors });

  expect((await request(app, '/api/notes/n1')).status).toBe(200);
});
