import type { z } from 'zod';
import type { Role } from '../../shared/can.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';

// Enige plek met fetch (framework §5). Getypt op de route-contracten uit src/shared: de web-code importeert niets uit src/api.
// Same-origin met cookie; de CSRF-headers stuurt de browser zelf (Sec-Fetch-Site), Content-Type zet de client altijd (ADR 0007).
// 401 → inloggen: createQueryClient (query.ts) en de guard (guard.ts) handelen dat af; de client gooit alleen ApiError.

interface AnyContract {
  readonly method: string;
  readonly path: string;
  readonly input: z.ZodType;
  readonly output: z.ZodType;
}

type Key<C> = C extends AnyContract ? `${C['method']} ${C['path']}` : never;
type ContractFor<C, K> = C extends AnyContract ? (K extends `${C['method']} ${C['path']}` ? C : never) : never;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function fillPath(path: string, input: Record<string, unknown>): { url: string; rest: Record<string, unknown> } {
  const used = new Set<string>();
  const url = path.replace(/:(\w+)/g, (_, name: string) => {
    used.add(name);
    return encodeURIComponent(String(input[name]));
  });
  return { url: `/api${url}`, rest: Object.fromEntries(Object.entries(input).filter(([name]) => !used.has(name))) };
}

async function errorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
      ? body.code
      : 'INTERNAL_ERROR';
  } catch {
    return 'INTERNAL_ERROR';
  }
}

export function createApiClient<Contracts extends readonly AnyContract[]>() {
  async function call<K extends Key<Contracts[number]>>(
    key: K,
    input: z.input<ContractFor<Contracts[number], K>['input']>,
  ): Promise<z.output<ContractFor<Contracts[number], K>['output']>> {
    const [method = 'GET', path = '/'] = key.split(' ');
    const { url, rest } = fillPath(path, typeof input === 'object' && input !== null ? { ...input } : {});
    const query =
      method === 'GET' || method === 'DELETE'
        ? `?${new URLSearchParams(
            Object.entries(rest)
              .filter(([, value]) => value !== undefined)
              .map(([k, v]) => [k, String(v)]),
          ).toString()}`
        : '';
    const response = await fetch(`${url}${query === '?' ? '' : query}`, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...(query === '' ? { body: JSON.stringify(rest) } : {}),
    });
    if (!response.ok) throw new ApiError(await errorCode(response), response.status);
    const body: unknown = await response.json();
    return unsafeCast(body, 'de server valideert de output tegen hetzelfde contract (createApp)');
  }

  async function health(): Promise<boolean> {
    const response = await fetch('/api/health', { credentials: 'same-origin' });
    return response.ok;
  }

  // Alleen lokaal (ADR 0014): logt in als het seed-account van de rol; elders geeft de server 404.
  async function devLoginAs(rol: Role): Promise<void> {
    const response = await fetch('/api/dev/login-as', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rol }),
    });
    if (!response.ok) throw new ApiError(await errorCode(response), response.status);
  }

  return { call, health, devLoginAs };
}
