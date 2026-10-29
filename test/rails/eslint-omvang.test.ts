import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';

// Kleine functies (AGENTS.md, eslint.config.js): de grens faalt net erboven en zwijgt erop; in tests geldt de lengte niet.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });
const SIZE_RULES = new Set(['max-lines-per-function', 'max-params', 'max-depth']);

async function sizeRules(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-fout').filter((id) => SIZE_RULES.has(id));
}

function functionWithLines(lines: number): string {
  return `export function f(): number {\n${Array.from({ length: lines - 3 }, (_, i) => `  const v${String(i)} = ${String(i)};`).join('\n')}\n  return 0;\n}\n`;
}

test.each([
  { name: '.ts: 60 regels mag', file: 'src/api/x.ts', code: functionWithLines(60), expected: [] },
  {
    name: '.ts: 61 regels niet',
    file: 'src/api/x.ts',
    code: functionWithLines(61),
    expected: ['max-lines-per-function'],
  },
  { name: '.tsx: 120 regels mag', file: 'src/web/x.tsx', code: functionWithLines(120), expected: [] },
  {
    name: '.tsx: 121 regels niet',
    file: 'src/web/x.tsx',
    code: functionWithLines(121),
    expected: ['max-lines-per-function'],
  },
  { name: 'test: lengte geldt niet', file: 'src/api/x.test.ts', code: functionWithLines(200), expected: [] },
  {
    name: 'scripts: ook daar',
    file: 'scripts/x.mjs',
    code: functionWithLines(61).replace(': number', ''),
    expected: ['max-lines-per-function'],
  },
])('$name', async ({ file, code, expected }) => {
  expect(await sizeRules(file, code)).toStrictEqual(expected);
});

test('max 3 parameters, ook in tests', async () => {
  const code = 'export const f = (a: number, b: number, c: number, d: number): number => a + b + c + d;\n';

  expect(await sizeRules('src/api/x.ts', code)).toStrictEqual(['max-params']);
  expect(await sizeRules('src/api/x.test.ts', code)).toStrictEqual(['max-params']);
  expect(await sizeRules('src/api/x.ts', code.replace(', d: number', '').replace(' + d', ''))).toStrictEqual([]);
});

test('max diepte 3', async () => {
  const deep =
    'export function f(a: boolean): void {\n  if (a) { if (a) { if (a) { if (a) { console.info(1); } } } }\n}\n';
  const ok = 'export function f(a: boolean): void {\n  if (a) { if (a) { if (a) { console.info(1); } } }\n}\n';

  expect(await sizeRules('src/api/x.ts', deep)).toStrictEqual(['max-depth']);
  expect(await sizeRules('src/api/x.ts', ok)).toStrictEqual([]);
});
