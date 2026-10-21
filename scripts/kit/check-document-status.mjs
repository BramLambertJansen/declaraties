// guard.yml voert uitsluitend deze versie uit main uit; PR-code wordt alleen als git-data gelezen (ADR 0027).
import { appendFileSync } from 'node:fs';
import {
  A4_MELDING,
  beslisOvergang,
  documentInfo,
  documentKind,
  builtReference,
  statusregelOvertreding,
} from '../../rails/hooks/lib/document-state.mjs';
import { readAuthority, gitText } from '../../rails/hooks/lib/authority-context.mjs';
import { canRecordStatus, canWriteProtected } from '../../rails/hooks/lib/task-authority.mjs';
import { canRecordBuilt } from '../../rails/hooks/lib/built-evidence.mjs';
import { loadConfig, globMatch } from '../../rails/hooks/lib/rolhek.mjs';
import { parseNameStatus } from './diff-guard.mjs';
import { pullRequest, checkRuns } from './github-evidence.mjs';
import { kaderVan, ROADMAP, taakVinkje } from './roadmap-item.mjs';
import { regularGitFile, statusOnlyDiff, isAncestor } from './status-git.mjs';
import { laneVan, isMiniSpec, migratieOvertreding, recordAlleenBesluit } from './lane.mjs';

/** @typedef {{ root: string, sha: string, split: string, adrBestanden: string[], authority: import('../../rails/hooks/lib/task-authority.mjs').Authority, config: import('../../rails/hooks/lib/rolhek.mjs').Config }} Context */

/** @param {string} name */
function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt`);
  return value;
}

/** @param {{ file: string, text: string }} document @param {Context} context */
function verifyBuilt(document, context) {
  const reference = builtReference(document.text);
  if (reference === null) return false;
  const commits = { from: reference.sha, to: context.sha };
  const evidence = {
    pr: pullRequest(context.authority.repository, reference.pr),
    checks: checkRuns(context.authority.repository, reference.sha),
    headSha: context.sha,
    ancestor: isAncestor(context.root, commits),
    onlyStatuses: statusOnlyDiff(context.root, commits, { testpaden: context.config.testpaden }),
  };
  return canRecordBuilt(document, evidence, context.authority);
}

/** @typedef {{ file: string, nieuw: boolean, record: boolean }} Besluit */

/**
 * Controleert één document. Geeft een besluit terug als het document in deze PR een eigenaarstatus krijgt of een goedgekeurde
 * spec van inhoud wijzigt (ADR 0038 punt 1 en 5); `record` zegt of een record op main het al draagt.
 * @param {{ file: string, before: string | null, after: string | null }} document @param {Context} context
 * @returns {Besluit | null}
 */
function verifyDocument(document, context) {
  if (documentKind(document.file) === null || document.after === null) return null;
  const info = documentInfo(document.file, document.after);
  if (info === null || !regularGitFile(context.root, document.file, context.sha))
    throw new Error(`${document.file}: ongeldige status of symlink`);
  if (info.kind === 'adr') {
    const fout = statusregelOvertreding(
      statusLine(document.after) ?? '',
      statusLine(document.before),
      context.adrBestanden,
    );
    if (fout !== null) throw new Error(`${document.file}: ${fout}`);
  }
  if (document.before === document.after) return null;
  const { uitslag, nieuw } = beslisOvergang(document.file, document.before, document.after);
  if (uitslag === 'a4') throw new Error(`${document.file}: ${A4_MELDING}`);
  if (uitslag === 'vrij') return null;
  const target = { file: document.file, text: document.after };
  if (uitslag === 'gebouwd') {
    if (verifyBuilt(target, context)) return null;
    throw new Error(`${document.file}: ${GEEN_BESLUIT}`);
  }
  const record = canRecordStatus(target, context.authority);
  if (uitslag === 'geweigerd' && !record) throw new Error(`${document.file}: ${GEEN_BESLUIT}`);
  if (uitslag === 'geweigerd') return null;
  verifyVervanger(document.file, info.status, context);
  return { file: document.file, nieuw, record };
}

/**
 * A4 (ADR 0038 punt 2): een ADR met een eigenaarstatus op main verdwijnt niet, ook niet via een rename.
 * @param {{ status: string, pad: string, van?: string }[]} changes @param {Context} context
 */
function verifyGeenAdrWeg(changes, context) {
  const weg = changes.flatMap(({ status, pad, van }) =>
    status === 'D' ? [pad] : status === 'R' && van !== undefined ? [van] : [],
  );
  for (const file of weg.filter((pad) => documentKind(pad) === 'adr')) {
    const status = documentInfo(file, context.authority.trusted(file) ?? '')?.status;
    if (status !== undefined && status !== 'voorgesteld')
      throw new Error(`${file}: verwijderd met status ${status}; ${A4_MELDING}`);
  }
}

/** `vervangen door NNNN` wijst naar een ADR op main of in de PR (ADR 0038 punt 5). @param {string} file @param {string} status @param {Context} context */
function verifyVervanger(file, status, context) {
  const nummer = /^vervangen door (\d{4})$/.exec(status)?.[1];
  if (nummer === undefined || file.startsWith(`docs/adr/${nummer}-`)) return;
  if (!context.adrBestanden.some((naam) => naam.startsWith(`${nummer}-`)))
    throw new Error(`${file}: vervangen door ${nummer}, maar dat ADR staat niet op main of in de PR`);
}

const RECORD = '.claude/decisions.json';
const GEEN_BESLUIT = 'status of inhoud heeft geen geldig besluit of bouwbewijs uit de vertrouwde basis';

/** De ADR-statusregel van een document, of null. @param {string | null} text */
function statusLine(text) {
  return (
    text
      ?.replaceAll('\r\n', '\n')
      .split('\n')
      .find((line) => line.startsWith('Status:')) ?? null
  );
}

/** Bestandsnamen van de ADR's op HEAD. @param {string} root @param {string} sha */
function adrFiles(root, sha) {
  const names = gitText(root, ['ls-tree', '--name-only', '-z', sha, 'docs/adr/']) ?? '';
  return names.split('\0').flatMap((file) => /^docs\/adr\/(\d{4}-[^/]+\.md)$/.exec(file)?.[1] ?? []);
}

/** De specs met een actief mandaat op deze repository en branch. @param {Context} context */
function mandatedSpecs(context) {
  return context.authority.registry.decisions
    .filter(
      (entry) =>
        entry.repository === context.authority.repository &&
        entry.branch === context.authority.branch &&
        entry.status === 'goedgekeurd' &&
        documentKind(entry.file) === 'spec',
    )
    .map((entry) => entry.file);
}

/** @param {string} file @param {Context} context */
function goesBuilt(file, context) {
  const before = documentInfo(file, gitText(context.root, ['show', `${context.split}:${file}`]) ?? '');
  const after = documentInfo(file, gitText(context.root, ['show', `${context.sha}:${file}`]) ?? '');
  return before?.status !== 'gebouwd' && after?.status === 'gebouwd';
}

/** B1 (spec taakmandaat-vervolg): alleen het vinkje van een spec die in deze PR naar gebouwd gaat mag in de roadmap wijzigen. @param {{ status: string, pad: string, van?: string }[]} changes @param {string[]} mandated @param {Context} context */
function verifyRoadmap(changes, mandated, context) {
  const touched = changes.filter(({ pad, van }) => pad === ROADMAP || van === ROADMAP);
  const intact = touched.length === 1 && touched[0]?.status === 'M';
  const names = gitText(context.root, ['ls-tree', '-r', '--name-only', '-z', context.sha]) ?? '';
  const message = taakVinkje({
    basis: gitText(context.root, ['show', `${context.split}:${ROADMAP}`]),
    head: intact ? gitText(context.root, ['show', `${context.sha}:${ROADMAP}`]) : null,
    specs: mandated.filter((file) => goesBuilt(file, context)),
    kader: kaderVan({
      packageJson: gitText(context.root, ['show', `${context.sha}:package.json`]),
      bestanden: names.split('\0').filter(Boolean),
      testpaden: context.config.testpaden,
    }),
  });
  if (message !== null) throw new Error(message);
}

/**
 * Een besluitdocument zelf valt buiten de taakscope: verifyDocument en verifyInPrStatus beoordelen het (ADR 0038 punt 5).
 * Wijzigt de inhoud van een gemandateerde spec, dan vervalt dat mandaat (punt 9): code eronder faalt hier tot er een nieuw record is.
 * @param {{ status: string, pad: string, van?: string }[]} changes @param {Context} context @param {readonly string[]} besluiten
 */
function verifyScope(changes, context, besluiten) {
  const mandated = mandatedSpecs(context);
  if (mandated.length === 0) return; // Gewoon railwerk blijft onder de bestaande eigenaarreview van de diff-guard vallen.
  const files = changes.flatMap(({ pad, van }) => [pad, ...(van === undefined ? [] : [van])]);
  for (const file of files.filter((candidate) => candidate !== ROADMAP && !besluiten.includes(candidate)))
    verifyScopedFile(file, context);
  if (files.includes(ROADMAP)) verifyRoadmap(changes, mandated, context);
}

/** @param {string} file @param {{ authority: import('../../rails/hooks/lib/task-authority.mjs').Authority, config: import('../../rails/hooks/lib/rolhek.mjs').Config }} context */
function verifyScopedFile(file, context) {
  if (!context.config.gates.some((glob) => globMatch(glob, file))) return;
  if (
    context.config.testpaden.some((glob) => globMatch(glob, file)) &&
    !/^(?:test\/rails\/fixtures\/|test\/setup\/)/.test(file)
  )
    return;
  if (documentKind(file) !== null) {
    const before = documentInfo(file, context.authority.trusted(file) ?? '');
    const after = documentInfo(file, context.authority.working(file) ?? '');
    if (before !== null && after !== null && before.digest === after.digest) return;
  }
  if (!canWriteProtected({ file, role: 'developer' }, context.authority))
    throw new Error(`${file}: buiten het broncodemandaat; bewaking blijft beschermd`);
}

/** Een hernoemd of gekopieerd document met een eigenaarstatus op main telt niet als nieuw voorstel. @param {string} file @param {{ pad: string, van?: string }[]} changes @param {Context} context */
function verifyGeenRename(file, changes, context) {
  const van = changes.find((change) => change.pad === file)?.van;
  if (van === undefined) return;
  const status = documentInfo(van, context.authority.trusted(van) ?? '')?.status;
  if (status !== undefined && !['voorstel', 'voorgesteld'].includes(status))
    throw new Error(
      `${file}: hernoemd of gekopieerd van ${van} (${status}); een nieuwe status vraagt een record op main`,
    );
}

/** Inhoud van de lane: alleen een nieuwe tabel in migraties, en dan een kop "Datawijzigingen" in de mini-spec. @param {string} file @param {{ status: string, pad: string }[]} changes @param {Context} context */
function verifyFeatureInhoud(file, changes, context) {
  const migraties = changes.filter(
    ({ status, pad }) => status === 'A' && context.config.migraties.some((glob) => globMatch(glob, pad)),
  );
  for (const { pad } of migraties) {
    const fout = migratieOvertreding(gitText(context.root, ['show', `${context.sha}:${pad}`]) ?? '\0');
    if (fout !== null) throw new Error(`${pad}: ${fout}; dat is framework-lane met het volledige sjabloon`);
  }
  if (
    migraties.length > 0 &&
    !/^## Datawijzigingen \(met grants\)\n+(?!##)\S/m.test(context.authority.working(file) ?? '')
  )
    throw new Error(`${file}: een nieuwe migratie vraagt de kop "Datawijzigingen (met grants)" in de mini-spec`);
}

/**
 * Besluiten in de PR zelf (ADR 0038 punt 1 en 5): zonder record alleen in een besluit-PR (framework-lane: alleen `docs/adr/`,
 * `docs/specs/` en het record) of in de feature-lane (één nieuwe mini-spec met code). De merge door de eigenaar is het besluit.
 * @param {{ besluiten: Besluit[], changes: { status: string, pad: string, van?: string }[] }} pr @param {Context} context
 * @returns {string | null} de melding voor de uitvoer, of null zonder besluit zonder record
 */
function verifyInPrStatus({ besluiten, changes }, context) {
  const open = besluiten.filter(({ record }) => !record);
  const [eerste] = open;
  if (eerste === undefined) return null;
  const bestanden = besluiten.map(({ file }) => file);
  const [enige] = besluiten;
  const mini =
    besluiten.length === 1 &&
    enige?.nieuw === true &&
    documentKind(enige.file) === 'spec' &&
    isMiniSpec(context.authority.working(enige.file) ?? '');
  const { lane, reden } = laneVan({ changes, besluiten: bestanden, mini, config: context.config });
  if (lane === null) throw new Error(`${bestanden.join(', ')}: ${GEEN_BESLUIT}; geen herkende lane: ${reden}`);
  for (const { file } of open) verifyGeenRename(file, changes, context);
  if (lane === 'feature') verifyFeatureInhoud(eerste.file, changes, context);
  if (
    lane === 'framework' &&
    changes.some(({ pad }) => pad === RECORD) &&
    !recordAlleenBesluit({
      basis: context.authority.trusted(RECORD),
      head: context.authority.working(RECORD),
      file: bestanden,
    })
  )
    throw new Error(`${RECORD}: wijzigt meer dan het record van ${bestanden.join(', ')}`);
  return `statusovergang in de PR (${lane === 'framework' ? 'besluit-PR, framework' : lane}-lane): ${bestanden.join(', ')}; het besluit is de merge door de eigenaar (ADR 0038)`;
}

/** Een GitHub Actions-foutannotatie; `%`, CR en LF worden geëscaped zoals `@actions/core` doet, zodat een bestandsnaam geen commando kan invoegen. @param {string} message */
export function annotatie(message) {
  const veilig = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  return `::error title=document-status::${veilig}`;
}

/** Korte stapsamenvatting voor de job (ADR 0031 besluit 1). @param {string} tekst */
function samenvatting(tekst) {
  const bestand = process.env['GITHUB_STEP_SUMMARY'];
  if (bestand !== undefined && bestand !== '') appendFileSync(bestand, tekst);
}

async function main() {
  const root = process.cwd();
  const base = requiredEnv('BASE_SHA');
  const sha = requiredEnv('HEAD_SHA');
  if (![base, sha].every((value) => /^[0-9a-f]{40}$/.test(value))) throw new Error('Geen volledige commit-SHA');
  const authority = readAuthority({ root, base, repository: requiredEnv('REPO'), branch: requiredEnv('HEAD_REF') });
  if (authority === null) throw new Error('Geen leesbare vertrouwde basis voor statuscontrole');
  /** @type {import('../../rails/hooks/lib/task-authority.mjs').Authority} */
  const snapshot = {
    ...authority,
    working: (file) => gitText(root, ['show', `${sha}:${file}`]),
    safe: (file) =>
      gitText(root, ['ls-tree', sha, '--', file]) === ''
        ? regularGitFile(root, file, base)
        : regularGitFile(root, file, sha),
  };
  const split = gitText(root, ['merge-base', base, sha])?.trim();
  if (split === undefined) throw new Error('Geen leesbare merge-base');
  const diff = gitText(root, [
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    '--no-ext-diff',
    '--no-textconv',
    split,
    sha,
  ]);
  if (diff === null) throw new Error('Diff is niet leesbaar');
  const changes = parseNameStatus(diff);
  const config = loadConfig(gitText(root, ['show', `${base}:.claude/gates.json`]) ?? '');
  /** @type {Context} */
  const context = { root, sha, split, adrBestanden: adrFiles(root, sha), authority: snapshot, config };
  verifyGeenAdrWeg(changes, context);
  const besluiten = changes.flatMap(({ pad }) => {
    const besluit = verifyDocument(
      { file: pad, before: authority.trusted(pad), after: snapshot.working(pad) },
      context,
    );
    return besluit === null ? [] : [besluit];
  });
  const melding = verifyInPrStatus({ besluiten, changes }, context);
  verifyScope(
    changes,
    context,
    besluiten.map(({ file }) => file),
  );
  console.log('document-status: besluiten, bouwbewijs en eventuele taakscope gecontroleerd vanuit main');
  samenvatting(
    `## document-status: goedgekeurd\n\n${melding ?? 'besluiten, bouwbewijs en taakscope gecontroleerd vanuit main'}\n`,
  );
  if (melding !== null) console.log(melding);
}

if (import.meta.main)
  await main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.log(annotatie(message));
    console.error(message.replaceAll(/[\r\n]+/g, ' '));
    samenvatting(`## document-status: afgekeurd\n\n${message.replaceAll(/[\r\n]+/g, ' ')}\n`);
    process.exitCode = 1;
  });
