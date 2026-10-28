import { readFileSync } from 'node:fs';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, test } from 'vitest';

// Rail rails/klassen (docs/specs/klassenrail.md): de melding en de huidige code. De fixtures per verboden vorm staan in
// test/rails/eslint.test.ts.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });

async function klassenMeldingen(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'rails/klassen').map((m) => m.message);
}

describe('rails/klassen', () => {
  // klassenrail/AC-10: de melding wijst de componentenlijst en framework §7 aan.
  test('klassenrail/AC-10: melding noemt feiten.mjs componenten en framework §7', async () => {
    const meldingen = await klassenMeldingen('src/web/features/x.tsx', 'export const x = <div className="text-sm" />;');

    expect(meldingen).toHaveLength(1);
    expect(meldingen[0]).toContain('node scripts/kit/feiten.mjs componenten');
    expect(meldingen[0]).toContain('framework §7');
  });

  test('klassenrail/AC-10: melding is letterlijk die uit de spec', async () => {
    const meldingen = await klassenMeldingen('src/web/routes/x.tsx', 'export const x = <div style={{}} />;');

    expect(meldingen).toStrictEqual([
      "In features/ en routes/ alleen layout-klassen als gewone string (flex, grid, gap, padding, breedte); kleur, " +
        'typografie, rand, schaduw, arbitrary values, `!`, `dark:` en `style` komen uit componenten. Gebruik `Text`, ' +
        "`Heading`, `Stack` of `Inline` uit '#web/ui/…' (lijst: `node scripts/kit/feiten.mjs componenten`). Past er " +
        'geen, stel dan een variant voor (framework §7).',
    ]);
  });

  // klassenrail/AC-9: de rail staat in de config en de huidige code krijgt geen onderdrukking voor rails/klassen.
  test('klassenrail/AC-9: geen onderdrukking voor rails/klassen in eslint-suppressions.json', () => {
    let suppressions = '{}';
    try {
      suppressions = readFileSync('eslint-suppressions.json', 'utf8');
    } catch {
      // Zonder bestand zijn er geen onderdrukkingen.
    }

    expect(suppressions).not.toContain('rails/klassen');
  });

  test('klassenrail/AC-9: huidige features/ en routes/ zonder melding van rails/klassen', async () => {
    const results = await eslint.lintFiles(['src/web/features/**/*.{ts,tsx}', 'src/web/routes/**/*.{ts,tsx}']);
    const schendingen = results.flatMap((r) =>
      r.messages.filter((m) => m.ruleId === 'rails/klassen').map((m) => `${r.filePath}:${String(m.line)}`),
    );

    expect(results.length).toBeGreaterThan(0);
    expect(schendingen).toStrictEqual([]);
  }, 60_000);
});
