import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { meldingOpdracht } from '../../rails/hooks/lib/melding.mjs';

// Ontwikkelgemak 2: een bureaubladmelding als Claude op je wacht (Notification-hook). Onder WSL via powershell.exe, met titel
// en tekst alleen in de omgeving (nooit in de opdrachtregel: geen injectie); op Linux via notify-send; anders niets.

const nooit = () => false;
const altijd = () => true;

function omgeving(env: Record<string, string | undefined>, heeft: (programma: string) => boolean = nooit) {
  return { env, heeft };
}

describe('meldingOpdracht', () => {
  test('KIT_MELDING=uit: geen melding, ook niet onder WSL', () => {
    expect(meldingOpdracht({}, omgeving({ KIT_MELDING: 'uit', WSL_DISTRO_NAME: 'Ubuntu' }, altijd))).toBeNull();
  });

  test('WSL: powershell.exe met een vast script; titel en tekst in de omgeving', () => {
    const opdracht = meldingOpdracht(
      { title: 'Toestemming', message: 'Mag ik pnpm draaien?' },
      omgeving({ WSL_DISTRO_NAME: 'Ubuntu' }),
    );

    expect(opdracht?.command).toBe('powershell.exe');
    expect(opdracht?.args.slice(0, 3)).toStrictEqual(['-NoProfile', '-NonInteractive', '-Command']);
    expect(opdracht?.args).toHaveLength(4);
    const script = opdracht?.args[3] ?? '';
    expect(script).toContain('$env:KIT_MELDING_TITEL');
    expect(script).toContain('$env:KIT_MELDING_TEKST');
    expect(opdracht?.env).toStrictEqual({
      KIT_MELDING_TITEL: 'Toestemming',
      KIT_MELDING_TEKST: 'Mag ik pnpm draaien?',
      WSLENV: 'KIT_MELDING_TITEL/u:KIT_MELDING_TEKST/u',
    });
  });

  test('WSL: kwaadaardige titel en tekst komen nooit in de argumenten; het script blijft hetzelfde', () => {
    const titel = "'; Remove-Item -Recurse C:\\ ; '";
    const tekst = '$(Start-Process calc) `whoami` "; exit';
    const gewoon = meldingOpdracht({ title: 'a', message: 'b' }, omgeving({ WSL_DISTRO_NAME: 'Ubuntu' }));
    const vijandig = meldingOpdracht({ title: titel, message: tekst }, omgeving({ WSL_DISTRO_NAME: 'Ubuntu' }));

    expect(vijandig?.args).toStrictEqual(gewoon?.args);
    expect(vijandig?.args.join(' ')).not.toContain('Remove-Item');
    expect(vijandig?.args.join(' ')).not.toContain('calc');
    expect(vijandig?.env['KIT_MELDING_TITEL']).toBe(titel);
    expect(vijandig?.env['KIT_MELDING_TEKST']).toBe(tekst);
  });

  test('WSL: een bestaande WSLENV blijft staan en krijgt de twee variabelen erachter', () => {
    const opdracht = meldingOpdracht({}, omgeving({ WSL_INTEROP: '/run/WSL/1_interop', WSLENV: 'FOO/p' }));

    expect(opdracht?.command).toBe('powershell.exe');
    expect(opdracht?.env['WSLENV']).toBe('FOO/p:KIT_MELDING_TITEL/u:KIT_MELDING_TEKST/u');
  });

  test('WSL gaat vóór notify-send', () => {
    expect(meldingOpdracht({}, omgeving({ WSL_DISTRO_NAME: 'Ubuntu' }, altijd))?.command).toBe('powershell.exe');
  });

  test('Linux met notify-send: titel en tekst na `--` als losse argumenten', () => {
    const gevraagd: string[] = [];
    const opdracht = meldingOpdracht(
      { title: '-t', message: 'Klaar' },
      omgeving({}, (programma) => {
        gevraagd.push(programma);
        return programma === 'notify-send';
      }),
    );

    expect(gevraagd).toContain('notify-send');
    expect(opdracht).toStrictEqual({
      command: 'notify-send',
      args: ['--app-name=Claude Code', '--', '-t', 'Klaar'],
      env: {},
    });
  });

  test.each([
    { naam: 'lege payload', payload: {} },
    { naam: 'null', payload: null },
    { naam: 'lege strings', payload: { title: '', message: '' } },
    { naam: 'geen strings', payload: { title: 42, message: ['x'] } },
  ])('standaardtitel en -tekst bij $naam', ({ payload }) => {
    expect(meldingOpdracht(payload, omgeving({}, altijd))?.args).toStrictEqual([
      '--app-name=Claude Code',
      '--',
      'Claude Code',
      'Claude wacht op je',
    ]);
  });

  test('titel en tekst afgekapt op 200 tekens (notify-send en WSL)', () => {
    const lang = { title: 't'.repeat(300), message: 'm'.repeat(250) };
    const linux = meldingOpdracht(lang, omgeving({}, altijd));
    const wsl = meldingOpdracht(lang, omgeving({ WSL_DISTRO_NAME: 'Ubuntu' }));

    expect(linux?.args.slice(2)).toStrictEqual(['t'.repeat(200), 'm'.repeat(200)]);
    expect(wsl?.env['KIT_MELDING_TITEL']).toBe('t'.repeat(200));
    expect(wsl?.env['KIT_MELDING_TEKST']).toBe('m'.repeat(200));
  });

  test('lege WSL-variabele telt niet als WSL; zonder notify-send geen melding', () => {
    expect(meldingOpdracht({}, omgeving({ WSL_DISTRO_NAME: '', WSL_INTEROP: '' }))).toBeNull();
  });
});

// Het echte entry-script via stdin: schrijft nooit naar stdout, eindigt altijd met 0 en start de opdracht losgekoppeld.
const root = process.cwd();
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function entry(input: string, env: Record<string, string>) {
  const basis = Object.fromEntries(
    Object.entries(process.env).filter(
      (paar): paar is [string, string] =>
        paar[1] !== undefined && !['WSL_DISTRO_NAME', 'WSL_INTEROP', 'KIT_MELDING'].includes(paar[0]),
    ),
  );
  const result = spawnSync(process.execPath, [path.join(root, 'rails/hooks/melding.mjs')], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: { ...basis, ...env },
    timeout: 10_000,
  });
  return { status: result.status, stdout: result.stdout };
}

describe('entry rails/hooks/melding.mjs', () => {
  test.each(['', 'kapot{', JSON.stringify({ title: 'x', message: 'y' })])(
    'KIT_MELDING=uit: exit 0 en niets op stdout (stdin %j)',
    (input) => {
      expect(entry(input, { KIT_MELDING: 'uit' })).toStrictEqual({ status: 0, stdout: '' });
    },
  );

  test('start notify-send losgekoppeld met titel en tekst; stdout blijft leeg', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'melding-'));
    dirs.push(dir);
    const log = path.join(dir, 'log');
    const nep = path.join(dir, 'notify-send');
    writeFileSync(nep, `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n`);
    chmodSync(nep, 0o755);

    const result = entry(JSON.stringify({ title: 'Titel', message: 'Wacht' }), {
      PATH: `${dir}:${process.env['PATH'] ?? ''}`,
    });

    expect(result).toStrictEqual({ status: 0, stdout: '' });
    await vi.waitFor(() => {
      expect(existsSync(log)).toBe(true);
    });
    await vi.waitFor(() => {
      expect(readFileSync(log, 'utf8').split('\n')).toStrictEqual([
        '--app-name=Claude Code',
        '--',
        'Titel',
        'Wacht',
        '',
      ]);
    });
  });

  test('kapotte JSON telt als lege payload: standaardmelding', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'melding-'));
    dirs.push(dir);
    const log = path.join(dir, 'log');
    const nep = path.join(dir, 'notify-send');
    writeFileSync(nep, `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n`);
    chmodSync(nep, 0o755);

    expect(entry('{kapot', { PATH: `${dir}:${process.env['PATH'] ?? ''}` })).toStrictEqual({ status: 0, stdout: '' });
    await vi.waitFor(() => {
      expect(existsSync(log) ? readFileSync(log, 'utf8') : '').toContain('Claude wacht op je');
    });
  });
});
