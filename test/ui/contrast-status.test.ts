import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Spec semantische-tokens, deel 3b: contrast van de statustokens (AC-10) en van elke Notice-toon (AC-12), in licht én
// donker, met dezelfde berekening als contrast.test.ts (OKLCH → sRGB → WCAG-luminantie). Een ontbrekend token telt als fout.
const read = (file: string) => readFileSync(path.join(import.meta.dirname, '../../src', file), 'utf8');
const css = ['core/web/styles/primitives.css', 'core/web/styles/semantic.css', 'web/styles/theme.css']
  .map(read)
  .join('\n');

type Theme = 'light' | 'dark';

function block(source: string, selector: string): string {
  const pattern = new RegExp(`${selector.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  return [...source.matchAll(pattern)].map((match) => match[1] ?? '').join('\n');
}

function declarations(source: string): Map<string, string> {
  return new Map([...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]));
}

function tokens(theme: Theme): Map<string, string> {
  const root = declarations(block(css, ':root'));
  if (theme === 'light') return root;
  return new Map([...root, ...declarations(block(css, "[data-theme='dark']"))]);
}

function resolve(values: Map<string, string>, name: string): string | undefined {
  const value = values.get(name);
  const reference = value === undefined ? null : /^var\((--[\w-]+)\)$/.exec(value);
  return reference?.[1] === undefined ? value : resolve(values, reference[1]);
}

function linearRgb(oklch: string): [number, number, number] {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(oklch);
  if (match === null) throw new Error(`geen oklch(): ${oklch}`);
  const [l, c, h] = [Number(match[1]), Number(match[2]), (Number(match[3]) * Math.PI) / 180];
  const [a, b] = [c * Math.cos(h), c * Math.sin(h)];
  const [L = 0, M = 0, S = 0] = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

function contrast(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const [r, g, b] = linearRgb(color);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [high, low] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

// Paren onder 4,5:1, of met een ontbrekend token, als leesbare regels; leeg = goed.
function belowAa(theme: Theme, pairs: readonly (readonly [string, string])[]): string[] {
  const values = tokens(theme);
  return pairs.flatMap(([fg, bg]) => {
    const [foreground, background] = [resolve(values, fg), resolve(values, bg)];
    if (foreground === undefined || background === undefined) return [`${fg} op ${bg}: token ontbreekt`];
    const value = contrast(foreground, background);
    return value >= 4.5 ? [] : [`${fg} op ${bg}: ${value.toFixed(2)}:1`];
  });
}

const STATUS_PAIRS = [
  ['--success', '--background'],
  ['--success', '--card'],
  ['--warning', '--background'],
  ['--warning', '--card'],
  ['--success-foreground', '--success'],
  ['--warning-foreground', '--warning'],
] as const;

// AC-12: de tonen van Notice met hun tekst-/vlakpaar, uit de recepttekst zelf. Een toon zonder bg-/text-kleur geeft geen
// paar en laat de test falen.
const SIZES = new Set(['sm', 'base', 'lg', 'xl', '2xl']);
const toneBlock = /tone:\s*\{([^}]*)\}/.exec(read('core/web/ui/notice.tsx'))?.[1] ?? '';
const noticeTones = [...toneBlock.matchAll(/^\s+(\w+): '([^']*)'/gm)].map((match) => {
  const classes = (match[2] ?? '').split(/\s+/);
  const text = classes.find((c) => c.startsWith('text-') && !SIZES.has(c.slice(5)));
  const surface = classes.find((c) => c.startsWith('bg-'));
  return {
    tone: match[1] ?? '',
    fg: text === undefined ? undefined : `--${text.slice(5)}`,
    bg: surface === undefined ? undefined : `--${surface.slice(3)}`,
  };
});

describe.each<Theme>(['light', 'dark'])('statuscontrast (%s)', (theme) => {
  test(`semantische-tokens/AC-10: success en warning op background en card, en de voorgrond op het vlak ≥ 4,5:1 (${theme})`, () => {
    expect(belowAa(theme, STATUS_PAIRS)).toStrictEqual([]);
  });

  test(`semantische-tokens/AC-12: elke Notice-toon haalt ≥ 4,5:1 (${theme})`, () => {
    expect(noticeTones.map(({ tone }) => tone)).toStrictEqual(['info', 'error', 'success', 'warning']);
    expect(
      noticeTones.filter(({ fg, bg }) => fg === undefined || bg === undefined).map(({ tone }) => tone),
    ).toStrictEqual([]);
    expect(
      belowAa(
        theme,
        noticeTones.map(({ fg, bg }) => [fg ?? '', bg ?? ''] as const),
      ),
    ).toStrictEqual([]);
  });
});

describe('de statuscontrasttest zelf', () => {
  test('semantische-tokens/AC-10: een bekende foute kleur faalt: --p-amber-300 op --p-white haalt 4,5:1 niet', () => {
    expect(belowAa('light', [['--p-amber-300', '--p-white']])).toStrictEqual([
      expect.stringMatching(/^--p-amber-300 op --p-white: \d+\.\d{2}:1$/),
    ]);
  });
});
