// guard.yml voert uitsluitend deze versie uit main uit; PR-code wordt alleen als git-data gelezen (ADR 0027).
import {
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

/**
 * Geeft het bestand terug als de status alleen in de PR zelf staat (ADR 0029 punt 3): dan beslist `verifyInPrStatus` na de lus.
 * @param {{ file: string, before: string | null, after: string | null }} document @param {Context} context
 * @returns {string | null}
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
  if (['voorstel', 'voorgesteld'].includes(info.status) || document.before === document.after) return null;
  const target = { file: document.file, text: document.after };
  const valid = info.status === 'gebouwd' ? verifyBuilt(target, context) : canRecordStatus(target, context.authority);
  if (valid) return null;
  if (info.status !== 'gebouwd' && vanVoorstel(document)) return document.file;
  throw new Error(`${document.file}: ${GEEN_BESLUIT}`);
}

const RECORD = '.claude/decisions.json';
const GEEN_BESLUIT = 'status of inhoud heeft geen geldig besluit of bouwbewijs uit de vertrouwde basis';

/** De overgang komt van `voorstel`/`voorgesteld` of het bestand is nieuw (ADR 0029 punt 3). @param {{ file: string, before: string | null }} document */
function vanVoorstel({ file, before }) {
  const status = before === null ? null : documentInfo(file, before)?.status;
  return status === null || status === undefined ? before === null : ['voorstel', 'voorgesteld'].includes(status);
}

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

/** @param {{ status: string, pad: string, van?: string }[]} changes @param {Context} context */
function verifyScope(changes, context) {
  const mandated = mandatedSpecs(context);
  if (mandated.length === 0) return; // Gewoon railwerk blijft onder de bestaande eigenaarreview van de diff-guard vallen.
  const files = changes.flatMap(({ pad, van }) => [pad, ...(van === undefined ? [] : [van])]);
  for (const file of files.filter((candidate) => candidate !== ROADMAP)) verifyScopedFile(file, context);
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

/** @param {Context} context @param {string} sha @param {string} file */
function infoOp(context, sha, file) {
  return documentInfo(file, gitText(context.root, ['show', `${sha}:${file}`]) ?? '');
}

/**
 * De nieuwste commit in de PR die de status van `file` op de eindstatus zette, met zijn ouder.
 * @param {string} file @param {Context} context
 */
function statusCommit(file, context) {
  const eind = infoOp(context, context.sha, file)?.status;
  const lijst = (
    gitText(context.root, ['rev-list', '--no-merges', '--reverse', `${context.split}..${context.sha}`]) ?? ''
  )
    .split('\n')
    .filter(Boolean);
  const gevonden = lijst.flatMap((commit) => {
    const parent = gitText(context.root, ['rev-parse', `${commit}^`])?.trim();
    const zet =
      parent !== undefined &&
      infoOp(context, commit, file)?.status === eind &&
      infoOp(context, parent, file)?.status !== eind;
    return zet ? [{ commit, parent }] : [];
  });
  return gevonden.at(-1) ?? null;
}

/** (a), (b) en (c) van ADR 0029 punt 3. (c) is frictie tegen een per ongeluk gepushte status, geen identiteitsbewijs. @param {string} file @param {Context} context */
function verifyStatusCommit(file, context) {
  const gevonden = statusCommit(file, context);
  if (gevonden === null) throw new Error(`${file}: geen commit in de PR die de statusregel zette`);
  const { commit, parent } = gevonden;
  if (!statusOnlyDiff(context.root, { from: parent, to: commit }, { testpaden: context.config.testpaden }))
    throw new Error(`${file}: de commit die de statusregel zette wijzigt meer dan statusregels`);
  if (infoOp(context, commit, file)?.digest !== infoOp(context, context.sha, file)?.digest)
    throw new Error(`${file}: de inhoud wijzigde nadat de status was gezet`);
  const committer = gitText(context.root, ['log', '-1', '--format=%cn%x00%ce', commit])?.trim();
  if (committer !== 'GitHub\0noreply@github.com')
    throw new Error(`${file}: de statusregel is niet gezet via de GitHub-webeditor (committer web-flow)`);
}

/** Documenten die in deze PR een eigenaarstatus krijgen, met of zonder record. @param {{ pad: string }[]} changes @param {Context} context */
function eigenaarStatussen(changes, context) {
  return changes.flatMap(({ pad }) => {
    const na = documentInfo(pad, context.authority.working(pad) ?? '');
    const voor = documentInfo(pad, context.authority.trusted(pad) ?? '');
    const gestart = voor === null || ['voorstel', 'voorgesteld'].includes(voor.status);
    return na !== null && gestart && !['voorstel', 'voorgesteld', 'gebouwd'].includes(na.status) ? [pad] : [];
  });
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
 * Een statusovergang in de PR zelf (ADR 0029 punt 3 en 7): alleen in een herkende lane en met een goede statuscommit.
 * @param {{ pending: string[], changes: { status: string, pad: string, van?: string }[] }} pr @param {Context} context
 * @returns {string | null} de melding voor de uitvoer, of null zonder in-PR-status
 */
function verifyInPrStatus({ pending, changes }, context) {
  const [eerste] = pending;
  if (eerste === undefined) return null;
  const besluiten = eigenaarStatussen(changes, context);
  const mini =
    besluiten.length === 1 && documentKind(eerste) === 'spec' && isMiniSpec(context.authority.working(eerste) ?? '');
  const { lane, reden } = laneVan({ changes, besluiten, mini, config: context.config });
  if (lane === null) throw new Error(`${eerste}: ${GEEN_BESLUIT}; geen herkende lane: ${reden}`);
  verifyGeenRename(eerste, changes, context);
  if (lane === 'feature') verifyFeatureInhoud(eerste, changes, context);
  if (
    lane === 'framework' &&
    changes.some(({ pad }) => pad === RECORD) &&
    !recordAlleenBesluit({
      basis: context.authority.trusted(RECORD),
      head: context.authority.working(RECORD),
      file: eerste,
    })
  )
    throw new Error(`${RECORD}: wijzigt meer dan het record van ${eerste}`);
  verifyStatusCommit(eerste, context);
  return `${eerste}: statusovergang in de PR (${lane}-lane); bevoegdheid is de merge door de eigenaar (overgang, ADR 0017)`;
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
  const pending = changes.flatMap(({ pad }) => {
    const wacht = verifyDocument({ file: pad, before: authority.trusted(pad), after: snapshot.working(pad) }, context);
    return wacht === null ? [] : [wacht];
  });
  const melding = verifyInPrStatus({ pending, changes }, context);
  verifyScope(changes, context);
  console.log('document-status: besluiten, bouwbewijs en eventuele taakscope gecontroleerd vanuit main');
  if (melding !== null) console.log(melding);
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
