import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import ts from 'typescript';

// Acceptatietest lijstpagina/AC-16 (leerpunt #444): het contractsjabloon van pnpm new:resource declareert het cursorbudget
// (`cursorKeys`) voor elke sortering die het meegeeft: 'nieuwste' en 'oudste'.
const SJABLOON = 'scripts/kit/templates/contract.ts.tmpl';

function argumentVanDefineListSearch(): ts.ObjectLiteralExpression | undefined {
  const bron = ts.createSourceFile(SJABLOON, readFileSync(SJABLOON, 'utf8'), ts.ScriptTarget.Latest, true);
  let gevonden: ts.ObjectLiteralExpression | undefined;
  const bezoek = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'defineListSearch') {
      const argument = node.arguments[0];
      if (argument !== undefined && ts.isObjectLiteralExpression(argument)) gevonden = argument;
    }
    ts.forEachChild(node, bezoek);
  };
  bezoek(bron);
  return gevonden;
}

function eigenschap(letterlijk: ts.ObjectLiteralExpression, naam: string): ts.Expression | undefined {
  const gevonden = letterlijk.properties.find(
    (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText().replaceAll("'", '') === naam,
  );
  return gevonden?.initializer;
}

describe('contractsjabloon (lijstpagina/AC-16)', () => {
  test('defineListSearch krijgt cursorKeys met een niet-lege lijst voor nieuwste en oudste', () => {
    const config = argumentVanDefineListSearch();
    expect(config).toBeDefined();
    if (config === undefined) return;

    const cursorKeys = eigenschap(config, 'cursorKeys');
    expect(cursorKeys !== undefined && ts.isObjectLiteralExpression(cursorKeys)).toBe(true);
    if (cursorKeys === undefined || !ts.isObjectLiteralExpression(cursorKeys)) return;

    for (const sortering of ['nieuwste', 'oudste']) {
      const lengtes = eigenschap(cursorKeys, sortering);
      expect(lengtes !== undefined && ts.isArrayLiteralExpression(lengtes), sortering).toBe(true);
      if (lengtes === undefined || !ts.isArrayLiteralExpression(lengtes)) continue;
      expect(lengtes.elements.length, sortering).toBeGreaterThan(0);
    }
  });
});
