import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

// Spec semantische-tokens, deel 3c: `node scripts/kit/feiten.mjs tokens` (AC-18, AC-19). De vorm van de tekst en de JSON
// ligt niet vast; deze test eist alleen wat de spec noemt: per groep een regel per token met klasse, standaard
// (licht/donker) en `bestand:regel`, en dezelfde tokens in `--json`. Een fixture-root is een map met de CSS-bestanden als
// cwd, net als in feiten-adr-history.test.ts; de sectie leest alleen CSS (geen tailwindcss, typescript of catalogus.mjs).
// Dat de importhaak werkt, bewijst test/scripts/feiten-lazy.test.ts (componenten laadt de catalogus wel).
const ROOT = path.join(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/kit/feiten.mjs');
const SEMANTIC = 'src/core/web/styles/semantic.css';
const COMPONENTS = 'src/core/web/styles/components.css';
const INDEX = 'src/core/web/styles/index.css';
const THEME = 'src/web/styles/theme.css';
const GROUPS = ['kleur', 'typografie', 'dichtheid', 'lagen', 'beweging'] as const;
type Group = (typeof GROUPS)[number] | 'onbekend';

const escape = (value: string) => value.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
// Het token zelf, niet een verwijzing ernaar (`var(--x)`) of een langere naam (`--primary-foreground`).
const ownName = (token: string) => new RegExp(`(?<![\\w(-])${escape(token)}(?![\\w-])`);
const hasClass = (line: string, cls: string) => new RegExp(`(?<![\\w-])${escape(cls)}(?![\\w-])`).test(line);

const dir = mkdtempSync(path.join(tmpdir(), 'feiten-tokens-'));
const hook = path.join(dir, 'block-imports.mjs');
writeFileSync(
  hook,
  `import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('/catalogus.mjs')) throw new Error('CATALOGUE_IMPORT');
  if (specifier === 'typescript' || specifier.startsWith('typescript/')) throw new Error('TYPESCRIPT_IMPORT');
  if (specifier === 'tailwindcss' || specifier.startsWith('tailwindcss/')) throw new Error('TAILWIND_IMPORT');
  return nextResolve(specifier, context);
} });
`,
);
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function feiten(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--import', hook, SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// Declaraties van één selector, zoals in test/ui/semantische-tokens.test.ts; waarden over meer regels samengevoegd.
function declarations(source: string, selector: string): Map<string, string> {
  const blocks = [...source.matchAll(new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1] ?? '')
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map(
    [...blocks.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1] ?? '',
      (match[2] ?? '').replace(/\s+/g, ' ').trim(),
    ]),
  );
}

function lineOf(file: string, token: string): number {
  const index = read(file)
    .split('\n')
    .findIndex((line) => new RegExp(`^\\s*${escape(token)}\\s*:`).test(line));
  expect(index, `${token} in ${file}`).toBeGreaterThanOrEqual(0);
  return index + 1;
}

interface Expected {
  readonly token: string;
  readonly group: Group;
  readonly classes: readonly string[];
  readonly file: string;
  readonly light: string;
  readonly dark?: string;
}

const semanticLight = declarations(read(SEMANTIC), ':root');
const semanticDark = declarations(read(SEMANTIC), "[data-theme='dark']");
const layers = declarations(read(COMPONENTS), ':root');

// Een lange standaard (de lettertypestack) hoeft niet volledig in de regel: het eerste deel volstaat.
const shortValue = (value: string) => (value.includes(',') ? (value.split(',')[0] ?? value).trim() : value);

function semantic(token: string, group: Group, classes: readonly string[]): Expected {
  const light = semanticLight.get(token);
  expect(light, `${token} in ${SEMANTIC}`).toBeDefined();
  const dark = semanticDark.get(token);
  return {
    token,
    group,
    classes,
    file: SEMANTIC,
    light: shortValue(light ?? ''),
    ...(dark === undefined || dark === light ? {} : { dark }),
  };
}

// Kleur: elk semantisch token met een `--color-x: var(--x)` in @theme (index.css).
const colorTokens = [...read(INDEX).matchAll(/--color-([\w-]+):\s*var\(--([\w-]+)\)/g)].map((match) => match[2] ?? '');
const SIZES = ['sm', 'base', 'lg', 'xl', '2xl'] as const;
const WEIGHTS = ['normal', 'medium', 'semibold'] as const;

function expectedTokens(): readonly Expected[] {
  return [
    ...colorTokens.map((name) => semantic(`--${name}`, 'kleur', [])),
    semantic('--font-family-sans', 'typografie', ['font-sans']),
    semantic('--font-family-mono', 'typografie', ['font-mono']),
    ...SIZES.flatMap((size) => [
      semantic(`--type-${size}`, 'typografie', [`text-${size}`]),
      semantic(`--type-${size}-leading`, 'typografie', [`text-${size}`]),
    ]),
    ...WEIGHTS.map((weight) => semantic(`--weight-${weight}`, 'typografie', [`font-${weight}`])),
    semantic('--density-control', 'dichtheid', ['min-h-control']),
    semantic('--density-space', 'dichtheid', []),
    semantic('--motion-fast', 'beweging', ['duration-fast']),
    semantic('--motion-normal', 'beweging', ['duration-normal']),
    semantic('--motion-ease-standard', 'beweging', ['ease-standard']),
    semantic('--motion-ease-out', 'beweging', ['ease-out']),
    ...['sticky', 'dropdown', 'overlay', 'modal', 'toast'].map((layer) => ({
      token: `--layer-${layer}`,
      group: 'lagen' as const,
      classes: [`z-${layer}`],
      file: COMPONENTS,
      light: layers.get(`--layer-${layer}`) ?? '(ontbreekt in components.css)',
    })),
  ];
}

// Tekstvorm: de regels na `## tokens`; een groepskop is een regel die (zonder #, - en :) alleen de groepsnaam is.
function tokenLines(stdout: string): { group: string | undefined; line: string }[] {
  const lines = stdout.split('\n');
  const start = lines.findIndex((line) => /^## tokens\b/.test(line));
  expect(start, 'kop "## tokens"').toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  let group: string | undefined;
  return (end === -1 ? rest : rest.slice(0, end)).flatMap((line) => {
    const header = line.replace(/[#:\-\s]/g, '').toLowerCase();
    if ([...GROUPS, 'onbekend'].includes(header)) {
      group = header;
      return [];
    }
    return [{ group, line }];
  });
}

function textEntry(stdout: string, token: string) {
  const matches = tokenLines(stdout).filter(({ line }) => ownName(token).test(line));
  expect(matches.length, `precies één regel voor ${token}`).toBe(1);
  return matches[0] ?? { group: undefined, line: '' };
}

// JSON: het kleinste object (onder tokens.<groep>) met de tokennaam als waarde of sleutel.
function jsonEntries(value: unknown, token: string): string[] {
  if (Array.isArray(value)) return value.flatMap((item: unknown) => jsonEntries(item, token));
  if (typeof value !== 'object' || value === null) return [];
  const entries = Object.entries(value);
  const own = entries.some(([key, content]) => key === token || content === token);
  const nested = entries.flatMap(([, content]) => (typeof content === 'object' ? jsonEntries(content, token) : []));
  return own ? [JSON.stringify(value), ...nested] : nested;
}

function jsonEntry(tokens: unknown, token: string) {
  const out =
    typeof tokens === 'object' && tokens !== null && !Array.isArray(tokens)
      ? Object.entries(tokens).flatMap(([group, content]) =>
          jsonEntries(content, token).map((entry) => ({ group, entry })),
        )
      : [];
  expect(out.length, `precies één JSON-item voor ${token}`).toBe(1);
  return out[0] ?? { group: undefined, entry: '' };
}

function tokensJson(cwd: string): unknown {
  const result = feiten(cwd, 'tokens', '--json');
  expect(result.status, result.stderr).toBe(0);
  const parsed: unknown = JSON.parse(result.stdout);
  expect(parsed).toHaveProperty('tokens');
  return typeof parsed === 'object' && parsed !== null && 'tokens' in parsed ? parsed.tokens : undefined;
}

function expectEntry(text: string, expected: Expected) {
  const label = expected.token;
  const bron = `${expected.file}:${String(lineOf(expected.file, expected.token))}`;
  expect(text, `${label}: standaard (licht)`).toContain(expected.light);
  if (expected.dark !== undefined) expect(text, `${label}: standaard (donker)`).toContain(expected.dark);
  expect(text, `${label}: bron`).toContain(bron);
  for (const cls of expected.classes) expect(hasClass(text, cls), `${label}: klasse ${cls} in ${text}`).toBe(true);
}

describe('semantische-tokens/AC-18', () => {
  test('semantische-tokens/AC-18: elk token per groep met klasse, standaard (licht/donker) en bestand:regel', () => {
    const result = feiten(ROOT, 'tokens');
    expect(result.status, result.stderr).toBe(0);
    const groups = new Set(tokenLines(result.stdout).map(({ group }) => group));
    for (const group of GROUPS) expect(groups.has(group), `groep ${group}`).toBe(true);
    for (const expected of expectedTokens()) {
      const entry = textEntry(result.stdout, expected.token);
      expect(entry.group, `${expected.token}: groep`).toBe(expected.group);
      expectEntry(entry.line, expected);
    }
  });

  test('semantische-tokens/AC-18: voorbeelden uit de spec, --success met bg-success/text-success, --layer-dropdown met z-dropdown', () => {
    const result = feiten(ROOT, 'tokens');
    expect(result.status, result.stderr).toBe(0);
    const success = textEntry(result.stdout, '--success').line;
    expect([hasClass(success, 'bg-success'), hasClass(success, 'text-success')]).toStrictEqual([true, true]);
    expect(success).toContain('var(--p-green-700)');
    expect(success).toContain('var(--p-green-300)');
    const dropdown = textEntry(result.stdout, '--layer-dropdown').line;
    expect(hasClass(dropdown, 'z-dropdown')).toBe(true);
    expect(dropdown).toContain(`${COMPONENTS}:${String(lineOf(COMPONENTS, '--layer-dropdown'))}`);
  });

  test('semantische-tokens/AC-18: --json bevat dezelfde tokens, in dezelfde groep en met dezelfde gegevens', () => {
    const tokens = tokensJson(ROOT);
    for (const group of GROUPS) expect(tokens, `groep ${group}`).toHaveProperty(group);
    for (const expected of expectedTokens()) {
      const entry = jsonEntry(tokens, expected.token);
      expect(entry.group, `${expected.token}: groep`).toBe(expected.group);
      expectEntry(entry.entry, expected);
    }
  });

  test('semantische-tokens/AC-18: een onbekende sectie noemt tokens in "Kies uit"', () => {
    const result = feiten(ROOT, 'onbestaand');
    expect(result.status).toBe(2);
    const choices = /Kies uit: (.+)$/m.exec(result.stderr)?.[1] ?? '';
    expect(choices.split(/,\s*/)).toContain('tokens');
  });
});

describe('semantische-tokens/AC-19', () => {
  const fixture = mkdtempSync(path.join(dir, 'root-'));
  for (const file of [SEMANTIC, COMPONENTS, INDEX, 'src/core/web/styles/primitives.css']) {
    mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(fixture, file));
  }
  const APP_PRIMARY = 'oklch(0.42 0.123 200)';
  const APP_DENSITY = '3.25rem';
  const APP_RADIUS = '0.75rem';
  mkdirSync(path.dirname(path.join(fixture, THEME)), { recursive: true });
  writeFileSync(
    path.join(fixture, THEME),
    `/* fixture */\n:root {\n  --primary: ${APP_PRIMARY};\n  --density-control: ${APP_DENSITY};\n  --radius: ${APP_RADIUS};\n  --primairy: oklch(0.5 0.1 10);\n}\n`,
  );

  test('semantische-tokens/AC-19: de app-waarde uit theme.css staat bij --primary en --density-control', () => {
    const result = feiten(fixture, 'tokens');
    expect(result.status, result.stderr).toBe(0);
    expect(textEntry(result.stdout, '--primary').line).toContain(APP_PRIMARY);
    expect(textEntry(result.stdout, '--density-control').line).toContain(APP_DENSITY);
    expect(textEntry(result.stdout, '--primary-foreground').line).not.toContain(APP_PRIMARY);
    const tokens = tokensJson(fixture);
    expect(jsonEntry(tokens, '--primary').entry).toContain(APP_PRIMARY);
    expect(jsonEntry(tokens, '--density-control').entry).toContain(APP_DENSITY);
  });

  test('semantische-tokens/AC-19: een bekend token zonder groep (--radius) staat met de app-waarde onder overig', () => {
    const result = feiten(fixture, 'tokens');
    expect(result.status, result.stderr).toBe(0);
    const line = textEntry(result.stdout, '--radius').line;
    expect(line).toContain(APP_RADIUS);
    expect(line).toContain(`${THEME}:5`);
    const entry = jsonEntry(tokensJson(fixture), '--radius');
    expect(entry.group).toBe('overig');
    expect(entry.entry).toContain(APP_RADIUS);
  });

  test('semantische-tokens/AC-19: --primairy (niet in semantic.css) staat onder onbekend', () => {
    const result = feiten(fixture, 'tokens');
    expect(result.status, result.stderr).toBe(0);
    expect(textEntry(result.stdout, '--primairy').group).toBe('onbekend');
    expect(jsonEntry(tokensJson(fixture), '--primairy').group).toBe('onbekend');
  });

  test('semantische-tokens/AC-19: tokens importeert geen tailwindcss, typescript of catalogus.mjs', () => {
    const result = feiten(ROOT, 'tokens', '--json');
    expect(result.stderr).not.toContain('CATALOGUE_IMPORT');
    expect(result.stderr).not.toContain('TYPESCRIPT_IMPORT');
    expect(result.stderr).not.toContain('TAILWIND_IMPORT');
    expect(result.status, result.stderr).toBe(0);
  });
});
