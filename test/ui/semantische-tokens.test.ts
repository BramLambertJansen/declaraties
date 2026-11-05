import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, test } from 'vitest';

// Spec semantische-tokens, deel 3a (typografie en dichtheid). "Tailwind-compilatie" = src/web/styles/app.css met
// compile() uit tailwindcss en de genoemde kandidaten; imports lossen we zelf op, zodat een fixture-thema theme.css
// kan vervangen (AC-4). AC-7 is de lettertypeguard als pure functie, op de echte bron en op vier foute fixtures.
const root = path.join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const APP_CSS = 'src/web/styles/app.css';
const THEME_CSS = path.join(root, 'src/web/styles/theme.css');

function resolveImport(id: string, base: string): string {
  if (id === 'tailwindcss') return path.join(root, 'node_modules/tailwindcss/index.css');
  if (id.startsWith('tailwindcss/')) return path.join(root, 'node_modules', `${id}.css`.replace(/\.css\.css$/, '.css'));
  return path.join(base, id);
}

async function compileApp(candidates: string[], theme?: string): Promise<string> {
  const compiler = await compile(read(APP_CSS), {
    base: path.join(root, 'src/web/styles'),
    from: path.join(root, APP_CSS),
    loadStylesheet: async (id, base) => {
      const file = resolveImport(id, base);
      const content = theme !== undefined && file === THEME_CSS ? theme : readFileSync(file, 'utf8');
      return Promise.resolve({ path: file, base: path.dirname(file), content });
    },
  });
  return compiler.build(candidates);
}

// De declaratieblok(ken) van één klasse in de uitvoer, bijvoorbeeld `.text-sm { … }`.
function rule(output: string, className: string): string | undefined {
  const pattern = new RegExp(`(?:^|\\s)\\.${className.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm');
  return pattern.exec(output)?.[1];
}

function rootDeclarations(source: string): Map<string, string> {
  const blocks = [...source.matchAll(/:root\s*\{([^}]*)\}/g)].map((match) => match[1] ?? '').join('\n');
  return new Map([...blocks.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]));
}

describe('semantische-tokens 3a: typografie', () => {
  test('semantische-tokens/AC-1: font-, text- en gewichtklassen verwijzen naar de semantische tokens', async () => {
    const output = await compileApp([
      'font-sans',
      'font-mono',
      'text-sm',
      'text-base',
      'text-lg',
      'text-xl',
      'text-2xl',
      'font-normal',
      'font-medium',
      'font-semibold',
    ]);
    const expected: [string, string[]][] = [
      ['font-sans', ['var(--font-family-sans)']],
      ['font-mono', ['var(--font-family-mono)']],
      ...['sm', 'base', 'lg', 'xl', '2xl'].map((size): [string, string[]] => [
        `text-${size}`,
        [`var(--type-${size})`, `var(--type-${size}-leading)`],
      ]),
      ...['normal', 'medium', 'semibold'].map((weight): [string, string[]] => [
        `font-${weight}`,
        [`var(--weight-${weight})`],
      ]),
    ];
    const missing = expected.flatMap(([className, references]) => {
      const body = rule(output, className);
      if (body === undefined) return [`${className}: geen regel`];
      return references.filter((reference) => !body.includes(reference)).map((ref) => `${className}: mist ${ref}`);
    });
    expect(missing).toStrictEqual([]);
  });

  test('semantische-tokens/AC-2: text-xs, text-3xl, text-9xl, font-bold, font-light, font-thin en font-serif bestaan niet', async () => {
    const removed = ['text-xs', 'text-3xl', 'text-9xl', 'font-bold', 'font-light', 'font-thin', 'font-serif'];
    const output = await compileApp(removed);
    expect(removed.filter((className) => rule(output, className) !== undefined)).toStrictEqual([]);

    const theme = /@theme\s+inline\s*\{([^}]*)\}/.exec(read('src/core/web/styles/index.css'))?.[1] ?? '';
    const resets = ['--font-*: initial;', '--font-weight-*: initial;', '--text-*: initial;'];
    expect(resets.filter((reset) => !theme.includes(reset))).toStrictEqual([]);
  });

  test('semantische-tokens/AC-3: semantic.css definieert in :root lettertype, tekstschaal, gewicht en dichtheid met de standaard uit de spec', () => {
    const expected: Record<string, string> = {
      '--font-family-sans':
        "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
      '--font-family-mono':
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      '--type-sm': '0.875rem',
      '--type-sm-leading': '1.25rem',
      '--type-base': '1rem',
      '--type-base-leading': '1.5rem',
      '--type-lg': '1.125rem',
      '--type-lg-leading': '1.75rem',
      '--type-xl': '1.25rem',
      '--type-xl-leading': '1.75rem',
      '--type-2xl': '1.5rem',
      '--type-2xl-leading': '2rem',
      '--weight-normal': '400',
      '--weight-medium': '500',
      '--weight-semibold': '600',
      '--density-control': '2.75rem',
      '--density-space': '0.25rem',
    };
    const actual = rootDeclarations(read('src/core/web/styles/semantic.css'));
    expect(Object.fromEntries(Object.keys(expected).map((name) => [name, actual.get(name)]))).toStrictEqual(expected);
  });

  test('semantische-tokens/AC-4: theme.css komt na de core-index en een fixture-thema wint van semantic.css', async () => {
    const imports = [...read(APP_CSS).matchAll(/@import\s+'([^']+)'/g)].map((match) => match[1]);
    expect(imports.indexOf('./theme.css')).toBeGreaterThan(imports.indexOf('../../core/web/styles/index.css'));
    expect(imports.indexOf('../../core/web/styles/index.css')).toBeGreaterThanOrEqual(0);

    const fixture = ":root { --font-family-sans: 'Voorbeeld', sans-serif; --type-base: 1.0625rem; }";
    const output = await compileApp([], fixture);
    for (const [name, appValue] of [
      ['--font-family-sans', "'Voorbeeld', sans-serif"],
      ['--type-base', '1.0625rem'],
    ] as const) {
      const declarations = [...output.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g'))].map((m) => ({
        value: (m[1] ?? '').trim(),
        index: m.index,
      }));
      const core = declarations.find((declaration) => declaration.value !== appValue);
      const app = declarations.find((declaration) => declaration.value === appValue);
      expect({ name, core: core !== undefined, app: app !== undefined }).toStrictEqual({ name, core: true, app: true });
      expect(app?.index ?? -1).toBeGreaterThan(core?.index ?? Number.POSITIVE_INFINITY);
    }
  });
});

describe('semantische-tokens 3a: dichtheid', () => {
  test('semantische-tokens/AC-5: p-4 en gap-2 rekenen met --density-space, min-h-control met --control-h', async () => {
    const output = await compileApp(['p-4', 'gap-2', 'min-h-control']);
    const expected: [string, string][] = [
      ['p-4', 'calc(var(--density-space) * 4)'],
      ['gap-2', 'calc(var(--density-space) * 2)'],
      ['min-h-control', 'var(--control-h)'],
    ];
    const wrong = expected
      .filter(([className, value]) => !(rule(output, className) ?? '').includes(value))
      .map(([className]) => `${className}: ${(rule(output, className) ?? 'geen regel').trim()}`);
    expect(wrong).toStrictEqual([]);
    expect(rootDeclarations(read('src/core/web/styles/components.css')).get('--control-h')).toBe(
      'max(var(--density-control), 2.75rem)',
    );
  });
});

// AC-7: de lettertypeguard. Pure functie op CSS-bestanden (pad → inhoud) en bestandsnamen in de fontmap.
type FontInput = { css: Map<string, string>; fontFiles: string[] };

const EXTERNAL_URL = /url\(\s*['"]?\s*(?:https?:|\/\/)/i;

function fontFaceSources(content: string): string[] {
  return [...content.matchAll(/@font-face\s*\{([^}]*)\}/g)].flatMap((face) => {
    const src = /(?:^|[;\s{])src\s*:([^;]+)/.exec(face[1] ?? '')?.[1] ?? '';
    return [...src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((url) => (url[1] ?? '').trim());
  });
}

function fontGuard({ css, fontFiles }: FontInput): string[] {
  const problems: string[] = [];
  for (const [file, content] of css) {
    if (/@import\s+(?:url\(|['"](?:[a-z]+:|\/\/))/i.test(content)) problems.push(`${file}: externe @import`);
    if (EXTERNAL_URL.test(content)) problems.push(`${file}: externe url()`);
    for (const url of fontFaceSources(content))
      if (/^(?:[a-z]+:|\/)/i.test(url) || !url.endsWith('.woff2')) problems.push(`${file}: @font-face src ${url}`);
  }
  const byDir = new Map<string, string[]>();
  for (const file of fontFiles) byDir.set(path.dirname(file), [...(byDir.get(path.dirname(file)) ?? []), file]);
  for (const [dir, files] of byDir) {
    const licensed = files.some((file) => /^(?:LICENSE|OFL)/.test(path.basename(file)));
    for (const font of files.filter((file) => file.endsWith('.woff2')))
      if (!licensed) problems.push(`${font}: geen LICENSE*/OFL* in ${dir}`);
  }
  return problems;
}

function walk(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(relative) : [relative];
  });
}

describe('semantische-tokens 3a: lettertypen', () => {
  test('semantische-tokens/AC-7: lettertypeguard is schoon op src/**/*.css en src/web/styles/fonts/, en faalt op vier fixtures', () => {
    const css = new Map(
      walk('src')
        .filter((file) => file.endsWith('.css'))
        .map((file) => [file, read(file)]),
    );
    expect(css.size).toBeGreaterThan(0);
    expect(fontGuard({ css, fontFiles: walk('src/web/styles/fonts') })).toStrictEqual([]);

    const fixtures: Record<string, FontInput> = {
      'extern lettertype': {
        css: new Map([
          [
            'theme.css',
            "@font-face { font-family: 'Voorbeeld'; src: url('https://fonts.gstatic.com/s/voorbeeld.woff2') format('woff2'); }",
          ],
        ]),
        fontFiles: [],
      },
      'CDN-import': {
        css: new Map([['theme.css', "@import url('https://fonts.googleapis.com/css2?family=Voorbeeld');"]]),
        fontFiles: [],
      },
      'CDN-import zonder url()': {
        css: new Map([['theme.css', "@import 'https://fonts.googleapis.com/css2?family=Voorbeeld';"]]),
        fontFiles: [],
      },
      'woff2 zonder licentie': {
        css: new Map([
          [
            'theme.css',
            "@font-face { font-family: 'Voorbeeld'; src: url('./fonts/voorbeeld.woff2') format('woff2'); }",
          ],
        ]),
        fontFiles: ['src/web/styles/fonts/voorbeeld.woff2'],
      },
    };
    const failing = Object.entries(fixtures)
      .filter(([, input]) => fontGuard(input).length > 0)
      .map(([name]) => name);
    expect(failing).toStrictEqual(Object.keys(fixtures));
    expect(
      fontGuard({
        css: fixtures['woff2 zonder licentie']?.css ?? new Map<string, string>(),
        fontFiles: ['src/web/styles/fonts/voorbeeld.woff2', 'src/web/styles/fonts/OFL.txt'],
      }),
    ).toStrictEqual([]);

    // De CSP blijft zonder font-src: lettertypen komen alleen uit de eigen build (default-src 'self').
    expect(read('src/core/api/http/security-headers.ts')).not.toMatch(/font-src/);
  });
});
