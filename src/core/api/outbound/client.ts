import { setTimeout as sleep } from 'node:timers/promises';
import type { z } from 'zod';
import { AppError } from '../errors.ts';
import type { Target } from './config.ts';
import { OutboundForbiddenError } from './errors.ts';
import { safeLog } from './log.ts';
import { outboundForbidden } from './marker.ts';
import { prepareCall, type PreparedCall } from './request.ts';
import { cancelBody, parseJson, readLimited } from './response.ts';
import { backoffMs, minimalAttemptMs, retryableStatus, retryAfterMs } from './retry.ts';
import type { OutboundLogEntry, OutboundRequest, OutboundResult, UpstreamCode } from './types.ts';

// De pogingenlus (spec uitgaande-client, Vertaling en Herhalen). Een UPSTREAM_* is een AppError zonder cause, tekst, status
// of body van de partner.

interface Failed {
  readonly kind: 'failed';
  readonly status: number | null;
  readonly code: UpstreamCode;
  // Mag herhaald worden als de methode het toestaat.
  readonly retryable: boolean;
  // Retry-After van de partner; null: de backoff geldt.
  readonly waitMs: number | null;
}

type Attempt<S extends z.ZodType, E extends number> =
  | { readonly kind: 'ok'; readonly status: number; readonly data: z.output<S> }
  | { readonly kind: 'expected'; readonly status: E }
  | Failed;

interface Call<S extends z.ZodType, E extends number> {
  readonly target: Target;
  readonly request: OutboundRequest<S, E>;
  readonly prepared: PreparedCall<E>;
}

const failed = (code: UpstreamCode, status: number | null, retryable: boolean): Failed => ({
  kind: 'failed',
  code,
  status,
  retryable,
  waitMs: null,
});

async function readSuccess<S extends z.ZodType, E extends number>(
  call: Call<S, E>,
  response: Response,
  signal: AbortSignal,
): Promise<Attempt<S, E>> {
  const { status } = response;
  let bytes: Uint8Array | null;
  try {
    bytes = await readLimited(response, call.target.maxResponseBytes);
  } catch {
    return failed(signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', status, true);
  }
  const json = bytes === null ? null : parseJson(bytes);
  if (json === null || !json.ok) return failed('UPSTREAM_INVALID', status, false);
  const parsed = call.request.schema.safeParse(json.value);
  return parsed.success ? { kind: 'ok', status, data: parsed.data } : failed('UPSTREAM_INVALID', status, false);
}

async function attemptOnce<S extends z.ZodType, E extends number>(
  call: Call<S, E>,
  timeoutMs: number,
): Promise<Attempt<S, E>> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(call.prepared.url, { ...call.prepared.init, signal });
  } catch {
    return failed(signal.aborted ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', null, true);
  }
  const { status } = response;
  if (status >= 200 && status < 300) return readSuccess(call, response, signal);
  cancelBody(response);
  const expected = call.prepared.expect.find((code) => code === status);
  if (expected !== undefined) return { kind: 'expected', status: expected };
  if (status === 429 || status >= 500) {
    const waitMs = retryAfterMs(response.headers.get('retry-after'), Date.now());
    return { ...failed('UPSTREAM_UNAVAILABLE', status, retryableStatus(status)), waitMs };
  }
  // 3xx (nooit gevolgd) en andere 4xx.
  return failed('UPSTREAM_INVALID', status, false);
}

// De wachttijd vóór de volgende poging, of null: stoppen met deze uitkomst.
function nextWait<S extends z.ZodType, E extends number>(
  call: Call<S, E>,
  attempt: { readonly result: Attempt<S, E>; readonly number: number },
  deadline: number,
): number | null {
  const { result } = attempt;
  if (result.kind !== 'failed' || !result.retryable || !call.prepared.repeatable) return null;
  if (attempt.number >= call.target.maxAttempts) return null;
  const wait = result.waitMs ?? backoffMs(attempt.number);
  const remaining = deadline - performance.now();
  return wait + minimalAttemptMs(call.target.timeoutMs) > remaining ? null : wait;
}

function logAttempt<S extends z.ZodType, E extends number>(
  call: Call<S, E>,
  attempt: { readonly result: Attempt<S, E>; readonly number: number; readonly started: number },
  retry: boolean,
): void {
  const { result } = attempt;
  const entry: OutboundLogEntry = {
    time: new Date().toISOString(),
    requestId: call.request.requestId,
    outbound: call.target.name,
    method: call.request.method,
    path: call.request.path,
    status: result.status,
    durationMs: Math.round(performance.now() - attempt.started),
    attempt: attempt.number,
    outcome: result.kind === 'ok' ? 'OK' : result.kind === 'expected' ? 'EXPECTED' : result.code,
    retry,
  };
  safeLog(call.target.log, entry);
}

function finish<S extends z.ZodType, E extends number>(result: Attempt<S, E>): OutboundResult<S, E> {
  if (result.kind === 'ok') return { ok: true, status: result.status, data: result.data };
  if (result.kind === 'expected') return { ok: false, status: result.status };
  // Uitdrukkelijk zonder oorzaak: niets van de partner reist mee in de fout.
  throw new AppError(result.code, { cause: undefined });
}

export async function runCall<S extends z.ZodType, E extends number>(
  target: Target,
  request: OutboundRequest<S, E>,
): Promise<OutboundResult<S, E>> {
  if (outboundForbidden()) {
    throw new OutboundForbiddenError('client.call: geen partneraanroep binnen withUser of afterCommit (R-CODE-12)');
  }
  const call: Call<S, E> = { target, request, prepared: prepareCall(target, request) };
  const deadline = performance.now() + target.budgetMs;
  for (let number = 1; ; number += 1) {
    const started = performance.now();
    const timeoutMs = Math.max(1, Math.floor(Math.min(target.timeoutMs, deadline - started)));
    const result = await attemptOnce(call, timeoutMs);
    const wait = nextWait(call, { result, number }, deadline);
    logAttempt(call, { result, number, started }, wait !== null);
    if (wait === null) return finish(result);
    await sleep(wait);
  }
}
