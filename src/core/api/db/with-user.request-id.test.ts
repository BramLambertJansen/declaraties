import type { Pool } from 'pg';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { UserId } from '../../shared/ids.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { WithUserOptions } from './types.ts';
import { createWithUser } from './with-user.ts';

// requestId in withUser (spec audit-log AC-4, OV-A2): verplicht in het type, en een lege waarde gooit vóór er een verbinding
// wordt gepakt (net als een lege userId).
const actor = { userId: UserId.parse('u1'), sessionStrength: 'mfa' } as const;

describe('withUser: requestId', () => {
  test('een lege requestId gooit en pakt geen verbinding', async () => {
    const connect = vi.fn();
    const pool = unsafeCast<Pool>({ connect }, 'test: alleen connect wordt aangeraakt, en dat mag niet gebeuren');
    const withUser = createWithUser(pool);

    await expect(withUser(actor, () => Promise.resolve(null), { requestId: '' })).rejects.toThrow('lege requestId');
    expect(connect).not.toHaveBeenCalled();
  });

  test('een lege requestId gooit ook met readOnly en rateLimit', async () => {
    const connect = vi.fn();
    const pool = unsafeCast<Pool>({ connect }, 'test: alleen connect wordt aangeraakt, en dat mag niet gebeuren');
    const withUser = createWithUser(pool);

    await expect(
      withUser(actor, () => Promise.resolve(null), {
        requestId: '',
        readOnly: true,
        rateLimit: { bucket: 'lezen', windowSeconds: 60, max: 1 },
      }),
    ).rejects.toThrow('lege requestId');
    expect(connect).not.toHaveBeenCalled();
  });

  test('het type eist een requestId van het type string (zonder requestId compileert de aanroep niet)', () => {
    expectTypeOf<WithUserOptions['requestId']>().toEqualTypeOf<string>();
    expectTypeOf<{ readonly readOnly: true }>().not.toExtend<WithUserOptions>();
    expectTypeOf<{ readonly requestId: string }>().toExtend<WithUserOptions>();
  });
});
