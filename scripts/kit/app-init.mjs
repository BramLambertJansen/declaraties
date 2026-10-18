// pnpm app:init <slug> "<App-naam>" [--owner <login>] [--dry-run] (roadmap stuk 6): de hernoemstap uit docs/nieuwe-app.md
// (fase 5.2) als script, zodat elke nieuwe app hem hetzelfde doet. Eén keer, direct na de koppeling met de template; hij
// weigert als de app al hernoemd is. Raakt alleen de bestanden uit de tabel in nieuwe-app.md, plus de twee plekken met de
// app-naam (src/shared/app.ts voor mails, src/web/index.html voor de paginatitel).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const TEMPLATE_NAME = 'app-template';
const TEMPLATE_TITLE = 'App-template';
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 50;
// Een GitHub-login of een team (org/team).
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?$/;
const TEMPLATE_OWNER = '@bramlambertjansen';

const ONDERHOUD = '  "onderhoud": { "repository": "BramLambertJansen/template" },\n';

/** @param {string} file */
function readOptional(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export class AppInitError extends Error {}

/**
 * @typedef {{ slug: string, name: string, sha: string, owner?: string | undefined }} Options
 * @typedef {{ pad: string, inhoud: string }} Wijziging
 */

/** @param {Options} options */
function validate({ slug, name, sha, owner }) {
  if (!SLUG.test(slug) || slug.length > MAX_SLUG) {
    throw new AppInitError(
      `slug "${slug}": kleine letters, cijfers en streepjes, begint met een letter, hooguit ${String(MAX_SLUG)} tekens`,
    );
  }
  if (name.trim() === '' || name !== name.trim() || /[\r\n<>"`\\]/.test(name)) {
    throw new AppInitError('App-naam: niet leeg, geen spaties aan de randen, geen regeleinden of < > " ` \\');
  }
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new AppInitError(`template-SHA "${sha}" is geen git-hash`);
  if (owner !== undefined && !LOGIN.test(owner)) throw new AppInitError(`--owner "${owner}" is geen GitHub-login`);
}

/** @param {{ file: string, source: string }} target @param {string} search @param {string} replacement */
function replaceOnce({ file, source }, search, replacement) {
  if (!source.includes(search)) throw new AppInitError(`${file}: "${search}" niet gevonden; is de app al hernoemd?`);
  return source.replace(search, () => replacement);
}

/** @param {string} readme @param {string} name */
function renameReadme(readme, name) {
  const lines = readme.split('\n');
  if (lines[0] !== `# ${TEMPLATE_TITLE}` || lines[1] !== '' || lines[2]?.startsWith('Fundering') !== true) {
    throw new AppInitError('README.md: begint niet met "# App-template", een lege regel en de alinea "Fundering …"');
  }
  const start = lines.indexOf('## Nieuwe app starten');
  const end = start === -1 ? -1 : lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const kept = start === -1 ? lines : [...lines.slice(0, start), ...(end === -1 ? [] : lines.slice(end))];
  // Kop en eerste alinea (regel 3) vervangen; de rest blijft.
  kept[0] = `# ${name}`;
  kept[2] = 'Gebouwd op [BramLambertJansen/template](https://github.com/BramLambertJansen/template).';
  return `${kept.join('\n').trimEnd()}\n`;
}

/** @param {string} changelog @param {string} sha */
function renameChangelog(changelog, sha) {
  const start = changelog.indexOf('## [Unreleased]');
  if (start === -1) throw new AppInitError('CHANGELOG.md: "## [Unreleased]" niet gevonden');
  const next = changelog.indexOf('\n## ', start + 1);
  const rest = next === -1 ? '' : changelog.slice(next);
  return `${changelog.slice(0, start)}## [Unreleased]\n\n- Gestart vanaf template ${sha}.\n${rest}`;
}

/**
 * De wijzigingen voor een nieuwe app, zonder iets te schrijven.
 * @param {string} root
 * @param {Options} options
 * @returns {Wijziging[]}
 */
export function planAppInit(root, options) {
  validate(options);
  const read = (/** @type {string} */ file) => readFileSync(path.join(root, file), 'utf8');
  const pkg = read('package.json');
  if (!pkg.includes(`"name": "${TEMPLATE_NAME}"`)) {
    throw new AppInitError(`package.json heet niet meer "${TEMPLATE_NAME}": app:init draait maar één keer`);
  }
  /** @type {Wijziging[]} */
  const plan = [
    {
      pad: 'package.json',
      inhoud: replaceOnce(
        { file: 'package.json', source: pkg },
        `"name": "${TEMPLATE_NAME}"`,
        `"name": "${options.slug}"`,
      ),
    },
    { pad: 'README.md', inhoud: renameReadme(read('README.md'), options.name) },
    { pad: 'CHANGELOG.md', inhoud: renameChangelog(read('CHANGELOG.md'), options.sha) },
    {
      pad: 'src/shared/app.ts',
      inhoud: replaceOnce(
        { file: 'src/shared/app.ts', source: read('src/shared/app.ts') },
        `'${TEMPLATE_TITLE}'`,
        `'${options.name.replaceAll("'", "\\'")}'`,
      ),
    },
    {
      pad: 'src/web/index.html',
      inhoud: replaceOnce(
        { file: 'src/web/index.html', source: read('src/web/index.html') },
        `<title>${TEMPLATE_TITLE}</title>`,
        `<title>${options.name.replaceAll('&', '&amp;')}</title>`,
      ),
    },
  ];
  // De onderhoudsmodus hoort bij de template-repo, niet bij een app (ADR 0033 punt 2).
  const gates = readOptional(path.join(root, '.claude/gates.json'));
  if (gates?.includes(ONDERHOUD) === true)
    plan.push({ pad: '.claude/gates.json', inhoud: gates.replace(ONDERHOUD, '') });
  if (options.owner !== undefined) {
    const codeowners = read('.github/CODEOWNERS');
    if (!codeowners.includes(TEMPLATE_OWNER))
      throw new AppInitError(`.github/CODEOWNERS: ${TEMPLATE_OWNER} niet gevonden`);
    plan.push({ pad: '.github/CODEOWNERS', inhoud: codeowners.replaceAll(TEMPLATE_OWNER, `@${options.owner}`) });
  }
  return plan;
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { owner: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
  });
  const [slug, name] = positionals;
  if (slug === undefined || name === undefined || positionals.length !== 2) {
    console.error('Gebruik: pnpm app:init <slug> "<App-naam>" [--owner <github-login>] [--dry-run]');
    process.exit(2);
  }
  const root = process.cwd();
  let sha;
  try {
    sha = execFileSync('git', ['rev-parse', '--short', 'template/main'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    console.error('✗ app:init: remote template ontbreekt; koppel eerst (docs/nieuwe-app.md, fase 5.1)');
    process.exit(1);
  }
  try {
    const plan = planAppInit(root, { slug, name, sha, owner: values.owner });
    for (const { pad, inhoud } of plan) {
      if (!values['dry-run']) writeFileSync(path.join(root, pad), inhoud);
      console.info(`${values['dry-run'] ? '(dry-run) ' : ''}✓ ${pad}`);
    }
    if (!values['dry-run'])
      console.info('\nControleer met git diff en commit: git commit -am "chore: rename to ' + slug + '"');
  } catch (error) {
    if (!(error instanceof AppInitError)) throw error;
    console.error(`✗ app:init: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.main) main();
