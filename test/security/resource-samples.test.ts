import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import type { ResourceRegel } from './resources.ts';

let controls: typeof import('./controles.ts');
beforeAll(async () => {
  vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
  controls = await import('./controles.ts');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function inventory(sample: object) {
  return {
    routes: ['GET /notes'],
    classificatie: { 'GET /notes': { scope: 'eigenaar', resource: 'notes', actie: 'list' } } as const,
    resources: {
      notes: unsafeCast<ResourceRegel>(
        { tabel: 'public.notes', lijst: 'GET /notes', sample },
        'Mutante metadata bewijst dat ontbrekende pagineringssamples rood worden',
      ),
    },
    eigenaarTabellen: ['public.notes'],
  };
}

test('een eigenaarresource zonder tweede create-sample wordt rood vóór de pagineringsproef', () => {
  const problems = controls.classificatieProblemen(inventory({ create: { label: 'one' } }));
  expect(problems.some((problem) => problem.includes('createTweede'))).toBe(true);
});

test('een tweede create-sample laat een volledige pagineringsproef toe', () => {
  expect(
    controls.classificatieProblemen(inventory({ create: { label: 'one' }, createTweede: { label: 'two' } })),
  ).toStrictEqual([]);
});
