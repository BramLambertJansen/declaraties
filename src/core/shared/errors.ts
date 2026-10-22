// Foutcoderegister (framework §6: naar buiten alleen `{ code, requestId }`; ADR 0040). Core levert de basiscodes; een app
// voegt eigen codes toe met defineErrorCodes in src/shared/errors.ts, zonder core te wijzigen.
export const coreErrorCodes = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'CSRF_REJECTED',
  'PAYLOAD_TOO_LARGE',
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'MFA_REQUIRED',
  'ALREADY_EXISTS',
  'RATE_LIMITED',
  'NOT_IMPLEMENTED',
] as const;

export type CoreErrorCode = (typeof coreErrorCodes)[number];

export interface ErrorBody {
  readonly code: string;
  readonly requestId: string;
}

const CODE_FORMAT = /^[A-Z][A-Z0-9_]*$/;

export interface ErrorRegistry<Code extends string> {
  readonly codes: readonly Code[];
  readonly is: (value: unknown) => value is Code;
}

// Een app-code mag geen basiscode overschrijven en volgt SCREAMING_SNAKE_CASE; fouten vallen bij opstart (en in de test).
export function defineErrorCodes<const AppCode extends string>(
  appCodes: readonly AppCode[],
): ErrorRegistry<CoreErrorCode | AppCode> {
  const core: readonly string[] = coreErrorCodes;
  for (const code of appCodes) {
    if (!CODE_FORMAT.test(code)) throw new Error(`Foutcode '${code}' moet SCREAMING_SNAKE_CASE zijn`);
    if (core.includes(code)) throw new Error(`Foutcode '${code}' bestaat al in core`);
  }
  if (new Set(appCodes).size !== appCodes.length) throw new Error('Dubbele foutcode in de app');
  const codes: readonly (CoreErrorCode | AppCode)[] = [...coreErrorCodes, ...appCodes];
  const known: ReadonlySet<unknown> = new Set(codes);
  return { codes, is: (value): value is CoreErrorCode | AppCode => known.has(value) };
}

export type ErrorCodeOf<Registry> = Registry extends ErrorRegistry<infer Code> ? Code : never;
