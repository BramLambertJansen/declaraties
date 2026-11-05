// Het antwoord lezen (spec uitgaande-client, Grenzen): hooguit maxBytes gedecodeerde bytes; een body die de client niet
// leest, sluit hij met `response.body?.cancel()`.

export function cancelBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

// Een Content-Length boven de grens zonder Content-Encoding wordt niet gelezen; anders stopt het lezen bij de grens.
// null: te groot. Een fout tijdens het lezen (signaal of verbroken verbinding) gaat naar de aanroeper.
export async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  // Zonder body (HEAD, 204) telt de Content-Length niet: bij HEAD is dat de lengte van de GET-body.
  if (response.body === null) return new Uint8Array();
  const length = response.headers.get('content-length');
  if (length !== null && response.headers.get('content-encoding') === null && Number(length) > maxBytes) {
    cancelBody(response);
    return null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Stoppen bij de grens: het verlaten van de lus breekt de stream af.
  for await (const chunk of response.body) {
    const value: unknown = chunk;
    if (!(value instanceof Uint8Array)) throw new TypeError('uitgaande client: onverwacht stuk in de body');
    total += value.byteLength;
    if (total > maxBytes) return null;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const decoder = new TextDecoder('utf-8', { fatal: true });

// Lege body → undefined (ook bij 204); anders JSON. Ongeldige UTF-8 of JSON: `invalid`.
export function parseJson(bytes: Uint8Array): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  if (bytes.byteLength === 0) return { ok: true, value: undefined };
  try {
    const value: unknown = JSON.parse(decoder.decode(bytes));
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}
