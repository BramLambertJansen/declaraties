import { EventEmitter } from 'node:events';
import { describe, expect, test, vi } from 'vitest';
import { onProcessSignal, parsePort } from './env.ts';

describe('parsePort', () => {
  test('valt terug op de standaardpoort als de waarde ontbreekt', () => {
    expect(parsePort(undefined, 8787)).toBe(8787);
    expect(parsePort('', 8787)).toBe(8787);
  });

  test('leest een geldige poort', () => {
    expect(parsePort('9000', 8787)).toBe(9000);
  });

  test.each(['0', '65536', 'abc', '80.5', '-1'])('weigert %s', (value) => {
    expect(() => parsePort(value, 8787)).toThrow('Ongeldige poort');
  });
});

describe('onProcessSignal', () => {
  function fakeHost() {
    const emitter = new EventEmitter();
    const exit = vi.fn();
    return { emitter, exit, host: { once: emitter.once.bind(emitter), exit } };
  }

  test('roept de afhandeling één keer aan en eindigt daarna met exitcode 0', async () => {
    const { emitter, exit, host } = fakeHost();
    const handle = vi.fn(() => Promise.resolve());
    onProcessSignal('SIGTERM', handle, host);

    emitter.emit('SIGTERM');
    emitter.emit('SIGTERM');
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(0);
    });
    expect(handle).toHaveBeenCalledOnce();
  });

  test('een mislukte afhandeling meldt de fout en eindigt met exitcode 1', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { emitter, exit, host } = fakeHost();
    onProcessSignal('SIGTERM', () => Promise.reject(new Error('pool')), host);

    emitter.emit('SIGTERM');
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
    expect(error).toHaveBeenCalledWith('SIGTERM: afhandeling mislukt', expect.any(Error));
    error.mockRestore();
  });
});
