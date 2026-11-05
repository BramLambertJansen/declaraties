// Lagen en zones (framework §2, ADR 0040). Elke regel heeft fixtures in test/rails/depcruise.test.ts, ook voor
// bekende omzeilingen (alias, re-export). Draait via de ratchet (scripts/kit/ratchet.mjs), zodat een app een nieuwe
// regel kan invoeren zonder eerst alles te repareren.
const WEB = '^src/(core/)?web/';
const API = '^src/(core/)?api/';
const SHARED = '^src/(core/)?shared/';
// De querybouwer van Drizzle zonder driver: de hoofdingang en pg-core (ook als fixture-stub met pg-core.js).
const QUERY_BUILDER = 'node_modules/drizzle-orm/(index|pg-core/index|pg-core)\\.(d\\.)?[cm]?[jt]s$';
const DATABASE =
  '(^|node_modules/)(pg|pg-[^/]+|postgres|drizzle-orm|kysely|@prisma/[^/]+|@supabase/[^/]+|@neondatabase/[^/]+)(/|$)';

// De testmodules in core (spec koppelingsvorm): alleen vanuit tests, en de fabriek mag de nep-partner gebruiken.
const TESTING = '^src/core/api/(db|outbound|integrations)/testing\\.ts$';
const TESTING_VAN = `\\.test\\.tsx?$|${TESTING}`;

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
      comment: 'src/core importeert nooit app-code; de app geeft wat core nodig heeft als argument mee (ADR 0040).',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(api|web|shared)/' },
    },
    {
      name: 'web-niet-naar-api',
      comment:
        'Web importeert niets uit de API, ook geen types: de contracten staan in src/shared/contracts (ADR 0040).',
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
        'Buiten src/core/api/db alleen withUser(), pingDatabase() en closeDatabase() uit index.ts, createAuditFn() uit audit.ts (schrijft alleen app.audit in de tx; geen pool), readIntegrationSwitch() uit integration-switch.ts (leest alleen de schakelaar in de tx; spec koppelingsregister) en testing.ts in tests: geen pool of driver.',
      severity: 'error',
      from: { pathNot: '^src/core/api/db/' },
      to: {
        path: '^src/core/api/db/',
        pathNot: '^src/core/api/db/(index|testing|types|audit|integration-switch)\\.ts$',
      },
    },
    {
      name: 'uitgaande-client-alleen-in-core',
      comment:
        'De bouwstenen van de uitgaande client (outbound/create.ts, client.ts, config.ts) en van de registerclient (integrations/client.ts, reading.ts) alleen binnen src/core/api: de app maakt een client via het register (integrations.client), zodat hosts één bron hebben en de schakelaar altijd geldt (spec koppelingsregister).',
      severity: 'error',
      from: { pathNot: '^src/core/api/' },
      to: { path: '^src/core/api/(outbound/(create|client|config)|integrations/(client|reading))\\.ts$' },
    },
    {
      name: 'testing-alleen-in-tests',
      comment:
        'src/core/api/db/testing.ts (eigen pools, geïnjecteerde transacties), src/core/api/outbound/testing.ts (nep-partner, R-UIT-07) en src/core/api/integrations/testing.ts (contracttestfabriek met vitest en testlezing, spec koppelingsvorm) alleen vanuit testbestanden of uit elkaar. Deze regel houdt vitest en de testlezing uit productiecode; deploy/ valt buiten de cruise.',
      severity: 'error',
      from: { path: '^src/', pathNot: TESTING_VAN },
      to: { path: TESTING },
    },
    {
      name: 'koppeling-via-poort',
      comment:
        'Een route kent van een koppeling alleen port.ts; adapter.ts en schemas.ts blijven achter de poort (spec koppelingsvorm). De poort komt via ctx.services.',
      severity: 'error',
      from: { path: '^src/api/routes/' },
      to: { path: '^src/api/integrations/[^/]+/(adapter|schemas)\\.ts$' },
    },
    {
      name: 'poort-zonder-http',
      comment:
        'port.ts beschrijft de koppeling in domeintermen: geen import uit outbound of integrations in core, en niet uit adapter.ts of schemas.ts (anders lekt de vorm van de partner via z.infer naar de route; spec koppelingsvorm).',
      severity: 'error',
      from: { path: '^src/api/integrations/[^/]+/port\\.ts$' },
      to: { path: '^(src/core/api/(outbound|integrations)/|src/api/integrations/[^/]+/(adapter|schemas)\\.ts$)' },
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
