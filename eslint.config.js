import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import tseslint from 'typescript-eslint';

// Rails (framework §2, §4, §7): elke regel een eigen alias van no-restricted-syntax, zodat elke regel zijn eigen
// bestandsbereik heeft (één no-restricted-syntax per bestand zou elkaar overschrijven). De melding noemt de juiste helper.
// Elke regel heeft fixtures in test/rails/eslint.test.ts, ook voor bekende omzeilingen.
const restrictedSyntax = builtinRules.get('no-restricted-syntax');
const ruleNames = [
  'process-env',
  'import-meta-env',
  'fetch',
  'elementen',
  'sql-sessie',
  'sql-instellingen',
  'hono',
  'import',
  'query-hooks',
  'use-form',
  'console-error',
  'axe-import',
  'axe-uitzondering',
  'axe-scan',
];
const rails = { rules: Object.fromEntries(ruleNames.map((name) => [name, restrictedSyntax])) };

const SRC = ['src/**/*.{ts,tsx}'];
const CODE = [
  'src/**/*.{ts,tsx,mjs}',
  'scripts/**/*.{mjs,js,ts}',
  'rails/hooks/**/*.mjs',
  '.claude/hooks/**/*.mjs',
  'test/**/*.ts',
  'e2e/**/*.ts',
];
const TESTS = ['**/*.test.{ts,tsx}', '**/*.spec.ts', 'test/**/*.ts', 'e2e/**/*.ts'];
const WEB = ['src/web/**/*.{ts,tsx}', 'src/core/web/**/*.{ts,tsx}'];
const AXE_UITZONDERING = '/^(disableRules|exclude|include|options|withRules|setLegacyMode|disableFrameSandbox)$/';
const ELEMENTS = '/^(button|input|select|textarea|dialog|a)$/';
const IMPORTS = ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].join(', ');

function fromModule(sourceRegex) {
  return `:matches(${IMPORTS})[source.value=${sourceRegex}]`;
}

function restrict(rule, files, ignores, message, selectors) {
  return {
    files,
    ignores,
    plugins: { rails },
    rules: { [`rails/${rule}`]: ['error', ...selectors.map((selector) => ({ selector, message }))] },
  };
}

const railConfigs = [
  restrict(
    'query-hooks',
    WEB,
    ['**/queries.ts', '**/*.test.{ts,tsx}'],
    'useQuery/useMutation alleen in features/<resource>/queries.ts (framework §5): roep daar een hook aan.',
    [
      "ImportDeclaration[source.value='@tanstack/react-query'] > ImportSpecifier[imported.name=/^use(Suspense)?(Query|Queries|InfiniteQuery|Mutation)$/]",
      "ImportDeclaration[source.value='@tanstack/react-query'] > ImportNamespaceSpecifier",
      "ExportNamedDeclaration[source.value='@tanstack/react-query'] > ExportSpecifier[local.name=/^use(Suspense)?(Query|Queries|InfiniteQuery|Mutation)$/]",
    ],
  ),
  restrict(
    'use-form',
    WEB,
    ['src/core/web/ui/form.tsx', '**/*.test.{ts,tsx}'],
    "Formulieren via <Form> en useZodForm uit '#web/ui/index.ts' (framework §5), niet useForm zelf.",
    [
      "ImportDeclaration[source.value='react-hook-form'] > ImportSpecifier[imported.name='useForm']",
      "ImportDeclaration[source.value='react-hook-form'] > ImportNamespaceSpecifier",
    ],
  ),
  restrict(
    'console-error',
    ['src/**/queries.ts', 'src/core/web/lib/api-client.ts', 'src/web/lib/api.ts'],
    [],
    'Geen kale console.error in queries.ts of de API-client (framework §6): een fout gaat als ApiError naar AsyncView/Form.',
    [
      "CallExpression > MemberExpression.callee[object.name='console'][property.name='error']",
      "CallExpression > MemberExpression.callee[object.name='console'][computed=true]",
    ],
  ),
  restrict(
    'process-env',
    SRC,
    ['src/core/api/env.ts'],
    "process.env alleen in src/core/api/env.ts: importeer `env` uit '#core/api/env.ts' (framework §4).",
    [
      "Identifier[name='process']",
      "MemberExpression[computed=true] > Literal.property[value='process']",
      fromModule('/^(node:)?process$/'),
    ],
  ),
  restrict(
    'import-meta-env',
    SRC,
    ['src/core/web/lib/env.ts'],
    'import.meta.env alleen in src/core/web/lib/env.ts: importeer de waarde daaruit (framework §4).',
    [
      "MemberExpression[object.type='MetaProperty'][property.name='env']",
      "MemberExpression[object.type='MetaProperty'][computed=true]",
      "VariableDeclarator[init.type='MetaProperty']",
    ],
  ),
  restrict(
    'fetch',
    WEB,
    ['src/core/web/lib/api-client.ts'],
    "Netwerkverkeer alleen via de API-client: gebruik `api` uit '#web/lib/api.ts' (framework §5).",
    [
      'Identifier[name=/^(fetch|XMLHttpRequest|EventSource|WebSocket|sendBeacon)$/]',
      'MemberExpression[computed=true] > Literal.property[value=/^(fetch|XMLHttpRequest|EventSource|WebSocket|sendBeacon)$/]',
    ],
  ),
  restrict(
    'elementen',
    WEB,
    ['src/core/web/ui/**', 'src/web/ui/**'],
    'Geen rauw <button>, <input>, <select>, <textarea>, <dialog> of <a> buiten de UI-kit: gebruik een component uit ' +
      "'#web/ui/…' (lijst: `node scripts/kit/feiten.mjs componenten`). Past er geen, stel dan een variant voor (framework §7).",
    [
      `JSXOpeningElement[name.name=${ELEMENTS}]`,
      `CallExpression[callee.name='createElement'][arguments.0.value=${ELEMENTS}]`,
      `CallExpression[callee.property.name='createElement'][arguments.0.value=${ELEMENTS}]`,
      fromModule('/^react\\/jsx(-dev)?-runtime$/'),
    ],
  ),
  restrict(
    'sql-sessie',
    SRC,
    [],
    'Nooit SET ROLE, SET SESSION AUTHORIZATION of set_config(…, false): op een gedeelde verbinding lekt dat naar de ' +
      "volgende gebruiker. Gebruik withUser() uit src/core/api/db (framework §4, 'Geen sessielek').",
    [
      'Literal[value=/\\bset\\s+(session\\s+)?(role|authorization)\\b/i]',
      'TemplateElement[value.raw=/\\bset\\s+(session\\s+)?(role|authorization)\\b/i]',
      'Literal[value=/set_config\\s*\\([^)]*,\\s*false\\s*\\)/i]',
      'TemplateElement[value.raw=/set_config\\s*\\([^)]*,\\s*false\\s*\\)/i]',
    ],
  ),
  restrict(
    'sql-instellingen',
    SRC,
    ['src/core/api/db/**'],
    'set_config en current_setting alleen in src/core/api/db: anders kan een query een andere gebruiker of MFA ' +
      'voorwenden. Gebruik ctx.actor (framework §4).',
    [
      'Literal[value=/\\b(set_config|current_setting)\\b/i]',
      'TemplateElement[value.raw=/\\b(set_config|current_setting)\\b/i]',
    ],
  ),
  restrict(
    'hono',
    SRC,
    ['src/core/**'],
    'Hono alleen in src/core: een route ontstaat via defineRoute(), de app via createApp() (ADR 0040).',
    [fromModule('/^(hono|@hono\\/[^/]+)(\\/|$)/')],
  ),
  restrict(
    'import',
    SRC,
    [],
    "Alleen import('letterlijk pad'): een berekend pad ziet dependency-cruiser niet, dus ook de lagenregels niet.",
    ["ImportExpression[source.type!='Literal']"],
  ),
  // Toegankelijkheid (framework §7, roadmap 3c): één axe-scan zonder uitzonderingen. Een regel of element uitzetten moet
  // zichtbaar een gate-wijziging zijn, geen regel in een test.
  restrict(
    'axe-import',
    CODE,
    ['e2e/support/axe.ts'],
    'Scan met scanAxe uit e2e/support/axe.ts (framework §7); een eigen AxeBuilder kan regels of elementen overslaan.',
    [fromModule('/^@axe-core\\//')],
  ),
  restrict(
    'axe-uitzondering',
    ['e2e/**/*.ts'],
    [],
    'Geen uitzonderingen in scanAxe (framework §7): los de toegankelijkheidsfout op; een uitzondering vraagt een ADR van de eigenaar.',
    [
      `MemberExpression[property.name=${AXE_UITZONDERING}]`,
      `MemberExpression[property.value=${AXE_UITZONDERING}]`,
      `Property[key.name=${AXE_UITZONDERING}]`,
      "Property[key.name='axeSource']",
    ],
  ),
  // In scanAxe zelf ook geen berekende property-toegang (omzeiling van de namen hierboven) en geen re-export van axe.
  restrict(
    'axe-scan',
    ['e2e/support/axe.ts'],
    [],
    'scanAxe blijft één vaste scan (framework §7): geen berekende property-toegang en geen re-export van axe.',
    [
      "MemberExpression[computed=true][property.type!='Literal']",
      ':matches(ExportNamedDeclaration, ExportAllDeclaration)[source.value=/^@axe-core\\//]',
    ],
  ),
];

export default defineConfig(
  globalIgnores([
    'dist/',
    'coverage/',
    'playwright-report/',
    'test-results/',
    '.runner-output/',
    // Worktrees van subagents: eigen kopieën van de repo, met hun eigen lint (ADR 0047).
    '.claude/worktrees/',
    'test/rails/fixtures/',
    // Gegenereerd door @tanstack/router-plugin (vite.config.ts); niet bewerken.
    'src/web/routeTree.gen.ts',
  ]),
  {
    // Geen eslint-disable in de code: een uitzondering gaat via de ratchet (eslint-suppressions.json, framework §4).
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  railConfigs,
  // Kleine functies (AGENTS.md, framework §4): ≤ 60 regels in .ts/.mjs, ≤ 120 in .tsx, max 3 parameters, max diepte 3.
  // In tests geldt de lengte niet (een describe-blok is een lijst gevallen); parameters en diepte wel.
  // Bestaande overtredingen staan in eslint-suppressions.json (ratchet).
  {
    files: CODE,
    rules: {
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 3],
      'max-depth': ['error', 3],
    },
  },
  {
    files: ['**/*.tsx'],
    rules: { 'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }] },
  },
  { files: TESTS, rules: { 'max-lines-per-function': 'off' } },
);
