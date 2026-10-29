import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';

// Eén regel per request (framework §6). Alleen deze velden: geen body, geen query, geen headers, geen PII.
export interface RequestLogEntry {
  readonly time: string;
  readonly requestId: string;
  readonly method: string;
  // Het routepatroon (`/api/notes/:id`), nooit het echte pad: daarin kunnen waarden staan.
  readonly route: string;
  readonly status: number;
  readonly durationMs: number;
  // Tijd binnen withUser (verbinding pakken t/m commit); null als de request de database niet raakte.
  readonly dbMs: number | null;
  readonly userId: string | null;
}

export type RequestLog = (entry: RequestLogEntry) => void;

// Standaardschrijver voor de Node-ingang: JSON op stdout, die elke containerhost oppikt.
export const writeJsonLine: RequestLog = (entry) => {
  console.log(JSON.stringify(entry));
};

// Wat routeHandler tijdens de request aanvult; de middleware leest het na afloop.
export interface RequestFacts {
  userId: string | null;
  dbMs: number | null;
}

declare module 'hono' {
  interface ContextVariableMap {
    // undefined zonder request-log (createApp zonder log).
    requestFacts: RequestFacts | undefined;
  }
}

const elapsed = (started: number) => Math.round(performance.now() - started);

// Meet de tijd van één databasewerk en telt hem op bij de request (ook als het werk faalt).
export async function timeDatabase<T>(facts: RequestFacts | undefined, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    if (facts !== undefined) facts.dbMs = (facts.dbMs ?? 0) + elapsed(started);
  }
}

// Direct na requestId: de regel komt er ook voor requests die CSRF, bodyLimit of onError afwijzen.
export function requestLog(log: RequestLog): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    const facts: RequestFacts = { userId: null, dbMs: null };
    c.set('requestFacts', facts);
    await next();
    log({
      time: new Date().toISOString(),
      requestId: c.get('requestId'),
      method: c.req.method,
      route: routePath(c, -1),
      status: c.res.status,
      durationMs: elapsed(started),
      dbMs: facts.dbMs,
      userId: facts.userId,
    });
  };
}
