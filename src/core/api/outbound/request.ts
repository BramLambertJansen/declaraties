import type { z } from 'zod';
import { MAX_ID_LENGTH } from '../../shared/limits.ts';
import type { Target } from './config.ts';
import { OutboundUsageError } from './errors.ts';
import type { OutboundMethod, OutboundRequest } from './types.ts';
import { buildUrl } from './url.ts';

// Aanroepcontrole en het verzoek zelf (spec uitgaande-client, Aanroep). Een fout is een OutboundUsageError, zonder netwerk en
// zonder parameterwaarde, query of header in de melding.

export interface PreparedCall<E extends number> {
  readonly url: URL;
  readonly init: RequestInit;
  // Alleen GET, HEAD of met idempotencyKey mag een poging herhaald worden.
  readonly repeatable: boolean;
  readonly expect: readonly E[];
}

const METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const WITH_BODY: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);
// 1 t/m MAX_ID_LENGTH zichtbare ASCII-tekens.
const KEY = /^[\x21-\x7E]+$/;

const fail = (message: string): never => {
  throw new OutboundUsageError(`client.call: ${message}`);
};

function checkExpect(expect: readonly number[]): void {
  for (const status of expect) {
    if (!Number.isInteger(status) || status < 400 || status > 499 || status === 429) {
      fail('expect mag alleen statussen 400–499 bevatten, niet 429');
    }
  }
}

function checkKey(key: string | undefined): void {
  if (key === undefined) return;
  if (key.length > MAX_ID_LENGTH || !KEY.test(key))
    fail(`idempotencyKey moet 1 t/m ${String(MAX_ID_LENGTH)} zichtbare ASCII-tekens zijn`);
}

// JSON.stringify geeft undefined voor bijv. een functie; het lib-type zegt alleen string.
function stringify(value: unknown): string | undefined {
  return JSON.stringify(value);
}

function jsonBody(method: OutboundMethod, body: unknown): string | undefined {
  if (body === undefined) return undefined;
  if (!WITH_BODY.has(method)) fail('een body mag alleen bij POST, PUT of PATCH');
  let text: string | undefined;
  try {
    text = stringify(body);
  } catch {
    return fail('de body is niet als JSON te schrijven');
  }
  return text ?? fail('de body is niet als JSON te schrijven');
}

function headersFor(target: Target, body: string | undefined, key: string | undefined): Headers {
  const headers = new Headers(target.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (key !== undefined) headers.set('idempotency-key', key);
  return headers;
}

export function prepareCall<S extends z.ZodType, E extends number>(
  target: Target,
  request: OutboundRequest<S, E>,
): PreparedCall<E> {
  const { method, idempotencyKey } = request;
  if (!METHODS.has(method)) fail('onbekende methode');
  const expect = request.expect ?? [];
  checkExpect(expect);
  checkKey(idempotencyKey);
  const body = jsonBody(method, request.body);
  const url = buildUrl(target, request);
  const headers = headersFor(target, body, idempotencyKey);
  return {
    url,
    init: { method, headers, redirect: 'manual', ...(body === undefined ? {} : { body }) },
    repeatable: method === 'GET' || method === 'HEAD' || idempotencyKey !== undefined,
    expect,
  };
}
