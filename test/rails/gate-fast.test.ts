import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { banen, gateFast, snelleGates } from '../../scripts/kit/gate-fast.mjs';

type Uitslag = { script: string; code: number; output: string; seconds: number };

const scripts = snelleGates();
const wacht = (ms: number) => new Promise<void>((klaar) => setTimeout(klaar, ms));

function stub(opties: { rood?: string[]; vertraging?: Record<string, number> } = {}) {
  const gestart: string[] = [];
  const klaar: string[] = [];
  const lopend = new Set<string>();
  const gelijktijdig: string[][] = [];
  const run = async (script: string): Promise<Uitslag> => {
    gestart.push(script);
    lopend.add(script);
    gelijktijdig.push([...lopend]);
    await wacht(opties.vertraging?.[script] ?? 1);
    lopend.delete(script);
    klaar.push(script);
    const rood = opties.rood?.includes(script) ?? false;
    return { script, code: rood ? 2 : 0, output: rood ? `FOUT-UIT ${script}\n` : `ok ${script}\n`, seconds: 0 };
  };
  return { run, gestart, klaar, gelijktijdig };
}

async function draai(opties: Parameters<typeof stub>[0] = {}) {
  const s = stub(opties);
  let tekst = '';
  const code = await gateFast(scripts, s.run, (t: string) => {
    tekst += t;
  });
  return { ...s, code, tekst };
}

describe('gate-fast', () => {
  test('elke snelle gate draait precies één keer', async () => {
    const { gestart } = await draai();

    expect(scripts.length).toBeGreaterThan(2);
    expect([...gestart].sort()).toStrictEqual([...scripts].sort());
  });

  test('banen: test:unit en lint elk een eigen baan, de rest in één baan in registervolgorde, niets weg of dubbel', () => {
    const resultaat = banen(scripts);
    const rest = scripts.filter((script) => script !== 'test:unit' && script !== 'lint');

    expect(resultaat).toContainEqual(['test:unit']);
    expect(resultaat).toContainEqual(['lint']);
    expect(resultaat).toContainEqual(rest);
    expect(resultaat).toHaveLength(3);
    expect([...resultaat.flat()].sort()).toStrictEqual([...scripts].sort());
  });

  test('binnen de rest-baan start een gate pas als de vorige klaar is', async () => {
    const rest = banen(scripts).find((baan) => baan.length > 1) ?? [];
    const { gelijktijdig } = await draai();

    expect(rest.length).toBeGreaterThan(1);
    for (const lopend of gelijktijdig)
      expect(lopend.filter((script) => rest.includes(script)).length).toBeLessThanOrEqual(1);
  });

  test('de uitvoer staat in registervolgorde, ook als een latere gate eerder klaar is', async () => {
    const laatste = scripts[scripts.length - 1] ?? '';
    const eerste = scripts[0] ?? '';
    const { tekst, klaar } = await draai({ rood: scripts, vertraging: { [eerste]: 40 } });

    expect(klaar.indexOf(laatste)).toBeLessThan(klaar.indexOf(eerste));
    const posities = scripts.map((script) => tekst.indexOf(`FOUT-UIT ${script}`));
    expect(posities.every((p) => p >= 0)).toBe(true);
    expect(posities).toStrictEqual([...posities].sort((a, b) => a - b));
  });

  test('exitcode 1 als de laatste gate faalt, met zijn uitvoer; 0 als alles groen is', async () => {
    const laatste = scripts[scripts.length - 1] ?? '';
    const rood = await draai({ rood: [laatste] });
    const groen = await draai();

    expect(rood.code).toBe(1);
    expect(rood.tekst).toContain(`FOUT-UIT ${laatste}`);
    expect(groen.code).toBe(0);
    expect(groen.tekst).not.toContain('FOUT-UIT');
  });

  test('een rode gate stopt de andere niet', async () => {
    const eerste = scripts[0] ?? '';
    const { gestart, code, tekst } = await draai({ rood: [eerste] });

    expect(code).toBe(1);
    expect([...gestart].sort()).toStrictEqual([...scripts].sort());
    for (const script of scripts.slice(1)) expect(tekst).toContain(`✓ ${script}`);
  });

  test('test:unit, lint en een gate uit de rest-baan lopen op enig moment tegelijk', async () => {
    const rest = banen(scripts).find((baan) => baan.length > 1) ?? [];
    const vertraging = Object.fromEntries(scripts.map((script) => [script, 20]));
    const { gelijktijdig } = await draai({ vertraging });

    expect(
      gelijktijdig.some(
        (lopend) =>
          lopend.includes('test:unit') && lopend.includes('lint') && lopend.some((script) => rest.includes(script)),
      ),
    ).toBe(true);
  });

  test('rode uitvoer komt vóór de ✓/✗-lijst, en de samenvatting als laatste', async () => {
    const rood = scripts[1] ?? '';
    const { tekst } = await draai({ rood: [rood] });

    const uitvoer = tekst.indexOf(`FOUT-UIT ${rood}`);
    const lijst = tekst.indexOf(`✗ ${rood}`);
    const samenvatting = tekst.indexOf('✗ gate:fast rood');
    expect(uitvoer).toBeGreaterThanOrEqual(0);
    expect(uitvoer).toBeLessThan(tekst.indexOf(`✓ ${scripts[0] ?? ''}`));
    expect(uitvoer).toBeLessThan(lijst);
    expect(lijst).toBeLessThan(samenvatting);
    expect(tekst.trimEnd().endsWith(`gate:fast rood: ${rood}`)).toBe(true);
  });

  test('als entrypoint (pad met spatie): elke gate aangeroepen, exitcode 1, samenvatting noemt de rode gate', async () => {
    const map = await mkdtemp(join(tmpdir(), 'gate fast '));
    try {
      const rood = scripts[1] ?? '';
      const log = join(map, 'aanroepen.log');
      const pnpm = join(map, 'pnpm');
      await writeFile(
        pnpm,
        `#!/bin/sh\necho "$1" >> "$GATE_LOG"\nif [ "$1" = "${rood}" ]; then echo "STUB-FOUT $1"; exit 3; fi\necho "ok $1"\n`,
      );
      await chmod(pnpm, 0o755);

      const env = { ...process.env, PATH: `${map}:${process.env.PATH ?? ''}`, GATE_LOG: log };
      const uitslag = { code: 0, stdout: '' };
      try {
        uitslag.stdout = (await promisify(execFile)(process.execPath, ['scripts/kit/gate-fast.mjs'], { env })).stdout;
      } catch (fout) {
        if (typeof fout !== 'object' || fout === null) throw new Error('onverwachte fout', { cause: fout });
        uitslag.code = 'code' in fout && typeof fout.code === 'number' ? fout.code : -1;
        uitslag.stdout = 'stdout' in fout && typeof fout.stdout === 'string' ? fout.stdout : '';
      }
      const aangeroepen = (await readFile(log, 'utf8')).split('\n').filter(Boolean);

      expect([...aangeroepen].sort()).toStrictEqual([...scripts].sort());
      expect(uitslag.code).toBe(1);
      expect(uitslag.stdout).toContain(`✗ gate:fast rood: ${rood}`);
      expect(uitslag.stdout.indexOf('STUB-FOUT')).toBeLessThan(uitslag.stdout.indexOf(`✗ ${rood}`));
      expect(uitslag.stdout.indexOf(`✗ ${rood}`)).toBeLessThan(uitslag.stdout.indexOf('✗ gate:fast rood'));
    } finally {
      await rm(map, { recursive: true, force: true });
    }
  });
});
