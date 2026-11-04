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
  'klassen',
  'afwezigheid',
  'negatieve-tabel',
  'kooi',
  'netwerk-api',
  'geheim',
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
const NEGATIEF_REGEX = '/^(toMatch|stringMatching)$/';
const REGEX_METHODE = '/^(test|exec)$/';
const TEKST_METHODE = '/^(match|search)$/';
// expect(…) gevolgd door een vergelijking met een vaste waarde; assert(…) of assert.ok(…) met een ontkenning.
const VERGELIJK =
  "CallExpression[callee.property.name=/^(toBe|toEqual|toStrictEqual|toBeNull|toBeFalsy|toBeTruthy|toBeUndefined)$/] > MemberExpression.callee > CallExpression.object[callee.name='expect']";
const ASSERT = "CallExpression:matches([callee.name='assert'], [callee.property.name='ok'], [callee.name='expect'])";
// Een assertie dat de uitkomst onwaar is: toBe/toEqual/toStrictEqual(false), toBeFalsy(), not.toBe(true), not.toBeTruthy().
const ONWAAR = [
  'CallExpression[callee.property.name=/^(toBe|toEqual|toStrictEqual)$/][arguments.0.value=false]',
  "CallExpression[callee.property.name='toBeFalsy']",
  "CallExpression[callee.property.name='toBe'][callee.object.property.name='not'][arguments.0.value=true]",
  "CallExpression[callee.property.name='toBeTruthy'][callee.object.property.name='not']",
].join(', ');
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

// Layout-utilities die features/ en routes/ zelf mogen zetten (framework §7, spec klassenrail); kleur, typografie, rand
// en schaduw komen uit de kit. Eén token: hooguit één responsieve prefix plus een layoutklasse, nooit arbitrary of `!`.
const N = String.raw`(\d+(\.5)?|px)`;
const LAYOUT_TOKEN = [
  'flex|inline-flex|grid|inline-grid|block|inline-block|inline|hidden|contents',
  'flex-(row|col|wrap)(-reverse)?|flex-nowrap|flex-1|flex-auto|flex-none|grow|grow-0|shrink|shrink-0',
  'items-(start|end|center|baseline|stretch)|justify-(start|end|center|between|around|evenly|stretch)',
  'self-(auto|start|end|center|stretch|baseline)',
  `gap-${N}|gap-[xy]-${N}|space-[xy]-${N}|p[trblxyse]?-${N}|-?m[trblxyse]?-${N}|m[trblxyse]?-auto`,
  String.raw`(min-|max-)?[wh]-[a-z0-9.\/]+|grid-cols-\d+|col-span-(\d+|full)`,
  'sr-only|break-all|break-words|truncate',
].join('|');
const TOKEN = `((sm|md|lg|xl|2xl):)?(${LAYOUT_TOKEN})`;
const LAYOUT_CLASSES = String.raw`/^\s*${TOKEN}(\s+${TOKEN})*\s*$/`;

// Kooi (ADR 0072, spec kooi AC-5): een shell met een commandotekst alleen via inKooi uit scripts/kit/kooi.mjs. child_process
// alleen met benoemde imports, zodat exec/execSync en een shell-aanroep hier zichtbaar zijn.
const CHILD = '/^(node:)?child_process$/';
const STARTER = 'CallExpression[callee.name=/^(spawn|spawnSync|execFile|execFileSync)$/]';
const SHELL = String.raw`[arguments.0.value=/^(.*\/)?(ba|z|da|k)?sh$/]`;
const KOOI_SELECTORS = [
  `${STARTER}${SHELL}:has(Literal[value=/^-[a-zA-Z]*c[a-zA-Z]*$/])`,
  `${STARTER}${SHELL}:not([arguments.1.type='ArrayExpression'])`,
  `${STARTER} > ObjectExpression > Property:matches([key.name='shell'], [key.value='shell']):not([value.value=false])`,
  // Een andere naam voor een starter zou de regels hierboven omzeilen.
  ...['spawn', 'spawnSync', 'execFile', 'execFileSync'].map(
    (naam) =>
      `ImportDeclaration[source.value=${CHILD}] > ImportSpecifier[imported.name='${naam}']:not([local.name='${naam}'])`,
  ),
  `ImportDeclaration[source.value=${CHILD}] > ImportSpecifier[imported.name=/^exec(Sync)?$/]`,
  `ImportDeclaration[source.value=${CHILD}] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier)`,
  `ImportExpression[source.value=${CHILD}]`,
  `ImportExpression[source.type='TemplateLiteral'][source.quasis.0.value.raw=${CHILD}]`,
  `CallExpression[callee.name='require'][arguments.0.value=${CHILD}]`,
];

// Netwerk vanuit api- en shared-code (R-CODE-12, ADR 0077, spec netwerk-en-geheim-rails): alleen de uitgaande client, de
// SMTP-adapter en de eigen server mogen netwerkmodules laden. Type-imports laden niets; een inline `type` wel.
// esquery kan geen `/` in een regex aan, ook niet geëscapet: daarom `[/]`.
const NETWERK_MODULE =
  '/^((node:)?(http|https|http2|net|tls|dgram|child_process|cluster|inspector|worker_threads|vm|module)($|[/])|undici($|[/])|nodemailer($|[/])|hono[/]client$|data:)/';
const NETWERK_GLOBAAL = '/^(fetch|XMLHttpRequest|EventSource|WebSocket|globalThis|global|self|window|eval)$/';
// Dezelfde naam als eigenschap, sleutel, methode, typeveld of in een typepositie is geen verwijzing naar de globale.
const GEEN_VERWIJZING = [
  'MemberExpression[computed=false] > Identifier.property',
  'Property[shorthand=false] > Identifier.key',
  ':matches(MethodDefinition, PropertyDefinition, TSAbstractMethodDefinition, TSAbstractPropertyDefinition, TSPropertySignature, TSMethodSignature) > Identifier.key',
  'TSEnumMember > Identifier.id',
  'TSTypeQuery Identifier',
  'TSQualifiedName > Identifier',
  'TSTypeReference > Identifier.typeName',
  ':matches(TSClassImplements, TSInterfaceHeritage) > Identifier.expression',
  'TSModuleDeclaration > Identifier.id',
].join(', ');
const NETWERK_SELECTORS = [
  `:matches(ImportDeclaration[importKind!='type'], ExportNamedDeclaration[exportKind!='type'], ExportAllDeclaration[exportKind!='type'], ImportExpression)[source.value=${NETWERK_MODULE}]`,
  `CallExpression[callee.name='require'][arguments.0.value=${NETWERK_MODULE}]`,
  `TSImportEqualsDeclaration[importKind!='type'] > TSExternalModuleReference[expression.value=${NETWERK_MODULE}]`,
  `Identifier[name=${NETWERK_GLOBAAL}]:not(${GEEN_VERWIJZING})`,
  `MemberExpression[computed=true] > Literal.property[value=${NETWERK_GLOBAAL}]`,
];

// Geheim van een koppeling (R-SEC-05, ADR 0077): in src/api/env.ts een geheime sleutel alleen met secret(ctx, …) uit
// core-env. Een eigen secret, een andere import of een verbreding van het schema zou die eis omzeilen.
const GEHEIME_SLEUTEL = [
  '(^|_)(SECRET|TOKEN|PASSWORD|PASSPHRASE|API_KEY|PRIVATE_KEY|SIGNING_KEY|SECRET_KEY|ACCESS_KEY)$',
  '(^|_)(secret|token|password|passphrase|api_key|private_key|signing_key|secret_key|access_key)$',
  '^[a-z][a-zA-Z0-9]*(Secret|Token|Password|Passphrase|ApiKey|PrivateKey|SigningKey|SecretKey|AccessKey)$',
].join('|');
const ZONDER_SECRET = ":not([value.type='CallExpression'][value.callee.name='secret'])";
const GEHEIM_SELECTORS = [
  ...['key.name', 'key.value', 'key.quasis.0.value.raw'].map(
    (sleutel) => `ObjectExpression > Property[${sleutel}=/${GEHEIME_SLEUTEL}/]${ZONDER_SECRET}`,
  ),
  "Identifier[name='secret']:not(CallExpression > Identifier.callee, ImportDeclaration[source.value='#core/api/env.ts'] > ImportSpecifier[imported.name='secret'] > Identifier)",
  `:matches(${IMPORTS})[source][source.value!=/^(zod|#core[/]api[/]env[.]ts)$/]`,
  'CallExpression > MemberExpression.callee[property.name=/^(partial|deepPartial|or|and|catch|catchall|passthrough|loose|looseObject|merge|record|union|discriminatedUnion|preprocess)$/]',
];

const railConfigs = [
  restrict(
    'netwerk-api',
    [
      'src/api/**/*.{ts,tsx}',
      'src/core/api/**/*.{ts,tsx}',
      'src/shared/**/*.{ts,tsx}',
      'src/core/shared/**/*.{ts,tsx}',
    ],
    [
      ...TESTS,
      'src/core/api/outbound/client.ts',
      'src/core/api/outbound/testing.ts',
      'src/core/api/outbound/config.ts',
      'src/core/api/mail/smtp.ts',
      'src/core/api/http/serve.ts',
    ],
    "Netwerk vanuit api- en shared-code alleen via de uitgaande client: gebruik createOutboundClient uit '#core/api/outbound' " +
      '(R-CODE-12, ADR 0077). Geen node:http(s), net, tls, undici, nodemailer, child_process, worker_threads, vm, ' +
      'node:module, data:-import, eval, globale fetch/WebSocket of globalThis.',
    NETWERK_SELECTORS,
  ),
  restrict(
    'geheim',
    ['src/api/env.ts'],
    [],
    "Een geheim van een koppeling alleen via secret(ctx, …) uit '#core/api/env.ts' in readEnv((ctx) => …) (R-SEC-05, " +
      'ADR 0077); geen eigen secret, geen andere imports, geen .partial/.or/.catch/z.union.',
    GEHEIM_SELECTORS,
  ),
  restrict(
    'kooi',
    [...CODE, 'deploy/**/*.{ts,mjs,js}', '*.{mjs,js}'],
    ['scripts/kit/kooi.mjs'],
    'Een shell met een commandotekst alleen via inKooi uit scripts/kit/kooi.mjs (ADR 0072, R-TOOL-03); child_process alleen met benoemde imports, zonder exec/execSync.',
    KOOI_SELECTORS,
  ),
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
  // Stijl in schermen alleen via de kit (framework §7, spec klassenrail): className als gewone string met layout-tokens.
  restrict(
    'klassen',
    ['src/web/features/**/*.{ts,tsx}', 'src/web/routes/**/*.{ts,tsx}'],
    ['**/*.test.{ts,tsx}'],
    'In features/ en routes/ alleen layout-klassen als gewone string (flex, grid, gap, padding, breedte); kleur, ' +
      'typografie, rand, schaduw, arbitrary values, `!`, `dark:` en `style` komen uit componenten. Gebruik `Text`, ' +
      "`Heading`, `Stack` of `Inline` uit '#web/ui/…' (lijst: `node scripts/kit/feiten.mjs componenten`). Past er " +
      'geen, stel dan een variant voor (framework §7).',
    [
      "JSXAttribute[name.name='className'][value.type!='Literal']",
      "JSXSpreadAttribute > ObjectExpression > Property[key.name='className']",
      `JSXAttribute[name.name='className'] > Literal[value!=${LAYOUT_CLASSES}]`,
      "JSXAttribute[name.name='style']",
    ],
  ),
  // Afwezigheid (leerpunt #402): `not.toMatch(/mandat/i)` bleef groen terwijl de bron "taakmandaat" noemde. Een negatieve
  // regex-assertie loopt daarom alleen via expectAbsent, die eerst bewijst dat het patroon de vormen in de bron herkent.
  restrict(
    'afwezigheid',
    TESTS,
    ['test/support/absence.ts'],
    'Een afwezigheidstest bewijst alleen iets als het patroon de vormen in de bron herkent (leerpunt #402): gebruik ' +
      "expectAbsent(tekst, patroon, { recognizes: ['mandaat', 'mandate'] }) uit test/support/absence.ts en noem elke " +
      'vorm en taalvariant die in de bron kan staan.',
    [
      `MemberExpression[object.property.name='not'][property.name=${NEGATIEF_REGEX}]`,
      `MemberExpression[object.property.name='not'][property.value=${NEGATIEF_REGEX}]`,
      `MemberExpression[object.property.value='not'][property.name=${NEGATIEF_REGEX}]`,
      `MemberExpression[object.property.value='not'][property.value=${NEGATIEF_REGEX}]`,
      "MemberExpression[property.name='doesNotMatch']",
      "MemberExpression[property.value='doesNotMatch']",
      "VariableDeclarator > MemberExpression.init[property.name='not']",
      "VariableDeclarator[init.type='CallExpression'] > ObjectPattern.id > Property[key.name='not']",
      // Omschrijvingen naar een boolean of null: expect(/re/.test(x)).toBe(false), expect(x.match(/re/)).toBeNull(),
      // assert.ok(!/re/.test(x)). Een positieve vorm hiervan schrijf je als toMatch; een telling (toHaveLength) mag.
      `${VERGELIJK} > CallExpression.arguments[callee.property.name=${REGEX_METHODE}][callee.object.regex]`,
      `${VERGELIJK} > CallExpression.arguments[callee.property.name=${TEKST_METHODE}][arguments.0.regex]`,
      `${ASSERT} > UnaryExpression.arguments[operator='!'] > CallExpression[callee.property.name=${REGEX_METHODE}][callee.object.regex]`,
    ],
  ),
  // Negatieve tabel (leerpunt #401): alle rijen gaven `false`, maar de gedeelde basis was zelf al onwaar, zodat het
  // weghalen van een bewaakte voorwaarde alles groen liet. Een tabel die per rij onwaar eist, loopt via
  // expectNegativeTable, die eerst bewijst dat de basis waar is.
  restrict(
    'negatieve-tabel',
    TESTS,
    ['test/support/negative-table.ts'],
    'Een negatieve tabel bewijst alleen iets als de basis eerst waar is (leerpunt #401): gebruik ' +
      'expectNegativeTable({ base, check, cases }) uit test/support/negative-table.ts; elke rij wijzigt één voorwaarde. ' +
      'Is `false` een bijassertie in een positieve tabel, schrijf die dan als not.toHaveClass of not.toContain.',
    [
      `CallExpression[callee.callee.property.name=/^(each|for)$/]:has(${ONWAAR})`,
      `CallExpression[callee.tag.property.name=/^(each|for)$/]:has(${ONWAAR})`,
    ],
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
    // Lokale kopie van de hooks van main (anker, R-ROL-09); de bron rails/hooks/ wordt wel gelint.
    '.claude/hooks/.cache/',
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
  // Kleine functies (AGENTS.md, framework §4): ≤ 60 regels in .ts/.mjs, ≤ 120 in .tsx, max 3 parameters, max diepte 3,
  // cyclomatische complexiteit ≤ 15 (R-CODE-02, ADR 0068). In tests geldt de lengte niet (een describe-blok is een lijst
  // gevallen); parameters, diepte en complexiteit wel.
  // Bestaande overtredingen staan in eslint-suppressions.json (ratchet).
  {
    files: CODE,
    rules: {
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 3],
      'max-depth': ['error', 3],
      complexity: ['error', 15],
    },
  },
  {
    files: ['**/*.tsx'],
    rules: { 'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }] },
  },
  { files: TESTS, rules: { 'max-lines-per-function': 'off' } },
);
