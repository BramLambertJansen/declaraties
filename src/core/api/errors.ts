import type { CoreErrorCode } from '../shared/errors.ts';

// Een bekende fout met een code uit het register (framework §6): onError maakt er `{ code, requestId }` van, met de status
// hieronder. Al het andere wordt INTERNAL_ERROR, zonder details naar buiten.
// retryAfter (seconden) alleen bij RATE_LIMITED: onError zet dan de header Retry-After (spec rate-limit).
export interface AppErrorOptions extends ErrorOptions {
  readonly retryAfter?: number;
}

export class AppError extends Error {
  readonly code: string;
  readonly retryAfter: number | undefined;

  constructor(code: string, options?: AppErrorOptions) {
    super(code, options);
    this.name = 'AppError';
    this.code = code;
    this.retryAfter = options?.retryAfter;
  }
}

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 501;

const STATUS = new Map<string, ErrorStatus>(
  Object.entries({
    INTERNAL_ERROR: 500,
    NOT_FOUND: 404,
    CSRF_REJECTED: 403,
    PAYLOAD_TOO_LARGE: 413,
    VALIDATION: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    MFA_REQUIRED: 403,
    ALREADY_EXISTS: 409,
    RATE_LIMITED: 429,
    NOT_IMPLEMENTED: 501,
  } satisfies Record<CoreErrorCode, ErrorStatus>),
);

// App-codes (bijv. LAST_ADMIN) zijn bedrijfsregels: 409.
export function statusFor(code: string): ErrorStatus {
  return STATUS.get(code) ?? 409;
}

const RAISED_CODE = /^[A-Z][A-Z0-9_]*$/;

function pgError(error: unknown): { code: string; message: string } | null {
  for (
    let current: unknown = error, depth = 0;
    depth < 3 && typeof current === 'object' && current !== null;
    depth += 1
  ) {
    if (
      'code' in current &&
      typeof current.code === 'string' &&
      'message' in current &&
      typeof current.message === 'string'
    ) {
      return { code: current.code, message: current.message };
    }
    current = 'cause' in current ? current.cause : null;
  }
  return null;
}

// Databasefouten op één plek (framework §6): 23505 → ALREADY_EXISTS, 23503 → NOT_FOUND, 42501 → FORBIDDEN, en een
// `raise exception '<CODE>'` (P0001) uit een functie of trigger → die code (bijv. LAST_ADMIN). Al het andere blijft zoals het is.
export function translateDatabaseError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  const pg = pgError(error);
  if (pg === null) return error;
  const translated: Readonly<Record<string, string>> = {
    '23505': 'ALREADY_EXISTS',
    '23503': 'NOT_FOUND',
    '42501': 'FORBIDDEN',
  };
  const code = translated[pg.code] ?? (pg.code === 'P0001' && RAISED_CODE.test(pg.message) ? pg.message : undefined);
  return code === undefined ? error : new AppError(code, { cause: error });
}
