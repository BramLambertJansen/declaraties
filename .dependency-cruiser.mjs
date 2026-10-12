// Lagen en zones (framework §2, ADR 0008). Elke regel heeft fixtures in test/rails/depcruise.test.ts, ook voor
// bekende omzeilingen (alias, re-export). Draait via de ratchet (scripts/kit/ratchet.mjs), zodat een app een nieuwe
// regel kan invoeren zonder eerst alles te repareren.
const WEB = '^src/(core/)?web/';
const API = '^src/(core/)?api/';
const SHARED = '^src/(core/)?shared/';
// De querybouwer van Drizzle zonder driver: de hoofdingang en pg-core (ook als fixture-stub met pg-core.js).
const QUERY_BUILDER = 'node_modules/drizzle-orm/(index|pg-core/index|pg-core)\\.(d\\.)?[cm]?[jt]s$';
const DATABASE =
  '(^|node_modules/)(pg|pg-[^/]+|postgres|drizzle-orm|kysely|@prisma/[^/]+|@supabase/[^/]+|@neondatabase/[^/]+)(/|$)';

/** @satisfies {import('dependency-cruiser').IConfiguration} */
const config = {
  forbidden: [
    {
      name: 'geen-cycles',
      comment: 'Geen cyclische imports: ze verbergen een laag die er niet hoort.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-niet-naar-app',
      comment: 'src/core importeert nooit app-code; de app geeft wat core nodig heeft als argument mee (ADR 0008).',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(api|web|shared)/' },
    },
    {
      name: 'web-niet-naar-api',
      comment:
        'Web importeert niets uit de API, ook geen types: de contracten staan in src/shared/contracts (ADR 0008).',
      severity: 'error',
      from: { path: WEB },
      to: { path: API },
    },
    {
      name: 'api-niet-naar-web',
      comment: 'De API importeert niets uit de frontend.',
      severity: 'error',
      from: { path: API },
      to: { path: WEB },
    },
    {
      name: 'shared-alleen-shared',
      comment: 'Gedeelde code (beide zones) importeert niets uit web of api.',
      severity: 'error',
      from: { path: SHARED },
      to: { path: '^src/(core/)?(web|api)/' },
    },
    {
      name: 'database-alleen-in-core-db',
      comment:
        'Alleen src/core/api/db (en src/core/api/auth voor Better Auth) gebruikt een databasedriver of -SDK; src/api alleen de querybouwer.',
      severity: 'error',
      from: { path: '^src/', pathNot: ['^src/core/api/(db|auth)/', '^src/api/'] },
      to: { path: DATABASE },
    },
    {
      name: 'api-alleen-querybouwer',
      comment:
        "src/api gebruikt van Drizzle alleen de querybouwer ('drizzle-orm', 'drizzle-orm/pg-core') met de tx uit withUser; geen driver of verbinding.",
      severity: 'error',
      from: { path: '^src/api/' },
      to: { path: DATABASE, pathNot: QUERY_BUILDER },
    },
    {
      name: 'db-alleen-via-index',
      comment:
        'Buiten src/core/api/db alleen withUser(), pingDatabase() en closeDatabase() uit index.ts, createAuditFn() uit audit.ts (schrijft alleen app.audit in de tx; geen pool) en testing.ts in tests: geen pool of driver.',
      severity: 'error',
      from: { pathNot: '^src/core/api/db/' },
      to: { path: '^src/core/api/db/', pathNot: '^src/core/api/db/(index|testing|types|audit)\\.ts$' },
    },
    {
      name: 'testing-alleen-in-tests',
      comment: 'src/core/api/db/testing.ts (eigen pools, geïnjecteerde transacties) alleen vanuit testbestanden.',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.test\\.tsx?$' },
      to: { path: '^src/core/api/db/testing\\.ts$' },
    },
    {
      name: 'niet-oplosbaar',
      comment: 'Elke import moet op te lossen zijn; anders ziet geen enkele lagenregel hem.',
      severity: 'error',
      from: { path: '^src/' },
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['types', 'import', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs'],
    },
  },
};

export default config;
