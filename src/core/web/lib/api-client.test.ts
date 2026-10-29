import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createApiClient } from './api-client.ts';

afterEach(() => vi.unstubAllGlobals());

describe.each(['GET', 'DELETE'] as const)('API-client: %s-queryparameters', (method) => {
  const contract = {
    method,
    path: '/items/:id',
    input: z.object({
      id: z.string(),
      q: z.string().optional(),
      page: z.number().optional(),
      active: z.boolean().optional(),
    }),
    output: z.null(),
  } as const;
  const client = createApiClient<readonly [typeof contract]>();

  function captureRequest() {
    const transport = vi.fn(() => Promise.resolve(Response.json(null)));
    vi.stubGlobal('fetch', transport);
    return transport;
  }

  test('laat expliciet undefined weg en voegt geen lege querystring toe', async () => {
    const transport = captureRequest();
    await client.call(`${contract.method} ${contract.path}`, {
      id: 'a/b',
      q: undefined,
      page: undefined,
      active: undefined,
    });
    expect(transport).toHaveBeenCalledWith('/api/items/a%2Fb', {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    });
  });

  test('behoudt lege tekst, nul en false', async () => {
    const transport = captureRequest();
    await client.call(`${contract.method} ${contract.path}`, { id: 'one', q: '', page: 0, active: false });
    expect(transport).toHaveBeenCalledWith('/api/items/one?q=&page=0&active=false', expect.any(Object));
  });

  test('behoudt de letterlijke zoekterm undefined', async () => {
    const transport = captureRequest();
    await client.call(`${contract.method} ${contract.path}`, { id: 'one', q: 'undefined', page: undefined });
    expect(transport).toHaveBeenCalledWith('/api/items/one?q=undefined', expect.any(Object));
  });
});
