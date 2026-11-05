import { describe, expect, test, vi } from 'vitest';
import { ApiError } from './api-client.ts';
import { createQueryClient, shouldRetry } from './query.ts';

describe('createQueryClient', () => {
  test('een 401 uit een query of mutatie roept onUnauthenticated aan; een andere fout niet', async () => {
    const onUnauthenticated = vi.fn();
    const client = createQueryClient({ onUnauthenticated });
    const fail = (error: Error) => () => Promise.reject(error);

    await expect(
      client.query({ queryKey: ['a'], queryFn: fail(new ApiError('UNAUTHENTICATED', 401)) }),
    ).rejects.toThrow();
    await expect(client.query({ queryKey: ['b'], queryFn: fail(new ApiError('FORBIDDEN', 403)) })).rejects.toThrow();
    await expect(
      client
        .getMutationCache()
        .build(client, { mutationFn: fail(new ApiError('UNAUTHENTICATED', 401)) })
        .execute(undefined),
    ).rejects.toThrow();

    expect(onUnauthenticated).toHaveBeenCalledTimes(2);
  });

  test('4xx wordt niet herhaald, een netwerk- of serverfout hooguit twee keer', () => {
    expect(shouldRetry(0, new ApiError('VALIDATION', 400))).toBe(false);
    expect(shouldRetry(0, new ApiError('INTERNAL_ERROR', 500))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, new TypeError('Failed to fetch'))).toBe(false);
  });

  test('partnerstap/AC-13: een UPSTREAM_*-fout wordt niet herhaald; INTERNAL_ERROR en een netwerkfout wel', () => {
    const upstream = [
      new ApiError('UPSTREAM_INVALID', 502),
      new ApiError('UPSTREAM_UNAVAILABLE', 503),
      new ApiError('UPSTREAM_TIMEOUT', 504),
    ];

    expect(upstream.map((error) => shouldRetry(0, error))).toStrictEqual([false, false, false]);
    expect(shouldRetry(0, new ApiError('INTERNAL_ERROR', 500))).toBe(true);
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
  });
});
