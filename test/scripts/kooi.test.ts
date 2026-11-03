import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';
import {
  MELDING_GEEN_BWRAP,
  MELDING_PROEF,
  beoordeelProef,
  bwrapArgs,
  proef,
  controleerWerkmap,
  inKooi,
} from '../../scripts/kit/kooi.mjs';

// docs/specs/kooi.md (ADR 0072): een commando in de kooi kan buiten zijn werkmap niets veranderen of bereiken. Geen
// verwijdercommando's: elke poging is afkappen (`: >`) of hernoemen (`mv`) van een kanariebestand, dat na afloop byte-gelijk
// en op zijn plek moet staan.
const KOOI = path.resolve('scripts/kit/kooi.mjs');
const INHOUD = 'kanarie\n';
const mappen: string[] = [];

function map(basis: string, prefix: string): string {
  const pad = realpathSync(mkdtempSync(path.join(basis, prefix)));
  mappen.push(pad);
  return pad;
}

function kanarie(basis: string): string {
  const pad = path.join(map(basis, '.kooi-kanarie-'), 'k.txt');
  writeFileSync(pad, INHOUD);
  return pad;
}

function processenMet(merk: string): string[] {
  return readdirSync('/proc')
    .filter((p) => /^\d+$/.test(p))
    .filter((p) => {
      try {
        return readFileSync(`/proc/${p}/cmdline`, 'utf8').includes(merk);
      } catch {
        return false;
      }
    });
}

afterEach(() => {
  for (const pad of mappen.splice(0)) rmSync(pad, { recursive: true, force: true });
});

describe('kooi/AC-2: de werkmap', () => {
  test.each([
    ['de tijdelijke map zelf', () => tmpdir()],
    ['de repository', () => process.cwd()],
    ['de thuismap', () => homedir()],
    ['/', () => '/'],
    [
      'een link naar de repository',
      () => {
        const link = path.join(map(tmpdir(), 'kooi-link-'), 'repo');
        symlinkSync(process.cwd(), link);
        return link;
      },
    ],
  ])('weigert %s', (_naam, werkmap) => {
    expect(() => controleerWerkmap(werkmap())).toThrow(/✗ kooi: werkmap/);
  });

  test('een submap van de tijdelijke map mag', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    expect(controleerWerkmap(werkmap)).toBe(werkmap);
  });
});

describe('kooi/AC-3: dicht vallen', () => {
  test('zonder bubblewrap draait niets en noemt de melding de oplossing', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const r = spawnSync(process.execPath, [KOOI, '--werkmap', werkmap, '--', ': > gedraaid'], {
      encoding: 'utf8',
      env: { PATH: '/nergens' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(MELDING_GEEN_BWRAP);
    expect(readdirSync(werkmap)).toStrictEqual([]);
  });

  test('een proef zonder alleen-lezen bestandssysteem keurt de kooi af', () => {
    expect(beoordeelProef({ stdout: '', stderr: '' }, true)).toBe(MELDING_PROEF);
    expect(beoordeelProef({ stdout: 'Permission denied', stderr: '' }, true)).toBe(MELDING_PROEF);
    expect(beoordeelProef({ stdout: 'x: Read-only file system', stderr: '' }, false)).toContain('start niet');
    expect(beoordeelProef({ stdout: 'x: Read-only file system', stderr: '' }, true)).toBe('goed');
  });

  test('de proef keurt een echte kooi af die een systeemmap schrijfbaar laat (R-PRINC-04)', () => {
    // Kapot: een lege, schrijfbare /usr/share in de kooi. Schrijven lukt daar zonder de echte map te raken.
    const kapot = (werkmap: string) => [...bwrapArgs(werkmap), '--tmpfs', '/usr/share'];
    expect(proef(kapot, '/usr/share/.kooi-proef')).toBe(MELDING_PROEF);
    expect(proef()).toBe('goed');
  });

  test('de proef van de CLI slaagt hier', () => {
    const r = spawnSync(process.execPath, [KOOI, '--proef'], { encoding: 'utf8' });
    expect(r.stdout).toContain('✓ kooi');
    expect(r.status).toBe(0);
  });
});

describe('kooi/AC-1: het commando draait in de werkmap', () => {
  test('schrijven en lezen in de werkmap, met de toolchain en zonder tokens uit de omgeving', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    process.env['KOOI_GEHEIM'] = 'lekt';
    const r = inKooi(
      'printf binnen > a && cat a && node -e "process.stdout.write(String(process.env.KOOI_GEHEIM))" && git --version',
      {
        werkmap,
        env: { EIGEN: 'x' },
      },
    );
    Reflect.deleteProperty(process.env, 'KOOI_GEHEIM');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^binnenundefinedgit version/);
    expect(readFileSync(path.join(werkmap, 'a'), 'utf8')).toBe('binnen');
  });
});

describe('kooi/AC-4: de kooi schermt af', () => {
  const sockets: Server[] = [];
  afterAll(() => {
    for (const s of sockets) s.close();
  });

  test('afkappen en hernoemen buiten de werkmap laten elk kanariebestand heel', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    // /var/tmp is in de kooi zichtbaar en alleen-lezen; /tmp en de thuismap zijn leeg; de repository staat lokaal en in CI
    // meestal onder de thuismap en is dan ook onzichtbaar.
    const zichtbaar = kanarie('/var/tmp');
    const kanaries = [kanarie(tmpdir()), kanarie(homedir()), kanarie(path.resolve('node_modules')), zichtbaar];
    symlinkSync(path.dirname(zichtbaar), path.join(werkmap, 'naar-buiten'));
    const pogingen = kanaries.flatMap((k) => {
      const relatief = path.relative(werkmap, k);
      const inHome = path.relative(homedir(), k);
      return [
        `: > '${k}'`,
        `mv '${k}' '${k}.weg'`,
        `: > '${relatief}'`,
        `cd / && : > '.${k}'`,
        `: > "$KOOI_HOME/${inHome}"`,
      ];
    });
    pogingen.push(
      `: > naar-buiten/k.txt`,
      `mv naar-buiten/k.txt naar-buiten/weg.txt`,
      `test -e '${kanaries[0] ?? ''}' || echo onzichtbaar-tmp`,
      `test -e '${kanaries[1] ?? ''}' || echo onzichtbaar-home`,
    );
    const r = inKooi(`${pogingen.map((p) => `{ ${p}; } 2>&1`).join('; ')}; true`, {
      werkmap,
      env: { KOOI_HOME: homedir() },
    });
    for (const k of kanaries) expect(readFileSync(k, 'utf8')).toBe(INHOUD);
    expect(r.stdout).toContain(`${zichtbaar}: Read-only file system`);
    expect(r.stdout).toContain('onzichtbaar-tmp');
    expect(r.stdout).toContain('onzichtbaar-home');
  });

  test('geen capabilities, geen sysctl of /sys, geen netwerk, geen thuismap', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const geheim = kanarie(homedir());
    const r = inKooi(
      [
        'grep -E "^Cap(Eff|Bnd):" /proc/self/status',
        // Geen echte waarde: lukt het toch, dan verandert de kernelinstelling zo min mogelijk.
        '{ printf core > /proc/sys/kernel/core_pattern && echo core-geschreven; } 2>/dev/null',
        '{ printf 0 > /proc/sys/vm/drop_caches && echo sysctl-geschreven; } 2>/dev/null',
        '{ : > /sys/kernel/kooi && echo sys-geschreven; } 2>/dev/null',
        '{ exec 3<>/dev/tcp/1.1.1.1/80 && echo net-open; } 2>/dev/null',
        `{ cat '${geheim}' && echo home-gelezen; } 2>/dev/null`,
        'true',
      ].join('; '),
      { werkmap },
    );
    expect(r.stdout).toContain('CapEff:\t0000000000000000');
    expect(r.stdout).toContain('CapBnd:\t0000000000000000');
    expectAbsent(r.stdout, /geschreven|net-open|home-gelezen|kanarie/, {
      recognizes: ['core-geschreven', 'sysctl-geschreven', 'sys-geschreven', 'net-open', 'home-gelezen', INHOUD],
      allows: ['CapEff:\t0000000000000000'],
    });
  });

  test('een socket in de thuismap is in de kooi niet bereikbaar', async () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const pad = path.join(map(homedir(), '.kooi-socket-'), 's');
    const server = createServer((c) => c.end('verbonden'));
    sockets.push(server);
    await new Promise<void>((klaar) => server.listen(pad, klaar));
    const r = inKooi(
      `node -e "require('net').connect('${pad}').on('data', (d) => console.log(String(d))).on('error', (e) => console.log(e.code))"`,
      { werkmap },
    );
    expect(r.stdout.trim()).toBe('ENOENT');
  });

  test('de timeout stopt het commando met zijn kindprocessen', async () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const merk = `600.${String(process.pid)}`;
    const start = Date.now();
    expect(() => inKooi(`sleep ${merk} & sleep ${merk}`, { werkmap, timeout: 1000 })).toThrow();
    expect(Date.now() - start).toBeLessThan(10_000);
    // De kernel stopt de processen in de namespace asynchroon nadat bubblewrap is gestopt; wacht daar kort op.
    await expect.poll(() => processenMet(merk), { timeout: 5000 }).toStrictEqual([]);
  });
});
