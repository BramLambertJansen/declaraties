import { afterEach, expect, test, vi } from 'vitest';
import { createPool } from './pool.ts';

afterEach(() => vi.restoreAllMocks());

test('idle poolfouten loggen alleen veilige metadata, zonder SQL, persoonsgegevens of detail', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const pool = createPool('postgres://unused.invalid/test');
  try {
    const error = Object.assign(new Error('select private_column from customer_private; person@example.test'), {
      code: '57P01',
      detail: 'private-detail',
      cause: new Error('private-cause'),
    });
    expect(() => pool.emit('error', error)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    const output = JSON.stringify(warn.mock.calls);
    expect(output).not.toMatch(/private_column|customer_private|person@example|private-detail|private-cause/);
    expect(output).toContain('57P01');
  } finally {
    await pool.end();
  }
});

test('een mislukte idle-foutlogger laat het proces niet alsnog falen', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {
    throw new Error('logger failed');
  });
  const pool = createPool('postgres://unused.invalid/test');
  try {
    expect(() => pool.emit('error', new Error('connection lost'))).not.toThrow();
  } finally {
    await pool.end();
  }
});
