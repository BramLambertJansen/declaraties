// Gate-register (framework §4, ADR 0011): de enige gate-tabel. Per script wat het bewaakt en of het snel is
// (zonder database of Docker, dus in gate:fast). test/rails/gates.test.ts eist dat `gate:fast` precies de snelle
// gates in deze volgorde draait en dat elk script bestaat; check-docs neemt dat over (roadmap stuk 4).

/** @typedef {{ script: string, bewaakt: string, snel: boolean }} Gate */

/** @type {readonly Gate[]} */
export const gates = [
  { script: 'format:check', bewaakt: 'opmaak (Prettier) van alle bestanden in git', snel: true },
  {
    script: 'lint',
    bewaakt: 'ESLint strictTypeChecked, geen casts, de rails (rails/*) en de ESLint-ratchet (eslint-suppressions.json)',
    snel: true,
  },
  { script: 'typecheck', bewaakt: 'TypeScript streng (framework §4), ook scripts/', snel: true },
  {
    script: 'ratchet',
    bewaakt:
      'lagen en zones (dependency-cruiser) en docs (check-docs: paden, links, statussen, spiegeling) tegen .kit/baseline.json',
    snel: true,
  },
  {
    script: 'check:catalogus',
    bewaakt:
      'AST-index van alle UI-componenten, barrel-export en bereikbare catalogusvoorbeelden met alle eindige varianten; geen uitzonderingen (framework §7)',
    snel: true,
  },
  {
    script: 'check:migrations',
    bewaakt:
      'geen gecommitte migratie gewijzigd of verwijderd t.o.v. origin/main, namen en versies uniek (framework §10)',
    snel: true,
  },
  {
    script: 'check:secdef',
    bewaakt:
      "security definer in db/migrations: search_path '', namen met schema, eigenaar app_definer (AGENTS.md, framework §6)",
    snel: true,
  },
  {
    script: 'check:roadmap',
    bewaakt:
      'een nieuw of gewijzigd [x] in docs/roadmap.md en een spec die naar gebouwd gaat verwijzen naar bewijs (testpad, checknaam of PR-nummer) t.o.v. origin/main (framework §8)',
    snel: true,
  },
  { script: 'test:unit', bewaakt: 'unit-tests en de fixtures van de rails (test/rails)', snel: true },
  {
    script: 'test:db',
    bewaakt:
      'integratietests (ook de isolatietest en check-policies) en pgTAP tegen een verse database, in de runner (ADR 0009)',
    snel: false,
  },
  { script: 'ui:check', bewaakt: 'e2e met CSP aan tegen API en Vite, in de Playwright-runner (ADR 0009)', snel: false },
  {
    script: 'check:snapshot',
    bewaakt: 'db/schema.snapshot.sql en src/api/db/schema.ts gelijk aan wat de migraties opleveren (framework §6)',
    snel: false,
  },
];
