import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Gedeelde fixtures voor check-app-init.test.ts en proef-kopie.test.ts (geen test zelf).
// Een werkmap heeft `bron` (een git-repo met de app:init-invoer) en `tmp` (een eigen TMPDIR voor de kindprocessen,
// zodat "de tijdelijke map bestaat niet meer" te toetsen is zonder andere runs te raken).
export const ROOT = path.join(import.meta.dirname, '../..');
export const CHECK = path.join(ROOT, 'scripts/kit/check-app-init.mjs');
export const MODULE = path.join(ROOT, 'scripts/kit/proef-kopie.mjs');

export interface Werkmap {
  base: string;
  bron: string;
  tmp: string;
}

const FILES: Readonly<Record<string, string>> = {
  'README.md':
    '# App-template\n\nFundering voor apps.\n\n## Nieuwe app starten\n\nSetup.\n\n## Lokaal draaien\n\nStart.\n',
  'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n- Template.\n\n## [0.1.0]\n\n- Basis.\n',
  'src/shared/app.ts': "export const APP_NAME = 'App-template';\n",
  'src/web/index.html': '<!doctype html><html lang="nl"><head><title>App-template</title></head></html>\n',
  '.github/CODEOWNERS': '/AGENTS.md                @bramlambertjansen\n',
  '.gitignore': 'node_modules\n',
};
export const TEMPLATE_GATES =
  '{\n  "onderhoud": { "repository": "BramLambertJansen/template" },\n  "altijdVragen": []\n}\n';

export interface BronOptions {
  scripts?: Record<string, string>;
  probes?: Record<string, string>;
  gates?: string | null;
  readme?: string;
  nodeModules?: boolean;
}

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

export function nieuweWerkmap(dirs: string[]): Werkmap {
  const base = mkdtempSync(path.join(tmpdir(), 'proef-test-'));
  dirs.push(base);
  const tmp = path.join(base, 'tmp');
  mkdirSync(tmp);
  return { base, bron: path.join(base, 'bron'), tmp };
}

/** Een git-repo met de invoer van app:init (de echte scripts/kit/app-init.mjs), eigen package.json-scripts en probes. */
export function maakBron(werkmap: Werkmap, options: BronOptions = {}): string {
  const { bron } = werkmap;
  const files: Record<string, string> = { ...FILES };
  if (options.readme !== undefined) files['README.md'] = options.readme;
  if (options.gates !== null) files['.claude/gates.json'] = options.gates ?? TEMPLATE_GATES;
  const pkg = { name: 'app-template', type: 'module', scripts: options.scripts ?? {} };
  files['package.json'] = `${JSON.stringify(pkg, null, 2)}\n`;
  for (const [naam, inhoud] of Object.entries(options.probes ?? {})) files[`probe/${naam}`] = inhoud;
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(bron, file)), { recursive: true });
    writeFileSync(path.join(bron, file), content);
  }
  mkdirSync(path.join(bron, 'scripts/kit'), { recursive: true });
  cpSync(path.join(ROOT, 'scripts/kit/app-init.mjs'), path.join(bron, 'scripts/kit/app-init.mjs'));
  if (options.nodeModules !== false) {
    mkdirSync(path.join(bron, 'node_modules/.bin'), { recursive: true });
    writeFileSync(path.join(bron, 'node_modules/.bin/tool'), '#!/bin/sh\n');
  }
  git(bron, ['init', '-q', '-b', 'main']);
  git(bron, ['add', '-A']);
  git(bron, ['commit', '-q', '-m', 'bron']);
  return bron;
}

export interface Uitslag {
  code: number | null;
  stdout: string;
  stderr: string;
  alles: string;
}

/** Draait node synchroon met een eigen TMPDIR; combineert stdout en stderr in `alles`. */
export function draaiNode(args: string[], cwd: string, env: Record<string, string>): Uitslag {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    alles: `${result.stdout}\n${result.stderr}`,
  };
}

/**
 * Schrijft een driver die `draaiProef(bron, scripts, { bewaar })` uit check-app-init.mjs aanroept; de uitvoer en
 * exitcode van dat proces zijn die van de check. Argumenten: <bron> <json-scripts> [--bewaar].
 */
export function schrijfDriver(werkmap: Werkmap): string {
  const driver = path.join(werkmap.base, 'driver.mjs');
  writeFileSync(
    driver,
    [
      `import { draaiProef } from ${JSON.stringify(CHECK)};`,
      'const [bron, scripts, ...vlaggen] = process.argv.slice(2);',
      'const code = await draaiProef(bron, JSON.parse(scripts), { bewaar: vlaggen.includes("--bewaar") });',
      'process.exitCode = code;',
      '',
    ].join('\n'),
  );
  return driver;
}

/** Alle mappen in TMPDIR van de werkmap met dit prefix. */
export function overgebleven(werkmap: Werkmap, prefix: string): string[] {
  return readdirSync(werkmap.tmp).filter((naam) => naam.startsWith(prefix));
}

export function bewaardPad(uitvoer: string): string {
  const match = /kopie bewaard in (.+)$/m.exec(uitvoer);
  if (match?.[1] === undefined) throw new Error(`geen "kopie bewaard in" in de uitvoer:\n${uitvoer}`);
  return match[1].trim();
}
