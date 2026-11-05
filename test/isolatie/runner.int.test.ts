import { Socket, connect } from 'node:net';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Bewijst de isolatie van de runner (ADR 0044): vanuit de container falen een verbinding naar internet en naar de
// host, inloggen als postgres en schrijven in de repo. Draait alleen via `pnpm test:db`.
const TIMEOUT = 3000;

function connects(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: TIMEOUT });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => {
      done(true);
    });
    socket.once('timeout', () => {
      done(false);
    });
    socket.once('error', () => {
      done(false);
    });
  });
}

// Eerste antwoord van Postgres op een StartupMessage: 'R' (vraagt om authenticatie) of 'E' (geweigerd, met reden).
function postgresAnswer(user: string): Promise<string> {
  const params = Buffer.from(`user\0${user}\0database\0app\0\0`);
  const header = Buffer.alloc(8);
  header.writeInt32BE(8 + params.length, 0);
  header.writeInt32BE(196_608, 4);
  return new Promise((resolve, reject) => {
    const socket: Socket = connect({ host: 'test-db', port: 5432, timeout: TIMEOUT }, () => {
      socket.write(Buffer.concat([header, params]));
    });
    socket.once('data', (data) => {
      socket.destroy();
      resolve(data.toString('latin1'));
    });
    socket.once('timeout', () => {
      reject(new Error('timeout'));
    });
    socket.once('error', reject);
  });
}

describe('isolatie van de runner', () => {
  test('draait in de runner', () => {
    expect(process.env['RUNNER']).toBe('1');
  });

  test('geen internet', async () => {
    await expect(fetch('https://registry.npmjs.org/', { signal: AbortSignal.timeout(TIMEOUT) })).rejects.toThrow();
  });

  test('geen route naar de host', async () => {
    const routes = readFileSync('/proc/net/route', 'utf8').split('\n').slice(1);

    expect(routes.filter((route) => route.split('\t')[1] === '00000000')).toStrictEqual([]);
    expect(await connects('172.17.0.1', 22)).toBe(false);
    expect(await connects('host.docker.internal', 22)).toBe(false);
  });

  test('inloggen als postgres wordt geweigerd, een gewone rol niet', async () => {
    const asPostgres = await postgresAnswer('postgres');
    const asMigrator = await postgresAnswer('app_migrator');

    expect(asPostgres[0]).toBe('E');
    expect(asPostgres).toContain('pg_hba.conf rejects connection');
    expect(asMigrator[0]).toBe('R');
  });

  test('de repo is read-only', () => {
    const probe = 'isolatie-probe.tmp';
    try {
      expect(() => {
        writeFileSync(probe, 'x', { flag: 'wx' });
      }).toThrow(/EROFS|EACCES/);
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
