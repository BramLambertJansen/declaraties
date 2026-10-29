import { describe, expect, test } from 'vitest';
import { describeDevice } from './user-agent.ts';

// Spec eigen-account: korte omschrijving van het apparaat uit de user-agent ("Firefox op Windows"), zonder dependency.
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const CHROME_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

describe('describeDevice', () => {
  test.each([
    ['Firefox op Windows', FIREFOX_WINDOWS, 'Firefox op Windows'],
    ['Chrome op Windows', CHROME_WINDOWS, 'Chrome op Windows'],
    ['Edge (bevat ook "Chrome" en "Safari") op Windows', EDGE_WINDOWS, 'Edge op Windows'],
    ['Safari op macOS (bevat geen "Chrome")', SAFARI_MAC, 'Safari op macOS'],
    ['Chrome op macOS (bevat ook "Safari")', CHROME_MAC, 'Chrome op macOS'],
    ['Firefox op Linux', FIREFOX_LINUX, 'Firefox op Linux'],
    ['Chrome op Linux', CHROME_LINUX, 'Chrome op Linux'],
    ['Safari op iOS (iPhone)', SAFARI_IPHONE, 'Safari op iOS'],
    ['Chrome op Android (bevat ook "Linux")', CHROME_ANDROID, 'Chrome op Android'],
  ])('%s', (_, userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['leeg', ''],
    ['alleen spaties', '   '],
    ['een script (curl)', 'curl/8.4.0'],
    ['onzin', 'xyz'],
  ])('%s: "Onbekend apparaat"', (_, userAgent) => {
    expect(describeDevice(userAgent)).toBe('Onbekend apparaat');
  });

  test('een zeer lange of vijandige user-agent geeft een korte omschrijving zonder te crashen', () => {
    const hostile = `${'(((<script>'.repeat(5000)} Firefox/1 Windows`;
    const result = describeDevice(hostile);

    expect(result.length).toBeLessThanOrEqual(60);
    expect(result).not.toContain('<');
  });
});
