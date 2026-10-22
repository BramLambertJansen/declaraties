import type { MiddlewareHandler } from 'hono';

// CSRF-controle volgens ADR 0041: voor elk request behalve GET, HEAD en OPTIONS moet het mediatype application/json zijn,
// minstens een van Sec-Fetch-Site en Origin aanwezig zijn, en elke aanwezige header kloppen. Een header die dubbel of als
// lijst voorkomt (de Fetch-standaard voegt dubbele headers samen met ", "), telt als niet kloppend.
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

function single(value: string | null): string | null | false {
  if (value === null) return null;
  return value.includes(',') ? false : value;
}

function isJson(contentType: string | null | false): boolean {
  if (typeof contentType !== 'string') return false;
  const mediaType = contentType.split(';', 1)[0] ?? '';
  return mediaType.trim().toLowerCase() === 'application/json';
}

export function isCsrfSafe(request: Request, appOrigin: string | undefined): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const site = single(request.headers.get('sec-fetch-site'));
  const origin = single(request.headers.get('origin'));
  if (!isJson(single(request.headers.get('content-type')))) return false;
  if (site === null && origin === null) return false;
  if (site !== null && site !== 'same-origin') return false;
  return origin === null || (appOrigin !== undefined && origin === appOrigin);
}

// Zonder appOrigin wordt elk request met een Origin-header geweigerd (veilige standaard).
export function csrf(appOrigin: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!isCsrfSafe(c.req.raw, appOrigin)) {
      return c.json({ code: 'CSRF_REJECTED', requestId: c.get('requestId') }, 403);
    }
    await next();
  };
}
