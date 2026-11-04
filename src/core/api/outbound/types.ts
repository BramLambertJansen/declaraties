import type { z } from 'zod';
import type { Env } from '../env.ts';

// Publieke types van de uitgaande client (spec uitgaande-client); index.ts exporteert ze.

export type OutboundMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type UpstreamCode = 'UPSTREAM_INVALID' | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_TIMEOUT';

// Eén regel per poging; alleen deze velden: nooit headers, body, query of geheimen.
export interface OutboundLogEntry {
  readonly time: string;
  readonly requestId: string;
  readonly outbound: string;
  readonly method: OutboundMethod;
  // Het sjabloon (`/items/:id`), nooit het echte pad.
  readonly path: string;
  // null zonder antwoord (netwerkfout of time-out vóór de headers).
  readonly status: number | null;
  readonly durationMs: number;
  readonly attempt: number;
  readonly outcome: 'OK' | 'EXPECTED' | UpstreamCode;
  // Er volgt nog een poging.
  readonly retry: boolean;
}

export type OutboundLog = (entry: OutboundLogEntry) => void;

export interface OutboundConfig {
  readonly name: string;
  readonly baseUrl: string;
  readonly hosts: readonly string[];
  readonly appEnv: Env['appEnv'];
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly budgetMs?: number;
  readonly maxAttempts?: number;
  readonly maxResponseBytes?: number;
  readonly log?: OutboundLog;
}

export interface OutboundRequest<S extends z.ZodType, E extends number> {
  readonly requestId: string;
  readonly method: OutboundMethod;
  readonly path: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly body?: unknown;
  readonly schema: S;
  readonly idempotencyKey?: string;
  readonly expect?: readonly E[];
}

export type OutboundResult<S extends z.ZodType, E extends number> =
  | { readonly ok: true; readonly status: number; readonly data: z.output<S> }
  | { readonly ok: false; readonly status: E };

export interface OutboundClient {
  readonly call: <S extends z.ZodType, const E extends number = never>(
    request: OutboundRequest<S, E>,
  ) => Promise<OutboundResult<S, E>>;
}
