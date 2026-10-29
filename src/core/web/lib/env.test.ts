import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { isDev, readWebEnv } from './env.ts';

describe('readWebEnv', () => {
  test('leest en valideert de VITE_-variabelen van de app', () => {
    const schema = z.object({ VITE_APP_NAME: z.string().min(1) });

    expect(readWebEnv(schema, { VITE_APP_NAME: 'Template', SECRET: 'x' })).toStrictEqual({ VITE_APP_NAME: 'Template' });
    expect(() => readWebEnv(schema, {})).toThrow();
  });

  test('een sleutel zonder VITE_ in het schema wordt geweigerd: die hoort niet in de browser', () => {
    expect(() => readWebEnv(z.object({ AUTH_SECRET: z.string() }), {})).toThrow('niet AUTH_SECRET');
  });

  test('isDev volgt Vite (in Vitest: true)', () => {
    expect(isDev).toBe(true);
  });
});
