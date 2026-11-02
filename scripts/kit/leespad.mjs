// Bytes van het verplichte leespad per scenario (V2 meten): `pnpm leespad [--json] [--ref <git-ref>]`.
// Zonder --ref uit de werkmap, met --ref via `git show <ref>:<pad>`. Een bestand dat er niet is telt 0 en staat in `ontbreekt`.
// Getest in test/rails/meting-kerncijfers-leespad.test.ts.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCENARIOS = {
  'nieuwe-feature': [
    'AGENTS.md',
    'CLAUDE.md',
    '.claude/agents/architect.md',
    '.claude/skills/spec/SKILL.md',
    'docs/framework.md',
    'docs/gouden-pad.md',
    'docs/dod.md',
  ],
  'lichte-fix': ['AGENTS.md', 'CLAUDE.md', '.claude/agents/developer.md'],
  review: ['.claude/agents/reviewer.md', 'docs/dod.md', 'docs/framework.md'],
};

/**
 * @param {(pad: string) => string | Buffer | null} lees null: het bestand bestaat niet
 * @param {Record<string, readonly string[]>} scenarios
 */
export function leespad(lees, scenarios) {
  /** @type {Record<string, { bytes: number, ontbreekt: string[] }>} */
  const uit = {};
  for (const [naam, paden] of Object.entries(scenarios)) {
    const telling = { bytes: 0, ontbreekt: /** @type {string[]} */ ([]) };
    for (const pad of paden) {
      const inhoud = lees(pad);
      if (inhoud === null) telling.ontbreekt.push(pad);
      else telling.bytes += Buffer.byteLength(inhoud);
    }
    uit[naam] = telling;
  }
  return uit;
}

/** @param {readonly string[]} args */
function refUit(args) {
  const i = args.findIndex((a) => a === '--ref' || a.startsWith('--ref='));
  if (i === -1) return undefined;
  const arg = args[i] ?? '';
  return arg.startsWith('--ref=') ? arg.slice('--ref='.length) : (args[i + 1] ?? '');
}

/** @param {string} ref @param {string} cwd */
function gitLezer(ref, cwd) {
  if (ref === '' || ref.startsWith('-')) throw new Error(`ongeldige ref: ${ref}`);
  /** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */
  const opties = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], opties);
  } catch {
    throw new Error(`onbekende ref: ${ref}`);
  }
  return (/** @type {string} */ pad) => {
    try {
      return execFileSync('git', ['show', `${ref}:${pad}`], { ...opties, maxBuffer: 16 * 1024 * 1024 });
    } catch {
      return null;
    }
  };
}

/** @param {readonly string[]} argv */
function main(argv) {
  const cwd = process.cwd();
  try {
    const ref = refUit(argv);
    const lees =
      ref === undefined
        ? (/** @type {string} */ pad) => {
            try {
              return readFileSync(path.join(cwd, pad));
            } catch {
              return null;
            }
          }
        : gitLezer(ref, cwd);
    const scenarios = leespad(lees, SCENARIOS);
    if (argv.includes('--json')) {
      process.stdout.write(`${JSON.stringify({ scenarios }, null, 2)}\n`);
      return;
    }
    const regels = Object.entries(scenarios).map(([naam, t]) => {
      const mist = t.ontbreekt.length === 0 ? '' : ` (ontbreekt: ${t.ontbreekt.join(', ')})`;
      return `${naam}: ${String(t.bytes)} bytes${mist}`;
    });
    process.stdout.write(`${regels.join('\n')}\n`);
  } catch (fout) {
    process.stderr.write(`leespad: ${fout instanceof Error ? fout.message : String(fout)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
