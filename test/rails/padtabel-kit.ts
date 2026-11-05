import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Gedeelde fixtures voor de tests van spec padtabel (ADR 0079): de bevroren stand van 30cc352 (oude lijsten, `KRITIEK` uit
// lane.mjs en het register met 26 records) en een kleine gates.json in de nieuwe vorm die elke samenhangregel en de vloer haalt.
export const REPO = path.join(import.meta.dirname, '../..');
const FIXTURES = path.join(import.meta.dirname, 'fixtures/padtabel');

export const OUDE_GATES_TEKST = readFileSync(path.join(FIXTURES, 'gates-30cc352.json'), 'utf8');
export const OUDE_DECISIONS_TEKST = readFileSync(path.join(FIXTURES, 'decisions-30cc352.json'), 'utf8');

/** Een object (geen lijst) of een fout: de fixtures zijn hand geschreven en moeten deze vorm hebben. */
export function object(waarde: unknown): Record<string, unknown> {
  if (typeof waarde !== 'object' || waarde === null || Array.isArray(waarde)) throw new Error('verwacht een object');
  return Object.fromEntries(Object.entries(waarde));
}

export function tekstLijst(waarde: unknown): string[] {
  if (!Array.isArray(waarde) || !waarde.every((item) => typeof item === 'string')) throw new Error('verwacht tekst[]');
  return waarde.map(String);
}

const oudRuw = object(JSON.parse(OUDE_GATES_TEKST));
const oudAgentMerge = object(oudRuw['agentMerge']);

/** De lijsten van 30cc352, zoals ze in `.claude/gates.json` stonden. */
export const OUD = {
  ruw: oudRuw,
  gates: tekstLijst(oudRuw['gates']),
  voorReview: tekstLijst(oudRuw['voorReview']),
  altijdVragen: tekstLijst(oudRuw['altijdVragen']),
  testpaden: tekstLijst(oudRuw['testpaden']),
  toegestaan: tekstLijst(oudAgentMerge['toegestaan']),
  agentKritiek: tekstLijst(oudAgentMerge['kritiek']),
  kritiek: tekstLijst(JSON.parse(readFileSync(path.join(FIXTURES, 'oude-kritiek.json'), 'utf8'))),
};

const STRENG = { schrijven: 'altijdVragen', besluit: 'besluit-pr' };
export const VLOER = [
  '.github/**',
  '.claude/hooks/**',
  '.claude/settings.json',
  '.claude/gates.json',
  '.claude/decisions.json',
  'package.json',
  'pnpm-lock.yaml',
];

/** Rijen in de nieuwe vorm: agent-mergebare app-code, gates, de vloer. */
export function nieuwePaden(): Record<string, Record<string, string>> {
  return {
    'src/**': { besluit: 'agent' },
    'docs/**': { besluit: 'agent' },
    'CHANGELOG.md': { besluit: 'agent' },
    'src/core/**': { schrijven: 'gate' },
    'docs/adr/**': { schrijven: 'gate', besluit: 'besluit-pr' },
    '**/*.test.*': { schrijven: 'gate' },
    'test/**': { schrijven: 'gate' },
    '.claude/**': { schrijven: 'voorReview' },
    ...Object.fromEntries(VLOER.map((glob) => [glob, { ...STRENG }])),
  };
}

/** Een volledige gates.json in de nieuwe vorm (zonder `gates`, `voorReview`, `altijdVragen`, `agentMerge.toegestaan/kritiek`). */
export function nieuw(paden: Record<string, unknown> = nieuwePaden()): Record<string, unknown> {
  return {
    paden,
    merge: 'niet-kritiek',
    agentMerge: { codex: true, maxRegels: 400, maxBytes: 40000 },
    testpaden: ['**/*.test.*', 'test/**'],
    jsonGates: { 'package.json': ['scripts'] },
    gegenereerd: [],
    migraties: ['db/migrations/**'],
    mcpLezen: [],
    goedkeurders: ['eigenaar'],
    schrijfrecht: {
      architect: ['docs/specs/**', 'docs/adr/**'],
      tester: ['**/*.test.*', 'test/**'],
      reviewer: [],
      docs: ['docs/reviews/**', 'CHANGELOG.md'],
      developer: ['**'],
    },
  };
}

/** De afgeleide gates en altijdVragen van `nieuwePaden()`, met de jsonGates-sleutel `package.json` niet als gate. */
export const NIEUW_GATES = [
  'src/core/**',
  'docs/adr/**',
  '**/*.test.*',
  'test/**',
  '.claude/**',
  ...VLOER.filter((glob) => glob !== 'package.json'),
];
export const NIEUW_ALTIJD_VRAGEN = [...VLOER];

type RepoOpties = { gatesTekst: string; codeowners?: string[]; ask?: string[] };

/** Een tijdelijke git-repo voor `docsViolations`: CODEOWNERS en de Edit-`ask` spiegelen standaard de nieuwe vorm. */
export function repo({ gatesTekst, codeowners, ask }: RepoOpties): string {
  const root = mkdtempSync(path.join(tmpdir(), 'padtabel-'));
  const eigenaars = codeowners ?? [...NIEUW_GATES, 'package.json'];
  const vragen = ask ?? NIEUW_ALTIJD_VRAGEN;
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': eigenaars.map((glob) => `${glob} @eigenaar`).join('\n') + '\n',
    '.claude/settings.json': JSON.stringify({ permissions: { ask: vragen.map((glob) => `Edit(${glob})`) } }),
    '.claude/gates.json': gatesTekst,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

/** Een pad dat een glob dekt, zoals `voorbeeldPad` in scripts/kit/check-docs.mjs. */
export function voorbeeldPad(glob: string): string {
  return glob.replaceAll('**', 'x/y').replaceAll('*', 'x');
}
