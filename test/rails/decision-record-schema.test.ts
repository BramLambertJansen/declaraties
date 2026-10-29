import { expect, test } from 'vitest';
import { recordAlleenBesluit } from '../../scripts/kit/lane.mjs';

const file = 'docs/specs/demo.md';
const record = {
  file,
  digest: 'a'.repeat(64),
  repository: 'r/r',
  branch: 'feat/demo',
  status: 'goedgekeurd',
  paths: [],
};
const register = (decisions: object[]) => JSON.stringify({ version: 1, requiredChecks: ['gate:fast'], decisions });

test.each([
  { digest: 'invalid' },
  { status: 'made-up' },
  { paths: ['../escape.ts'] },
  { repository: 'invalid' },
  { branch: 'main' },
  { extra: true },
])('besluit-lane accepteert geen ongeldig eigen record: %j', (change) => {
  expect(recordAlleenBesluit({ basis: register([]), head: register([{ ...record, ...change }]), file })).toBe(false);
});

test('besluit-lane accepteert een geldig eigen record', () => {
  expect(recordAlleenBesluit({ basis: register([]), head: register([record]), file })).toBe(true);
});
