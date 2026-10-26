// Eén geheugengrens voor lokale belasting: gate:fast (scripts/kit/gate-fast.mjs) laat lint en tests dan na elkaar draaien,
// Playwright (playwright.config.ts) dan met één worker. Alleen de planning verandert, nooit welke check draait.
import os from 'node:os';

const GIB = 1024 ** 3;

/**
 * Weinig geheugen? `GATE_WEINIG_GEHEUGEN=1|0` beslist voor de host; anders een host met hooguit 8 GiB RAM, of minder dan
 * 6 GiB beschikbaar. Die meting verschilt per platform: op macOS telt libuv alleen vrije pagina's (geen inactieve of
 * cache), dus is `availableMemory()` daar structureel laag en telt alleen het totaal.
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
  return totaal <= 8 * GIB || (platform !== 'darwin' && beschikbaar < 6 * GIB);
}
