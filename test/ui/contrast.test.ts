import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buttonVariantMap } from '../../src/core/web/ui/button-recipe.ts';

// Contrast (framework §7, WCAG 2.2 AA): 4,5:1 voor tekst, 3:1 voor UI-randen en de focusring, in licht én donker, over
// alle variantkaarten van de recepten. Leest de tokens uit de CSS (de enige bron), met het thema van de app erbij.
const read = (file: string) => readFileSync(path.join(import.meta.dirname, '../../src', file), 'utf8');
const css = ['core/web/styles/primitives.css', 'core/web/styles/semantic.css', 'web/styles/theme.css']
  .map(read)
  .join('\n');

type Theme = 'light' | 'dark';

function block(source: string, selector: string): string {
  const pattern = new RegExp(`${selector.replace(/[[\]'()]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
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

function resolve(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new Error(`token ${name} ontbreekt`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference?.[1] === undefined ? value : resolve(values, reference[1]);
}

// OKLCH → lineaire sRGB (Björn Ottosson), geknipt op het sRGB-bereik.
function linearRgb(oklch: string): [number, number, number] {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(oklch);
  if (match === null) throw new Error(`geen oklch(): ${oklch}`);
  const [l, c, h] = [Number(match[1]), Number(match[2]), (Number(match[3]) * Math.PI) / 180];
  const [a, b] = [c * Math.cos(h), c * Math.sin(h)];
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3);
  const [L = 0, M = 0, S = 0] = lms;
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

const ratio = (theme: Theme, fg: string, bg: string) =>
  contrast(resolve(tokens(theme), fg), resolve(tokens(theme), bg));

// Tekst op vlak: elk paar dat een recept of layoutblok gebruikt.
const TEXT_PAIRS: readonly [string, string][] = [
  ['--foreground', '--background'],
  ['--muted-foreground', '--background'],
  ['--muted-foreground', '--muted'],
  ['--card-foreground', '--card'],
  ['--muted-foreground', '--card'],
  ['--popover-foreground', '--popover'],
  ['--accent-foreground', '--accent'],
  ['--destructive', '--background'],
  ['--destructive', '--card'],
  ['--sidebar-foreground', '--sidebar'],
  ['--sidebar-accent-foreground', '--sidebar-accent'],
];

// Elke variant van de Button-variantkaart: tekst en vlak. Een nieuwe variant zonder rij hier laat de test falen.
const BUTTON_PAIRS: Readonly<Record<string, readonly [string, string]>> = {
  primary: ['--primary-foreground', '--primary'],
  secondary: ['--secondary-foreground', '--secondary'],
  outline: ['--foreground', '--background'],
  ghost: ['--foreground', '--background'],
  destructive: ['--destructive-foreground', '--destructive'],
};

// Rand van invoervelden en de focusring: 3:1 tegen de achtergrond (WCAG 1.4.11).
const UI_PAIRS: readonly [string, string][] = [
  ['--input', '--background'],
  ['--input', '--card'],
  ['--ring', '--background'],
  ['--ring', '--card'],
];

describe.each<Theme>(['light', 'dark'])('contrast (%s)', (theme) => {
  test.each(TEXT_PAIRS)('tekst %s op %s ≥ 4,5:1', (fg, bg) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(Object.entries(BUTTON_PAIRS))('Button %s ≥ 4,5:1', (_, [fg, bg]) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(UI_PAIRS)('UI %s op %s ≥ 3:1', (fg, bg) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('de contrasttest zelf', () => {
  test('elke variant van Button heeft een paar in deze test', () => {
    expect(Object.keys(BUTTON_PAIRS).sort()).toStrictEqual(Object.keys(buttonVariantMap.variant).sort());
  });

  test('een bekende foute kleur faalt: zinc-400 op wit haalt 4,5:1 niet', () => {
    expect(contrast(resolve(tokens('light'), '--p-zinc-400'), resolve(tokens('light'), '--p-white'))).toBeLessThan(4.5);
  });

  test('de bekende waarden kloppen: zwart op wit is 21:1', () => {
    expect(contrast('oklch(0 0 0)', 'oklch(1 0 0)')).toBeCloseTo(21, 1);
  });
});

// ui-kit-basics/AC-6: elke tone van StatusBadge (bestaande tokens) haalt 4,5:1, in licht én donker. De tonen komen uit de
// recepttekst zelf, zodat een nieuwe tone zonder voldoende contrast hier faalt.
const badgeTones = [
  ...read('core/web/ui/status-badge.tsx').matchAll(/^\s+(\w+): '(?:[^']*\s)?bg-([\w-]+) text-([\w-]+)'/gm),
].map((match) => [match[1] ?? '', `--${match[3] ?? ''}`, `--${match[2] ?? ''}`] as const);

describe.each<Theme>(['light', 'dark'])('StatusBadge (%s)', (theme) => {
  test('alle drie de tonen zijn gevonden', () => {
    expect(badgeTones.map(([tone]) => tone)).toStrictEqual(['neutral', 'accent', 'destructive']);
  });

  test.each(badgeTones)('tone %s: %s op %s ≥ 4,5:1', (_tone, fg, bg) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
