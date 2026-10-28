import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, test } from 'vitest';

// Fixtures voor de rails in eslint.config.js (framework §1.5): elke regel faalt op de overtreding én op bekende
// omzeilingen, en zwijgt op de plek waar het mag. Zonder type-informatie: de rails zijn puur syntactisch.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: [tseslint.configs.disableTypeChecked],
});

async function railsIn(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const ruleIds = result?.messages.map((message) => message.ruleId ?? 'parse-fout') ?? [];
  return ruleIds.filter((id) => id.startsWith('rails/') || id === 'parse-fout');
}

interface Fixture {
  name: string;
  file: string;
  code: string;
  rule: string | null;
}

const fixtures: Fixture[] = [
  // process.env
  { name: 'process.env', file: 'src/api/x.ts', code: 'export const a = process.env.X;', rule: 'rails/process-env' },
  { name: 'bracket', file: 'src/api/x.ts', code: "export const a = process['env'];", rule: 'rails/process-env' },
  {
    name: 'alias',
    file: 'src/api/x.ts',
    code: 'const p = process; export const a = p.env;',
    rule: 'rails/process-env',
  },
  {
    name: 'globalThis bracket',
    file: 'src/api/x.ts',
    code: "export const a = globalThis['process'];",
    rule: 'rails/process-env',
  },
  {
    name: 'node:process',
    file: 'src/api/x.ts',
    code: "export { env } from 'node:process';",
    rule: 'rails/process-env',
  },
  {
    name: 'process in core',
    file: 'src/core/api/x.ts',
    code: 'export const a = process.env;',
    rule: 'rails/process-env',
  },
  { name: 'env.ts mag', file: 'src/core/api/env.ts', code: 'export const a = process.env.X;', rule: null },

  // import.meta.env
  {
    name: 'meta.env',
    file: 'src/web/x.ts',
    code: 'export const a = import.meta.env.MODE;',
    rule: 'rails/import-meta-env',
  },
  {
    name: 'bracket',
    file: 'src/web/x.ts',
    code: "export const a = import.meta['env'];",
    rule: 'rails/import-meta-env',
  },
  {
    name: 'destructuring',
    file: 'src/web/x.ts',
    code: 'const { env } = import.meta; export const a = env;',
    rule: 'rails/import-meta-env',
  },
  {
    name: 'web env.ts mag',
    file: 'src/core/web/lib/env.ts',
    code: 'export const a = import.meta.env.MODE;',
    rule: null,
  },

  // fetch
  { name: 'fetch', file: 'src/web/features/x.ts', code: "void fetch('/api/x');", rule: 'rails/fetch' },
  { name: 'window.fetch', file: 'src/web/x.ts', code: "void window.fetch('/x');", rule: 'rails/fetch' },
  { name: 'bracket', file: 'src/web/x.ts', code: "void globalThis['fetch']('/x');", rule: 'rails/fetch' },
  { name: 'alias', file: 'src/web/x.ts', code: "const f = fetch; void f('/x');", rule: 'rails/fetch' },
  { name: 'XMLHttpRequest', file: 'src/web/x.ts', code: 'export const x = new XMLHttpRequest();', rule: 'rails/fetch' },
  { name: 'core web', file: 'src/core/web/lib/x.ts', code: "void fetch('/x');", rule: 'rails/fetch' },
  { name: 'api-client mag', file: 'src/core/web/lib/api-client.ts', code: "void fetch('/x');", rule: null },

  // rauwe elementen
  { name: '<button>', file: 'src/web/features/x.tsx', code: 'export const x = <button />;', rule: 'rails/elementen' },
  { name: '<a>', file: 'src/web/routes/x.tsx', code: 'export const x = <a href="/">x</a>;', rule: 'rails/elementen' },
  { name: '<dialog>', file: 'src/core/web/lib/x.tsx', code: 'export const x = <dialog />;', rule: 'rails/elementen' },
  {
    name: 'createElement',
    file: 'src/web/x.tsx',
    code: "import { createElement } from 'react'; export const x = createElement('input');",
    rule: 'rails/elementen',
  },
  {
    name: 'React.createElement',
    file: 'src/web/x.tsx',
    code: "import React from 'react'; export const x = React.createElement('select');",
    rule: 'rails/elementen',
  },
  {
    name: 'jsx-runtime',
    file: 'src/web/x.tsx',
    code: "import { jsx } from 'react/jsx-runtime'; export const x = jsx('textarea', {});",
    rule: 'rails/elementen',
  },
  { name: 'ander element mag', file: 'src/web/features/x.tsx', code: 'export const x = <main />;', rule: null },
  { name: 'component mag', file: 'src/web/features/x.tsx', code: 'export const x = <Button />;', rule: null },
  { name: 'web/ui mag', file: 'src/web/ui/x.tsx', code: 'export const x = <button />;', rule: null },
  { name: 'core/ui mag', file: 'src/core/web/ui/x.tsx', code: 'export const x = <input />;', rule: null },

  // SQL: sessielek
  { name: 'SET ROLE', file: 'src/api/x.ts', code: "export const q = 'SET ROLE admin';", rule: 'rails/sql-sessie' },
  { name: 'set role klein', file: 'src/api/x.ts', code: 'export const q = `set   role x`;', rule: 'rails/sql-sessie' },
  {
    name: 'SET SESSION AUTHORIZATION',
    file: 'src/api/x.ts',
    code: "export const q = 'set session authorization x';",
    rule: 'rails/sql-sessie',
  },
  {
    name: 'set_config false, ook in db',
    file: 'src/core/api/db/x.ts',
    code: "export const q = `select set_config('app.user_id', $1, FALSE)`;",
    rule: 'rails/sql-sessie',
  },
  {
    name: 'SET LOCAL ROLE in db mag',
    file: 'src/core/api/db/x.ts',
    code: "export const q = 'SET LOCAL ROLE app_authenticated';",
    rule: null,
  },
  {
    name: 'set_config true in db mag',
    file: 'src/core/api/db/x.ts',
    code: "export const q = `select set_config('app.user_id', $1, true)`;",
    rule: null,
  },

  // SQL: instellingen buiten db
  {
    name: 'set_config buiten db',
    file: 'src/api/domain/x.ts',
    code: "export const q = `select set_config('app.user_id', $1, true)`;",
    rule: 'rails/sql-instellingen',
  },
  {
    name: 'current_setting buiten db',
    file: 'src/core/api/auth/x.ts',
    code: "export const q = 'select current_setting(\\'app.session_strength\\')';",
    rule: 'rails/sql-instellingen',
  },

  // hono buiten core
  { name: 'hono', file: 'src/api/routes/x.ts', code: "import { Hono } from 'hono'; void Hono;", rule: 'rails/hono' },
  {
    name: 'subpad',
    file: 'src/web/x.ts',
    code: "import { hc } from 'hono/client'; void hc;",
    rule: 'rails/hono',
  },
  { name: 're-export', file: 'src/shared/x.ts', code: "export * from 'hono';", rule: 'rails/hono' },
  { name: '@hono', file: 'src/api/x.ts', code: "export { serve } from '@hono/node-server';", rule: 'rails/hono' },
  { name: 'dynamisch', file: 'src/api/x.ts', code: "export const h = import('hono');", rule: 'rails/hono' },
  { name: 'core mag', file: 'src/core/api/http/x.ts', code: "import { Hono } from 'hono'; void Hono;", rule: null },

  // niet-letterlijke import()
  {
    name: 'variabele',
    file: 'src/web/x.ts',
    code: 'const p = "./a.ts"; export const m = import(p);',
    rule: 'rails/import',
  },
  {
    name: 'template',
    file: 'src/api/x.ts',
    code: 'const n = "a"; export const m = import(`./${n}.ts`);',
    rule: 'rails/import',
  },
  { name: 'letterlijk mag', file: 'src/web/x.ts', code: "export const m = import('./a.ts');", rule: null },
  // axe (framework §7): alleen scanAxe, zonder uitzonderingen.
  {
    name: 'eigen AxeBuilder in een spec',
    file: 'e2e/x.spec.ts',
    code: "import AxeBuilder from '@axe-core/playwright'; export const a = AxeBuilder;",
    rule: 'rails/axe-import',
  },
  {
    name: 'axe via dynamische import',
    file: 'e2e/x.spec.ts',
    code: "export const a = import('@axe-core/playwright');",
    rule: 'rails/axe-import',
  },
  {
    name: 'axe-core direct',
    file: 'test/ui/x.test.ts',
    code: "export { default } from '@axe-core/playwright';",
    rule: 'rails/axe-import',
  },
  {
    name: 'scanAxe zelf mag AxeBuilder',
    file: 'e2e/support/axe.ts',
    code: "import AxeBuilder from '@axe-core/playwright'; export const a = AxeBuilder;",
    rule: null,
  },
  {
    name: 'disableRules in scanAxe',
    file: 'e2e/support/axe.ts',
    code: "declare const b: { disableRules(r: string[]): void }; b.disableRules(['color-contrast']);",
    rule: 'rails/axe-uitzondering',
  },
  {
    name: 'exclude in scanAxe',
    file: 'e2e/support/axe.ts',
    code: "declare const b: { exclude(s: string): void }; b.exclude('#x');",
    rule: 'rails/axe-uitzondering',
  },
  {
    name: 'omzeiling met bracket-notatie',
    file: 'e2e/support/axe.ts',
    code: "declare const b: Record<string, (x: string) => void>; const k = 'exclude'; b[k]?.('#x');",
    rule: 'rails/axe-scan',
  },
  {
    name: 'bracket met letterlijke string',
    file: 'e2e/support/axe.ts',
    code: "declare const b: Record<string, (x: string[]) => void>; b['disableRules']?.(['color-contrast']);",
    rule: 'rails/axe-uitzondering',
  },
  {
    name: 'destructuring van disableRules',
    file: 'e2e/support/axe.ts',
    code: "declare const b: { disableRules(r: string[]): void }; const { disableRules } = b; disableRules(['x']);",
    rule: 'rails/axe-uitzondering',
  },
  {
    name: 'disableRules via call in een spec',
    file: 'e2e/x.spec.ts',
    code: "declare const b: { disableRules(r: string[]): void }; b.disableRules.call(b, ['x']);",
    rule: 'rails/axe-uitzondering',
  },
  {
    name: 'eigen axeSource',
    file: 'e2e/support/axe.ts',
    code: "export const o = { axeSource: 'nep' };",
    rule: 'rails/axe-uitzondering',
  },
  {
    name: 're-export van AxeBuilder uit scanAxe',
    file: 'e2e/support/axe.ts',
    code: "export { default as AxeBuilder } from '@axe-core/playwright';",
    rule: 'rails/axe-scan',
  },
];

describe('rails in eslint.config.js', () => {
  test.each(fixtures)('$rule: $name ($file)', async ({ file, code, rule }) => {
    const rules = await railsIn(file, code);

    expect(rules).toStrictEqual(rule === null ? [] : [rule]);
  });
});
