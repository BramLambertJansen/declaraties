import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';

// Rails voor data en formulieren in de web-zone (framework §5, §6): elke regel faalt op de overtreding en op bekende
// omzeilingen, en zwijgt waar het mag.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });

async function railsIn(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .map((message) => message.ruleId ?? 'parse-fout')
    .filter((id) => id.startsWith('rails/'));
}

const QUERY = "import { useQuery } from '@tanstack/react-query';\nexport const q = useQuery;\n";

test.each([
  { name: 'useQuery in een scherm', file: 'src/web/features/a/page.tsx', code: QUERY, rule: 'rails/query-hooks' },
  {
    name: 'useMutation in core-web',
    file: 'src/core/web/ui/x.tsx',
    code: "import { useMutation } from '@tanstack/react-query';\nexport const m = useMutation;\n",
    rule: 'rails/query-hooks',
  },
  {
    name: 'omzeiling: namespace-import',
    file: 'src/web/features/a/page.tsx',
    code: "import * as rq from '@tanstack/react-query';\nexport const q = rq.useQuery;\n",
    rule: 'rails/query-hooks',
  },
  {
    name: 'omzeiling: re-export',
    file: 'src/web/lib/x.ts',
    code: "export { useInfiniteQuery } from '@tanstack/react-query';\n",
    rule: 'rails/query-hooks',
  },
  { name: 'mag: in queries.ts', file: 'src/web/features/a/queries.ts', code: QUERY, rule: null },
  { name: 'mag: in een test', file: 'src/web/features/a/page.test.tsx', code: QUERY, rule: null },
  {
    name: 'mag: useQueryClient',
    file: 'src/web/features/a/page.tsx',
    code: "import { useQueryClient } from '@tanstack/react-query';\nexport const c = useQueryClient;\n",
    rule: null,
  },
  {
    name: 'useForm buiten de wrapper',
    file: 'src/web/features/a/form.tsx',
    code: "import { useForm } from 'react-hook-form';\nexport const f = useForm;\n",
    rule: 'rails/use-form',
  },
  {
    name: 'mag: useForm in de wrapper',
    file: 'src/core/web/ui/form.tsx',
    code: "import { useForm } from 'react-hook-form';\nexport const f = useForm;\n",
    rule: null,
  },
  {
    name: 'console.error in queries.ts',
    file: 'src/web/features/a/queries.ts',
    code: "console.error('x');\n",
    rule: 'rails/console-error',
  },
  {
    name: "omzeiling: console['error'] in de API-client",
    file: 'src/core/web/lib/api-client.ts',
    code: "console['error']('x');\n",
    rule: 'rails/console-error',
  },
  { name: 'mag: console.error elders', file: 'src/web/features/a/page.tsx', code: "console.error('x');\n", rule: null },
])('$name', async ({ file, code, rule }) => {
  expect(await railsIn(file, code)).toStrictEqual(rule === null ? [] : [rule]);
});
