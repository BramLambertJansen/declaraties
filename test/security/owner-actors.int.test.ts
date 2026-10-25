import { expect, test } from 'vitest';
import { echteZender } from './controles.ts';
import { createSecurityFixtures } from './fixtures.ts';

test('security/AC-9: A en B krijgen per resource twee echte accounts met de toegestane rol en MFA', async () => {
  const fixtures = createSecurityFixtures();
  try {
    const adminA = await fixtures.A('admin');
    const adminB = await fixtures.B('admin');
    expect(adminA.userId).not.toBe(adminB.userId);
    expect((await fixtures.A('admin')).userId).toBe(adminA.userId);
    const request = { method: 'GET', pad: '/accounts', params: {}, invoer: {} } as const;
    const admin = echteZender(fixtures, 'admin');
    const first = await admin('A', request);
    const second = await admin('B', request);
    expect(first.status, first.tekst).toBe(200);
    expect(second.status, second.tekst).toBe(200);
    expect((await echteZender(fixtures)('A', request)).status).toBe(403);
    expect((await fixtures.A()).userId).not.toBe(adminA.userId);
  } finally {
    await fixtures.close();
  }
});
