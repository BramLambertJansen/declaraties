// Eén geheugengrens voor lokale belasting: gate:fast (scripts/kit/gate-fast.mjs) laat lint en tests dan na elkaar draaien,
// Playwright (playwright.config.ts) dan met één worker. Alleen de planning verandert, nooit welke check draait.
import os from 'node:os';

const GIB = 1024 ** 3;

/**
 * Weinig geheugen? `GATE_WEINIG_GEHEUGEN=1|0` beslist voor de host; anders minder dan 6 GiB beschikbaar. Op macOS telt
 * libuv alleen vrije pagina's (geen inactieve of cache), dus is `availableMemory()` daar structureel laag; daar telt een
 * totaal van hooguit 8 GiB als weinig. Elders geen totaalgrens: een CI-runner met 8 GB blijft parallel.
 * @param {{ override?: string, totaal?: number, beschikbaar?: number, platform?: string }} [meting]
 */
export function weinigGeheugen({
  override = process.env['GATE_WEINIG_GEHEUGEN'],
  totaal = os.totalmem(),
  beschikbaar = process.availableMemory(),
  platform = process.platform,
} = {}) {
  if (override === '1') return true;
  if (override === '0') return false;
  return platform === 'darwin' ? totaal <= 8 * GIB : beschikbaar < 6 * GIB;
}
