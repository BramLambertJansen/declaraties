import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';

// R-CODE-02 (ADR 0068, spec samenhang-checks-rollen/AC-2): cyclomatische complexiteit ≤ 15 met de ESLint-kernregel
// `complexity`. `lintText` past eslint-suppressions.json niet toe: dit is een fixture zonder onderdrukking.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });

async function complexiteit(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-fout').filter((id) => id === 'complexity');
}

/** Een functie met precies `n` als cyclomatische complexiteit: één pad plus `n - 1` losse `if`'s. */
function functieMet(n: number): string {
  const takken = Array.from({ length: n - 1 }, (_, i) => `  if (a === ${String(i)}) b += ${String(i)};`).join('\n');
  return `export function f(a: number): number {\n  let b = 0;\n${takken}\n  return b;\n}\n`;
}

test.each([
  { bestand: 'src/api/x.ts', n: 15, verwacht: [] },
  { bestand: 'src/api/x.ts', n: 16, verwacht: ['complexity'] },
  { bestand: 'scripts/x.mjs', n: 16, verwacht: ['complexity'] },
  { bestand: 'src/api/x.test.ts', n: 16, verwacht: ['complexity'] },
])('samenhang-checks-rollen/AC-2 $bestand met complexiteit $n', async ({ bestand, n, verwacht }) => {
  const code = bestand.endsWith('.mjs') ? functieMet(n).replaceAll(': number', '') : functieMet(n);
  expect(await complexiteit(bestand, code)).toStrictEqual(verwacht);
});

test('samenhang-checks-rollen/AC-2 R-CODE-02 noemt de cyclomatische complexiteit en 0068, niet cognitive-complexity', () => {
  const regel =
    readFileSync('docs/framework.md', 'utf8')
      .split('\n')
      .find((r) => r.startsWith('- **R-CODE-02**')) ?? '';
  expect(regel).toContain('cyclomatische complexiteit 15');
  expect(regel).toContain('`complexity`');
  expect(regel).toContain('0068');
  expect(regel).not.toContain('cognitive');
});
