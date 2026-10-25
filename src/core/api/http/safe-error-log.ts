// Foutlogging zonder persoonsgegevens (framework §6): een onverwachte fout kan SQL, parameters of e-mailadressen
// dragen (bijv. een Postgres-fout met `detail`). We loggen daarom nooit het foutobject, maar alleen een vaste
// allowlist: requestId, route, errorClass, code en label. De functie gooit nooit: logging mag het request niet breken.

interface ErrorLogContext {
  readonly label?: string;
  readonly requestId?: string;
  readonly route?: string;
}
type LogWriter = (message: string, entry: Readonly<Record<string, string>>) => void;

// SQLSTATE (5 tekens) of een registercode van AppError; vrije tekst of driver-codes (ECONNRESET) vallen af.
const SQLSTATE = /^[0-9A-Z]{5}$/;
const APP_CODE = /^[A-Z][A-Z0-9_]*$/;

function readCode(error: unknown): string | undefined {
  try {
    if (!(error instanceof Error)) return undefined;
    const code: unknown = Reflect.get(error, 'code');
    if (typeof code !== 'string') return undefined;
    const isAppCode = error.name === 'AppError' && APP_CODE.test(code);
    return SQLSTATE.test(code) || isAppCode ? code : undefined;
  } catch {
    return undefined;
  }
}

function readErrorClass(error: unknown): string {
  try {
    if (!(error instanceof Error)) return 'NonError';
    const name: unknown = error.constructor.name;
    return typeof name === 'string' && /^\w{1,64}$/.test(name) ? name : 'Error';
  } catch {
    return 'NonError';
  }
}

function buildEntry(context: ErrorLogContext, error: unknown): Record<string, string> {
  const entry: Record<string, string> = {};
  if (context.requestId !== undefined) entry['requestId'] = context.requestId;
  if (context.route !== undefined) entry['route'] = context.route;
  entry['errorClass'] = readErrorClass(error);
  const code = readCode(error);
  if (code !== undefined) entry['code'] = code;
  if (context.label !== undefined) entry['label'] = context.label;
  return entry;
}

export function logUnexpectedError(context: ErrorLogContext, error: unknown, write: LogWriter = console.error): void {
  try {
    write('unexpected error', buildEntry(context, error));
  } catch {
    // Logging mag nooit een nieuwe fout veroorzaken.
  }
}
