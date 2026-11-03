// Geen sessietoken in een JSON-antwoord van /api/auth/* (ADR 0075, spec inloggat-dichten). Het token staat al in de
// httpOnly-cookie; in de body kan script in de pagina het lezen. Op één plek en op elke diepte, zodat ook een endpoint dat
// een update van Better Auth toevoegt eronder valt (fail-closed). Status en headers (ook Set-Cookie) blijven gelijk.

function withoutToken(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutToken);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'token')
      .map(([key, inner]) => [key, withoutToken(inner)]),
  );
}

function isJson(response: Response): boolean {
  const type = response.headers.get('content-type') ?? '';
  return /^application\/(?:[\w.+-]+\+)?json\b/i.test(type.trim());
}

export async function stripTokens(response: Response): Promise<Response> {
  if (!isJson(response) || response.body === null) return response;
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Geen geldige JSON: ongewijzigd doorgeven (de body is al gelezen, dus opnieuw opbouwen).
    return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const body = JSON.stringify(withoutToken(parsed));
  const headers = new Headers(response.headers);
  if (headers.has('content-length')) headers.set('content-length', String(Buffer.byteLength(body, 'utf8')));
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
