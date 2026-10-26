import { expect, test } from 'vitest';
import { weinigGeheugen } from '../../scripts/kit/geheugen.mjs';

const GIB = 1024 ** 3;
// Een lege override telt als geen override, los van GATE_WEINIG_GEHEUGEN in de omgeving van de testrun.
const ruim = { override: '', totaal: 32 * GIB, beschikbaar: 16 * GIB, platform: 'linux' };

test('ruime host: geen beperking', () => {
  expect(weinigGeheugen(ruim)).toBe(false);
});

test.each([
  { override: '1', verwacht: true, meting: ruim },
  { override: '0', verwacht: false, meting: { ...ruim, totaal: 4 * GIB, beschikbaar: 1 * GIB } },
])('GATE_WEINIG_GEHEUGEN=$override wint van de meting', ({ override, verwacht, meting }) => {
  expect(weinigGeheugen({ ...meting, override })).toBe(verwacht);
});

test.each([
  { totaal: 8 * GIB, verwacht: true },
  { totaal: 8 * GIB + 1, verwacht: false },
])('macOS met totaal $totaal: tot en met 8 GiB is weinig', ({ totaal, verwacht }) => {
  expect(weinigGeheugen({ ...ruim, totaal, platform: 'darwin' })).toBe(verwacht);
});

test.each(['linux', 'win32'])(
  '%s met 8 GiB totaal en genoeg beschikbaar: geen beperking (CI-runner blijft parallel)',
  (platform) => {
    expect(weinigGeheugen({ ...ruim, totaal: 8 * GIB, beschikbaar: 6 * GIB, platform })).toBe(false);
  },
);

test.each([
  { platform: 'linux', verwacht: true },
  { platform: 'win32', verwacht: true },
  { platform: 'darwin', verwacht: false },
])('minder dan 6 GiB beschikbaar op $platform: weinig behalve op macOS', ({ platform, verwacht }) => {
  expect(weinigGeheugen({ ...ruim, beschikbaar: 6 * GIB - 1, platform })).toBe(verwacht);
});

test('macOS met hooguit 8 GiB totaal: toch weinig', () => {
  expect(weinigGeheugen({ ...ruim, totaal: 8 * GIB, beschikbaar: GIB, platform: 'darwin' })).toBe(true);
});
