import path from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { build } from 'vite';
import { describe, expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');

function cspSandbox() {
  const attempts: string[] = [];
  const results: unknown[] = [];
  const context = createContext(
    {
      recordCodeGeneration: (kind: string) => attempts.push(kind),
      reportValidation: (result: unknown) => results.push(result),
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  // Het VM-verbod blijft actief. Tel ook de probes waarvan Zod de EvalError zelf opvangt;
  // een browser meldt juist die gevangen probes nog steeds als CSP-schending.
  runInContext(
    `globalThis.Function = new Proxy(Function, {
      construct(target, args, receiver) {
        recordCodeGeneration('Function');
        return Reflect.construct(target, args, receiver);
      },
      apply(target, receiver, args) {
        recordCodeGeneration('Function');
        return Reflect.apply(target, receiver, args);
      }
    });
    globalThis.eval = new Proxy(eval, {
      apply(target, receiver, args) {
        recordCodeGeneration('eval');
        return Reflect.apply(target, receiver, args);
      }
    });`,
    context,
  );
  return { context, attempts, results };
}

async function productionBundle(): Promise<string> {
  const entry = path.join(root, 'test/ui/zod-csp-fixture-entry.ts');
  const schemas = path.join(root, 'test/ui/zod-csp-fixture-schemas.ts');
  const config = path.join(root, 'src/core/web/lib/zod-config.ts');
  // Virtuele bestanden onder de echte package-grens: dezelfde sideEffects-regels als de SPA.
  // De schema-module initialiseert bij import, zoals de gedeelde contracten van de routes.
  const modules = new Map([
    [
      entry,
      `import ${JSON.stringify(config)};
       import { validation } from ${JSON.stringify(schemas)};
       globalThis.reportValidation(validation);`,
    ],
    [
      schemas,
      `import { z } from 'zod';
       const schema = z.object({ name: z.string().min(1), count: z.number().int() }).strict();
       export const validation = {
         valid: schema.parse({ name: 'Voorbeeld', count: 2 }),
         invalid: schema.safeParse({ name: '', count: 1.5 }).success,
         unknownProperty: schema.safeParse({ name: 'Voorbeeld', count: 2, extra: true }).success
       };`,
    ],
  ]);
  const result = await build({
    root,
    configFile: false,
    mode: 'production',
    logLevel: 'silent',
    plugins: [
      {
        name: 'zod-csp-fixture',
        resolveId: (id) => (modules.has(id) ? id : null),
        load: (id) => modules.get(id),
      },
    ],
    build: {
      write: false,
      minify: true,
      rolldownOptions: { input: entry, output: { format: 'iife' } },
    },
  });
  const outputs = Array.isArray(result) ? result : 'output' in result ? [result] : [];
  const chunks = outputs.flatMap((output) => output.output.filter((chunk) => chunk.type === 'chunk'));
  expect(chunks).toHaveLength(1);
  return chunks.map((chunk) => chunk.code).join('\n');
}

describe('Zod onder de productie-CSP', () => {
  test('de sandbox weigert en registreert Function en eval', () => {
    const sandbox = cspSandbox();

    expect(() => {
      runInContext('new Function("return 1")', sandbox.context);
    }).toThrow(/Code generation/);
    expect(() => {
      runInContext('eval("1")', sandbox.context);
    }).toThrow(/Code generation/);
    expect(sandbox.attempts).toEqual(['Function', 'eval']);
  });

  test('maakt en valideert objectschema’s na de echte bootstrap zonder codegeneratie in een geminificeerde build', async () => {
    const code = await productionBundle();
    const sandbox = cspSandbox();

    runInContext(code, sandbox.context);

    expect(sandbox.results).toEqual([
      { valid: { name: 'Voorbeeld', count: 2 }, invalid: false, unknownProperty: false },
    ]);
    expect(sandbox.attempts).toEqual([]);
  }, 30_000);
});
