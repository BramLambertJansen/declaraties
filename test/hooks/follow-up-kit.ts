import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { documentInfo } from '../../.claude/hooks/lib/document-state.mjs';

// Gedeelde onderdelen voor de acceptatietests van docs/specs/taakmandaat-vervolg.md (mandate-follow-up/AC-1 t/m AC-25).
// Echte tijdelijke Git-repositories; GitHub-gegevens komen van een `gh`-stub (geen netwerk), zoals de spec voorschrijft.

export const REPOSITORY = 'BramLambertJansen/template';
export const BRANCH = 'feat/example';
export const SOURCE = 'src/core/web/ui/example.tsx';
export const S1 = 'docs/specs/s1.md';
export const S2 = 'docs/specs/s2.md';
export const S3 = 'docs/specs/s3.md';
export const ADR = 'docs/adr/0001-voorbeeld.md';
export const ROADMAP = 'docs/roadmap.md';
export const PR = 130;
export const KOP = '# Roadmap\n\n## Stuk\n\n';

const CHECKER = path.resolve('scripts/kit/check-document-status.mjs');
const DOCS_STATUS = path.resolve('scripts/kit/document-status.mjs');
const GATES = readFileSync('.claude/gates.json', 'utf8');
const directories: string[] = [];

export function opruimen(): void {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

export function git(root: string, args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function write(root: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

export function read(root: string, file: string): string {
  return readFileSync(path.join(root, file), 'utf8');
}

export function commit(root: string, message = 'test: fixture'): string {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']);
}

export function specBody(name: string, status = 'goedgekeurd'): string {
  return `---\nstatus: ${status}\nnamespace: ${name}\n---\n\n# Spec ${name}\n\n## Hergebruik en UX\n\nBestaande kit.\n`;
}

export function builtLine(sha: string, pr = PR): string {
  return `gebouwd # #${String(pr)}; gevalideerd: ${sha}`;
}

export function roadmapTekst(regels: string[]): string {
  return `${KOP}${regels.join('\n')}\n`;
}

export function openItem(spec: string, tekst = 'Taak voor'): string {
  return `- [ ] ${tekst} \`${spec}\``;
}

export function doneItem(spec: string, bewijs = ` (#${String(PR)})`, tekst = 'Taak voor'): string {
  return `- [x] ${tekst} \`${spec}\`${bewijs}`;
}

/** De standaard roadmap: items van S1 en S2 (regel 5 en 6), een oud afgevinkt item en een toelichting. */
export function basisRoadmap(): string[] {
  return [openItem(S1), openItem(S2), '- [x] Oud werk (#5)', '', 'Toelichting.'];
}

/** Het bestand `.claude/decisions.json` voor de gegeven specs (mandaten); `branch` is de branch van het besluit. */
function decisions(mandated: string[], branch: string): string {
  return JSON.stringify({
    version: 1,
    requiredChecks: ['gate:fast'],
    decisions: mandated.map((file) => ({
      file,
      digest: documentInfo(file, specBody(path.basename(file, '.md')))?.digest,
      repository: REPOSITORY,
      branch,
      status: 'goedgekeurd',
      paths: [SOURCE],
    })),
  });
}

export interface Opties {
  /** Specs die op main `goedgekeurd` zijn; de rest van deze lijst heeft een mandaat als `mandaat` ze noemt. */
  specs: string[];
  mandaat: string[];
  roadmap: string[];
  /** Geen `.claude/decisions.json` (AC-7). */
  zonderRegister?: boolean;
  /** Branch in het besluit; afwijkend van `BRANCH` betekent: geen actief mandaat op deze branch. */
  besluitBranch?: string;
}

export interface Fixture {
  root: string;
  base: string;
}

/** main (= origin/main) met specs, roadmap, gates en register; daarna de branch `feat/example`. */
export function maakRepo(opties: Opties): Fixture {
  const root = tempDir('mandate-follow-up-');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['remote', 'add', 'origin', `https://github.com/${REPOSITORY}.git`]);
  for (const spec of opties.specs) write(root, spec, specBody(path.basename(spec, '.md')));
  write(root, ADR, '# 0001 — Voorbeeld\n\nStatus: voorgesteld\n');
  write(root, ROADMAP, roadmapTekst(opties.roadmap));
  write(root, SOURCE, 'export const version = 1;\n');
  write(root, 'README.md', 'Voorbeeld.\n');
  write(root, 'package.json', '{\n  "scripts": { "test:unit": "vitest" }\n}\n');
  write(root, '.claude/gates.json', GATES);
  if (opties.zonderRegister !== true)
    write(root, '.claude/decisions.json', decisions(opties.mandaat, opties.besluitBranch ?? BRANCH));
  const base = commit(root, 'baseline');
  git(root, ['update-ref', 'refs/remotes/origin/main', base]);
  git(root, ['switch', '-q', '-c', BRANCH]);
  return { root, base };
}

export interface Stappen {
  /** Specs die in de administratiecommit naar `gebouwd` gaan (gevalideerd: de broncommit). */
  gebouwd: string[];
  /** Roadmap in de broncommit (vóór de gevalideerde SHA) en/of in de administratiecommit. */
  bronRoadmap?: string[];
  adminRoadmap?: string[];
  /** Extra bewerking in de broncommit (bijvoorbeeld hernoemen of verwijderen van de roadmap). */
  bron?: (root: string) => void;
  /** Extra bewerking in de administratiecommit. */
  admin?: (root: string) => void;
}

export interface Resultaat {
  validated: string;
  head: string;
}

/** Broncommit (SOURCE + eventueel roadmap) en daarna de administratiecommit (statusregels + eventueel roadmap). */
export function bouw(fixture: Fixture, stappen: Stappen): Resultaat {
  const { root } = fixture;
  write(root, SOURCE, 'export const version = 2;\n');
  if (stappen.bronRoadmap !== undefined) write(root, ROADMAP, roadmapTekst(stappen.bronRoadmap));
  stappen.bron?.(root);
  const validated = commit(root, 'feat: implementatie');
  if (stappen.gebouwd.length === 0 && stappen.adminRoadmap === undefined && stappen.admin === undefined)
    return { validated, head: validated };
  for (const spec of stappen.gebouwd)
    write(root, spec, read(root, spec).replace('status: goedgekeurd', `status: ${builtLine(validated)}`));
  if (stappen.adminRoadmap !== undefined) write(root, ROADMAP, roadmapTekst(stappen.adminRoadmap));
  stappen.admin?.(root);
  return { validated, head: commit(root, 'docs: administratie') };
}

/** Een uitvoerbare `gh`-stub: antwoordt op de twee endpoints die github-evidence.mjs leest. */
export function ghStub(): string {
  const dir = tempDir('gh-stub-');
  const script = `#!${process.execPath}
const endpoint = process.argv[3] ?? '';
const repo = process.env.STUB_REPO ?? '${REPOSITORY}';
const pr = /\\/pulls\\/(\\d+)$/.exec(endpoint);
if (pr !== null) {
  console.log(JSON.stringify({
    number: Number(pr[1]),
    state: process.env.STUB_PR_STATE ?? 'open',
    merged: false,
    base: { repo: { full_name: repo } },
    head: { repo: { full_name: repo }, ref: '${BRANCH}', sha: process.env.STUB_PR_HEAD ?? '' },
  }));
} else {
  const sha = /commits\\/([0-9a-f]{40})\\/check-runs/.exec(endpoint)?.[1] ?? '';
  const runs = process.env.STUB_CHECKS === 'geen' ? [] : [
    { id: 1, name: 'gate:fast', head_sha: sha, status: 'completed', conclusion: 'success', app: { id: 15368 } },
  ];
  console.log(JSON.stringify({ check_runs: runs }));
}
`;
  write(dir, 'gh', script);
  chmodSync(path.join(dir, 'gh'), 0o755);
  return dir;
}

export interface Uitvoer {
  status: number | null;
  stdout: string;
  stderr: string;
}

function env(stub: string, extra: Record<string, string>): Record<string, string> {
  const schoon = Object.fromEntries(Object.entries(process.env).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]])));
  return { ...schoon, PATH: `${stub}:${process.env['PATH'] ?? ''}`, ...extra };
}

/** `check-document-status` zoals guard.yml hem draait, met main als vertrouwde basis. */
export function draaiChecker(fixture: Fixture, head: string): Uitvoer {
  const stub = ghStub();
  const { status, stdout, stderr } = spawnSync(process.execPath, [CHECKER], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: env(stub, {
      BASE_SHA: fixture.base,
      HEAD_SHA: head,
      HEAD_REF: BRANCH,
      REPO: REPOSITORY,
      STUB_PR_HEAD: head,
    }),
  });
  return { status, stdout, stderr };
}

/** `node scripts/kit/document-status.mjs <args>` in de fixture; HEAD is de gevalideerde broncommit. */
export function draaiDocsStatus(root: string, args: string[], extra: Record<string, string> = {}): Uitvoer {
  const stub = ghStub();
  const { status, stdout, stderr } = spawnSync(process.execPath, [DOCS_STATUS, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: env(stub, { STUB_PR_HEAD: git(root, ['rev-parse', 'HEAD']), ...extra }),
  });
  return { status, stdout, stderr };
}

export function maakSymlink(root: string, file: string, doel: string): void {
  rmSync(path.join(root, file), { force: true });
  symlinkSync(doel, path.join(root, file));
}

// --- modules laden zonder statische import (de nieuwe exports bestaan nog niet; zie check-roadmap.test.ts) ---------

export async function exportVan(module: string, naam: string): Promise<unknown> {
  const geladen: unknown = await import(/* @vite-ignore */ module);
  if (typeof geladen !== 'object' || geladen === null) throw new Error(`${module} levert geen module`);
  if (!(naam in geladen)) throw new Error(`${module} exporteert ${naam} niet`);
  const waarde: unknown = Reflect.get(geladen, naam);
  return waarde;
}

export async function roep(module: string, naam: string, ...args: unknown[]): Promise<unknown> {
  const functie = await exportVan(module, naam);
  if (typeof functie !== 'function') throw new Error(`${module} exporteert ${naam} niet als functie`);
  const resultaat: unknown = await Reflect.apply(functie, undefined, args);
  return resultaat;
}

export const STATUS_GIT = ['../../scripts/kit', 'status-git.mjs'].join('/');
export const CHECK_ROADMAP = ['../../scripts/kit', 'check-roadmap.mjs'].join('/');

export function testpaden(): string[] {
  const json: unknown = JSON.parse(GATES);
  if (typeof json !== 'object' || json === null || !('testpaden' in json) || !Array.isArray(json.testpaden))
    throw new Error('gates.json zonder testpaden');
  const lijst: unknown[] = json.testpaden;
  return lijst.map(String);
}

/** `statusOnlyDiff(root, { from, to }, { testpaden })`, met een derde parameter die nog niet bestaat. */
export async function statusOnly(root: string, from: string, to: string): Promise<unknown> {
  return roep(STATUS_GIT, 'statusOnlyDiff', root, { from, to }, { testpaden: testpaden() });
}

/** De sleutels van `roadmapVanRepo(root, 'origin/main')`. */
export async function roadmapSleutels(root: string): Promise<string[]> {
  const resultaat = await roep(CHECK_ROADMAP, 'roadmapVanRepo', root, 'origin/main');
  if (!Array.isArray(resultaat)) throw new Error('geen lijst van meldingen');
  const lijst: unknown[] = resultaat;
  return lijst.map((melding) => {
    if (typeof melding === 'object' && melding !== null && 'key' in melding && typeof melding.key === 'string')
      return melding.key;
    throw new Error('geen melding met key');
  });
}
