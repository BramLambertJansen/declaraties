import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, test } from 'vitest';

// Spec semantische-tokens, deel 3b (status, lagen en beweging): AC-9, AC-13, AC-14 en AC-15. "Tailwind-compilatie" =
// src/web/styles/app.css met compile() uit tailwindcss en de genoemde kandidaten, zoals in semantische-tokens.test.ts (3a).
const root = path.join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const APP_CSS = 'src/web/styles/app.css';

function resolveImport(id: string, base: string): string {
  if (id === 'tailwindcss') return path.join(root, 'node_modules/tailwindcss/index.css');
  if (id.startsWith('tailwindcss/')) return path.join(root, 'node_modules', `${id}.css`.replace(/\.css\.css$/, '.css'));
  return path.join(base, id);
}

async function compileApp(candidates: string[]): Promise<string> {
  const compiler = await compile(read(APP_CSS), {
    base: path.join(root, 'src/web/styles'),
    from: path.join(root, APP_CSS),
    loadStylesheet: async (id, base) => {
      const file = resolveImport(id, base);
      return Promise.resolve({ path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') });
    },
  });
  return compiler.build(candidates);
}

const escape = (value: string) => value.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');

// De declaratieblok(ken) van één klasse in de uitvoer, bijvoorbeeld `.z-toast { … }`.
function rule(output: string, className: string): string | undefined {
  return new RegExp(`(?:^|\\s)\\.${escape(className)}\\s*\\{([^}]*)\\}`, 'm').exec(output)?.[1];
}

function declarations(source: string, selector: string): Map<string, string> {
  const blocks = [...source.matchAll(new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1] ?? '')
    .join('\n');
  return new Map([...blocks.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]));
}

// Verwijst de regel naar het token, rechtstreeks of via een themavariabele van Tailwind die naar het token wijst?
function usesToken(output: string, body: string, token: string): boolean {
  if (body.includes(`var(${token})`)) return true;
  return [...body.matchAll(/var\((--[\w-]+)/g)].some(([, name]) =>
    new RegExp(`${escape(name ?? '')}\\s*:\\s*var\\(${escape(token)}\\)`).test(output),
  );
}

describe('semantische-tokens 3b: status', () => {
  test('semantische-tokens/AC-9: semantic.css definieert de statustokens in licht en donker als var(--p-…), en de statusklassen bestaan', async () => {
    const source = read('src/core/web/styles/semantic.css');
    const expected = {
      light: {
        '--success': 'var(--p-green-700)',
        '--success-foreground': 'var(--p-white)',
        '--warning': 'var(--p-amber-700)',
        '--warning-foreground': 'var(--p-white)',
      },
      dark: {
        '--success': 'var(--p-green-300)',
        '--success-foreground': 'var(--p-zinc-950)',
        '--warning': 'var(--p-amber-300)',
        '--warning-foreground': 'var(--p-zinc-950)',
      },
    };
    const pick = (values: Map<string, string>) =>
      Object.fromEntries(Object.keys(expected.light).map((name) => [name, values.get(name)]));
    expect({
      light: pick(declarations(source, ':root')),
      dark: pick(declarations(source, "[data-theme='dark']")),
    }).toStrictEqual(expected);

    const classes: [string, string][] = [
      ['bg-success', '--success'],
      ['text-success', '--success'],
      ['text-success-foreground', '--success-foreground'],
      ['border-success', '--success'],
      ['bg-warning', '--warning'],
      ['text-warning', '--warning'],
      ['text-warning-foreground', '--warning-foreground'],
      ['border-warning', '--warning'],
    ];
    const output = await compileApp(classes.map(([className]) => className));
    const wrong = classes
      .filter(([className, token]) => !usesToken(output, rule(output, className) ?? '', token))
      .map(([className]) => `${className}: ${(rule(output, className) ?? 'geen regel').trim()}`);
    expect(wrong).toStrictEqual([]);
  });
});

const LAYERS = ['sticky', 'dropdown', 'overlay', 'modal', 'toast'] as const;

describe('semantische-tokens 3b: lagen', () => {
  test('semantische-tokens/AC-13: components.css definieert de vijf lagen strikt oplopend, en z-<laag> gebruikt het token', async () => {
    const values = declarations(read('src/core/web/styles/components.css'), ':root');
    const layers = LAYERS.map((layer) => values.get(`--layer-${layer}`));
    expect(layers).toStrictEqual(['10', '20', '30', '40', '50']);
    const numbers = layers.map(Number);
    expect(numbers.every((value, index) => index === 0 || value > (numbers[index - 1] ?? Infinity))).toBe(true);

    const output = await compileApp(LAYERS.map((layer) => `z-${layer}`));
    const wrong = LAYERS.filter(
      (layer) => !usesToken(output, rule(output, `z-${layer}`) ?? '', `--layer-${layer}`),
    ).map((layer) => `z-${layer}: ${(rule(output, `z-${layer}`) ?? 'geen regel').trim()}`);
    expect(wrong).toStrictEqual([]);
  });
});

describe('semantische-tokens 3b: beweging', () => {
  test('semantische-tokens/AC-14: duur- en easingklassen en transition-colors gebruiken --motion-*; ease-in en ease-in-out bestaan niet', async () => {
    const output = await compileApp([
      'duration-fast',
      'duration-normal',
      'ease-standard',
      'ease-out',
      'transition-colors',
    ]);
    const expected: [string, string][] = [
      ['duration-fast', '--motion-fast'],
      ['duration-normal', '--motion-normal'],
      ['ease-standard', '--motion-ease-standard'],
      ['ease-out', '--motion-ease-out'],
      ['transition-colors', '--motion-fast'],
      ['transition-colors', '--motion-ease-standard'],
    ];
    const wrong = expected
      .filter(([className, token]) => !usesToken(output, rule(output, className) ?? '', token))
      .map(
        ([className, token]) => `${className}: mist ${token} in ${(rule(output, className) ?? 'geen regel').trim()}`,
      );
    expect(wrong).toStrictEqual([]);

    const removed = await compileApp(['ease-in', 'ease-in-out']);
    expect(['ease-in', 'ease-in-out'].filter((className) => rule(removed, className) !== undefined)).toStrictEqual([]);
  });
});

// AC-15: kale getallen en arbitrary values voor laag, duur, easing en vertraging, ook achter een variant (focus:, backdrop:).
const RAW = /(?:^|:)!?-?(?:z-\d|z-\[|duration-\d|duration-\[|ease-\[|delay-\d)/;
const classTokens = (content: string) => content.split(/[\s'"`]+/).filter((token) => token.length > 0);

function walk(dir: string): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(relative) : [relative];
  });
}

describe('semantische-tokens 3b: geen kale lagen of duren in de kit', () => {
  test('semantische-tokens/AC-15: geen z-/duration-/ease-/delay-getal in de kit, wel de tokenklassen op de genoemde plekken', () => {
    expect(
      [
        'focus:z-50',
        'backdrop:duration-200',
        'z-[60]',
        'duration-[250ms]',
        'ease-[cubic-bezier(0,0,1,1)]',
        'delay-75',
      ].filter((token) => !RAW.test(token)),
    ).toStrictEqual([]);
    expect(
      ['z-toast', 'focus:z-toast', 'duration-normal', 'ease-out', '-translate-x-full'].filter((t) => RAW.test(t)),
    ).toStrictEqual([]);

    const files = ['src/core/web/ui', 'src/web/ui', 'src/web/dev']
      .flatMap(walk)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
    expect(files.length).toBeGreaterThan(0);
    const found = files.flatMap((file) =>
      classTokens(read(file))
        .filter((token) => RAW.test(token))
        .map((token) => `${file}: ${token}`),
    );
    expect(found).toStrictEqual([]);

    const required: Record<string, string[]> = {
      'src/core/web/ui/combobox.tsx': ['z-dropdown'],
      'src/core/web/ui/dropdown-menu.tsx': ['z-dropdown'],
      'src/core/web/ui/toast.tsx': ['z-toast'],
      'src/core/web/ui/app-shell.tsx': ['focus:z-toast'],
      'src/core/web/ui/dialog.tsx': ['duration-normal', 'backdrop:duration-normal'],
      'src/web/dev/role-switcher.tsx': ['z-overlay', 'z-modal', 'duration-normal'],
    };
    const missing = Object.entries(required).flatMap(([file, classes]) => {
      const tokens = new Set(classTokens(read(file)));
      return classes.filter((className) => !tokens.has(className)).map((className) => `${file}: mist ${className}`);
    });
    expect(missing).toStrictEqual([]);
  });
});
