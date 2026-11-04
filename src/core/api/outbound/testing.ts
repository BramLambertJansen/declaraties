import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';

// Alleen voor testbestanden (dependency-cruiser: testing-alleen-in-tests; R-UIT-07): een lokale nep-partner, een echte
// HTTP-server op 127.0.0.1 met vastgelegde antwoorden. Eigen code en database blijven echt; alleen de partner is nagebootst.

export interface FakeResponse {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly json?: unknown;
  readonly body?: string | Uint8Array;
  readonly delayMs?: number;
  // Stuurt status en headers meteen, de body pas na deze vertraging (een body die blijft hangen).
  readonly bodyDelayMs?: number;
  // Verbreekt de verbinding zonder antwoord.
  readonly destroy?: boolean;
}

// Sleutel `'METHODE /pad'` (pad zonder query); een reeks: de laatste herhaalt. Onbekende sleutel: 404 zonder body.
export type FakeRoutes = Readonly<Record<string, FakeResponse | readonly FakeResponse[]>>;

export interface FakeRequest {
  readonly method: string;
  // Pad met query, zoals de partner hem ziet.
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
  // `performance.now()` bij aankomst (vóór het lezen van de body): voor tijdmetingen tussen pogingen.
  readonly at: number;
}

export interface FakePartner {
  // Origin zonder slot-`/`, bijv. `http://127.0.0.1:41234`.
  readonly url: string;
  readonly calls: (key: string) => number;
  readonly requests: readonly FakeRequest[];
  readonly close: () => Promise<void>;
}

function isList(entry: FakeResponse | readonly FakeResponse[]): entry is readonly FakeResponse[] {
  return Array.isArray(entry);
}

function pick(entry: FakeResponse | readonly FakeResponse[] | undefined, index: number): FakeResponse {
  if (entry === undefined) return { status: 404 };
  if (!isList(entry)) return entry;
  return entry[Math.min(index, entry.length - 1)] ?? { status: 404 };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString('utf8');
}

function respond(response: ServerResponse, answer: FakeResponse): void {
  if (answer.destroy === true) {
    response.socket?.destroy();
    return;
  }
  const headers: Record<string, string> = { ...answer.headers };
  let payload: string | Uint8Array = '';
  if (answer.json !== undefined) {
    payload = JSON.stringify(answer.json);
    headers['content-type'] ??= 'application/json';
  } else if (answer.body !== undefined) {
    payload = answer.body;
  }
  response.writeHead(answer.status ?? 200, headers);
  if (answer.bodyDelayMs === undefined) {
    response.end(payload);
    return;
  }
  response.flushHeaders();
  setTimeout(() => {
    if (!response.destroyed) response.end(payload);
  }, answer.bodyDelayMs);
}

export async function startFakePartner(routes: FakeRoutes): Promise<FakePartner> {
  const counts = new Map<string, number>();
  const requests: FakeRequest[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    void (async () => {
      const at = performance.now();
      const body = await readBody(request);
      const path = request.url ?? '/';
      const key = `${request.method ?? 'GET'} ${path.split('?')[0] ?? path}`;
      const index = counts.get(key) ?? 0;
      counts.set(key, index + 1);
      requests.push({ method: request.method ?? 'GET', path, headers: { ...request.headers }, body, at });
      const answer = pick(routes[key], index);
      if (answer.delayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
      if (!response.destroyed) respond(response, answer);
    })();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address: AddressInfo | string | null = server.address();
  if (address === null || typeof address === 'string') throw new Error('startFakePartner: geen TCP-adres');
  const { port } = address;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    calls: (key) => counts.get(key) ?? 0,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };
}
