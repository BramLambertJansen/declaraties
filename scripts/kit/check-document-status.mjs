// guard.yml voert uitsluitend deze versie uit main uit; PR-code wordt alleen als git-data gelezen (ADR 0046).
import { appendFileSync } from 'node:fs';
import {
  A4_MELDING,
  beslisOvergang,
  documentInfo,
  documentKind,
  builtReference,
  nieuweHerzieningsregels,
  statusregelOvertreding,
} from '../../rails/hooks/lib/document-state.mjs';
import { readAuthority, gitText } from '../../rails/hooks/lib/authority-context.mjs';
import { canRecordStatus } from '../../rails/hooks/lib/task-authority.mjs';
import { builtRefusal } from '../../rails/hooks/lib/built-evidence.mjs';
import { loadConfig, globMatch } from '../../rails/hooks/lib/rolhek.mjs';
import { parseNameStatus } from './diff-guard.mjs';
import { pullRequest, checkRuns } from './github-evidence.mjs';
import { regularGitFile, statusOnlyDiff, isAncestor, mergedEvidence } from './status-git.mjs';
import { laneVan, migratieOvertreding } from './lane.mjs';
import { isFunctionalUiSpec, isUiTest, testChangeRisk } from '../../rails/hooks/lib/functional-ui.mjs';
import { functionalUiApproval, verifyFunctionalUiChanges } from './functional-ui-status.mjs';
import { adrNumber, duplicateAdrNumbers } from './adr-numbers.mjs';
import path from 'node:path';

/** @typedef {{ root: string, base: string, sha: string, split: string, pr: number | null, code: boolean, adrBestanden: string[], adrArchief: string[], authority: import('../../rails/hooks/lib/task-authority.mjs').Authority, config: import('../../rails/hooks/lib/rolhek.mjs').Config }} Context */

/** @param {string} name */
function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt`);
  return value;
}

/**
 * Null bij geldig bouwbewijs, anders de toevoeging aan de melding (leeg voor de route van een open PR).
 * @param {{ file: string, text: string }} document @param {Context} context @returns {string | null}
 */
function verifyBuilt(document, context) {
  const reference = builtReference(document.text);
  if (reference?.sha === undefined) return '';
  const pr = pullRequest(context.authority.repository, reference.pr);
  // Gemergde PR (spec gebouwd-na-merge): de PR wijzigt alleen statusregels tegenover de basis; het bewijs komt uit de mergecommit.
  const commits = pr.merged ? { from: context.split, to: context.sha } : { from: reference.sha, to: context.sha };
  const evidence = {
    pr,
    checks: checkRuns(context.authority.repository, reference.sha),
    headSha: context.sha,
    ancestor: isAncestor(context.root, commits),
    onlyStatuses: statusOnlyDiff(context.root, commits, { testpaden: context.config.testpaden }),
    uiApproval: functionalUiApproval({
      root: context.root,
      base: context.base,
      sha: reference.sha,
      repository: context.authority.repository,
      file: document.file,
      text: document.text,
    }),
    ...(pr.merged && {
      merged: mergedEvidence(context.root, { mergeSha: pr.mergeSha ?? '', head: context.split, file: document.file }),
    }),
  };
  const bezwaar = builtRefusal(document, evidence, context.authority);
  if (bezwaar === null) return null;
  return pr.merged ? `; gebouwd na de merge vereist ${bezwaar}` : '';
}

/** @typedef {{ file: string, opMain: boolean }} Besluit */

/**
 * Controleert één document. Geeft een besluit terug als het document in deze PR een eigenaarstatus krijgt of een goedgekeurde
 * spec van inhoud wijzigt (ADR 0046 punt 1 en 5); `opMain` zegt of main dezelfde status en inhoud al heeft.
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
      // Een link naar een gearchiveerd ADR lost op zoals in check-docs (framework §10).
      [...context.adrBestanden, ...context.adrArchief],
    );
    if (fout !== null) throw new Error(`${document.file}: ${fout}`);
  }
  if (document.before === document.after) return null;
  const { uitslag } = beslisOvergang(document.file, document.before, document.after);
  if (uitslag === 'a4') throw new Error(`${document.file}: ${A4_MELDING}`);
  if (uitslag === 'vrij') return null;
  // Een herschreven geaccepteerd ADR is een besluit: alleen een besluit-PR laat het door (verifyInPrStatus).
  if (uitslag === 'herzien') {
    verifyHerzieningPr(document.file, nieuweHerzieningsregels(document.before ?? '', document.after), context.pr);
    return { file: document.file, opMain: false };
  }
  const target = { file: document.file, text: document.after };
  if (uitslag === 'gebouwd') return verifyGebouwd(document, target, context);
  const opMain = canRecordStatus(target, context.authority);
  if (uitslag === 'geweigerd' && !opMain) throw new Error(`${document.file}: ${GEEN_BESLUIT}`);
  if (uitslag === 'geweigerd') return null;
  verifyVervanger(document.file, info.status, context);
  return { file: document.file, opMain };
}

/**
 * `gebouwd` met SHA vraagt bouwbewijs (ADR 0046 punt 10). Zonder SHA (ADR 0062 punt 4) alleen met het nummer van deze PR en code
 * buiten `docs/` en `CHANGELOG.md`; de ruleset eist bij de merge de verplichte checks op de head. Een nieuwe spec of nieuwe inhoud is dan ook een
 * besluit, dat de lane- en volgordetoets van `verifyInPrStatus` krijgt.
 * @param {{ file: string, before: string | null }} document @param {{ file: string, text: string }} target @param {Context} context
 * @returns {Besluit | null}
 */
function verifyGebouwd(document, target, context) {
  const reference = builtReference(target.text);
  if (reference?.sha !== undefined) {
    const bezwaar = verifyBuilt(target, context);
    if (bezwaar === null) return null;
    throw new Error(`${document.file}: ${GEEN_BESLUIT}${bezwaar}`);
  }
  if (reference === null || context.pr === null || reference.pr !== context.pr || !context.code)
    throw new Error(
      `${document.file}: ${GEEN_BESLUIT}; gebouwd zonder SHA vraagt het nummer van deze PR en code buiten docs/ en CHANGELOG.md (ADR 0062)`,
    );
  const oud = document.before === null ? null : documentInfo(document.file, document.before);
  // Een vervallen spec komt niet terug (zoals `vervallen` → `goedgekeurd`, ADR 0046 punt 5).
  if (oud !== null && !['voorstel', 'goedgekeurd', 'gebouwd'].includes(oud.status))
    throw new Error(
      `${document.file}: ${GEEN_BESLUIT}; ${oud.status} naar gebouwd kan niet; een nieuwe spec vraagt een besluit-PR`,
    );
  const info = documentInfo(document.file, target.text);
  if (oud !== null && oud.status !== 'voorstel' && oud.digest === info?.digest) return null;
  return { file: document.file, opMain: false };
}

/**
 * ADR 0062 punt 3: de eerste commit die een besluitspec raakt (ook onder een oude naam), staat vóór de eerste commit met een
 * bestand buiten `docs/`. Merges tellen niet mee; wat een merge van main binnenbrengt, staat al in de basis.
 * @param {string[]} specs @param {Context} context
 */
function verifyVolgorde(specs, context) {
  const bereik = `${context.split}..${context.sha}`;
  // Nieuwste eerst: `--follow` werkt niet samen met `--reverse`.
  const lijst = (/** @type {string[]} */ args) => {
    const uit = gitText(context.root, ['log', '--no-merges', '--format=%H', ...args]);
    if (uit === null) throw new Error('Geschiedenis van de PR is niet leesbaar (volgorde, ADR 0062)');
    return uit.split('\n').filter(Boolean);
  };
  const volgorde = lijst(['--topo-order', bereik]).reverse();
  const eersteCode = lijst([bereik, '--', '.', ':(exclude)docs/']).at(-1);
  if (eersteCode === undefined) return;
  for (const spec of specs) {
    const eersteSpec = lijst(['--follow', bereik, '--', spec]).at(-1);
    if (eersteSpec === undefined || volgorde.indexOf(eersteSpec) >= volgorde.indexOf(eersteCode))
      throw new Error(
        `${spec}: de spec staat niet in een commit vóór de eerste code of test (volgorde, ADR 0062 punt 3); commit de spec eerst`,
      );
  }
}

/**
 * Een nieuwe herzieningsregel noemt deze PR (`PR_NUMBER` uit guard.yml); zonder geldig PR-nummer faalt een herschrijving dicht.
 * @param {string} file @param {string[]} regels @param {number | null} pr
 */
function verifyHerzieningPr(file, regels, pr) {
  const fout = regels.find((regel) => pr === null || /^Herzien: \S+ \(#(\d+)\):/.exec(regel)?.[1] !== String(pr));
  if (fout === undefined) return;
  const verwacht = pr === null ? 'geen geldig PR_NUMBER' : `verwacht (#${String(pr)})`;
  throw new Error(`${file}: herzieningsregel "${fout}" noemt niet deze PR (${verwacht}); ${A4_MELDING}`);
}

/**
 * Nummers blijven (ADR 0046 punt 2): een toegevoegd ADR krijgt geen nummer dat op de basis ooit verwijderd is.
 * @param {{ status: string, pad: string }[]} changes @param {Context} context
 */
function verifyNummerVrij(changes, context) {
  const dubbel = duplicateAdrNumbers([
    ...context.adrBestanden.map((file) => `docs/adr/${file}`),
    ...context.adrArchief.map((file) => `${ARCHIEF}${file}`),
  ]).find(({ key }) => key !== 'docs:adr:0039:dubbel');
  if (dubbel !== undefined) throw new Error(dubbel.message);
  const nummersOp = (/** @type {string} */ sha) =>
    new Set([...adrFiles(context.root, sha), ...adrFiles(context.root, sha, ARCHIEF)].map((file) => file.slice(0, 4)));
  const opBasis = nummersOp(context.base);
  const opSplit = nummersOp(context.split);
  const log = gitText(context.root, [
    'log',
    context.base,
    '--full-history',
    '--no-renames',
    '--diff-filter=D',
    '--format=',
    '--name-only',
    '--',
    'docs/adr/',
  ]);
  if (log === null) throw new Error('Geschiedenis van docs/adr/ is niet leesbaar (nummers blijven, ADR 0046 punt 2)');
  const gebruikt = new Set(log.split('\n').flatMap((pad) => adrNumber(pad) ?? []));
  for (const { status, pad } of changes) {
    const n = adrNumber(pad);
    if (!['A', 'R'].includes(status) || n === undefined) continue;
    if (!opSplit.has(n) && opBasis.has(n) && context.authority.trusted(pad) !== context.authority.working(pad))
      throw new Error(`${pad}: nummer ${n} is inmiddels op main gebruikt; werk eerst de branch bij`);
    if (gebruikt.has(n) && !opBasis.has(n))
      throw new Error(`${pad}: nummer ${n} is al gebruikt door een verwijderd ADR; kies het volgende vrije nummer`);
  }
}

/**
 * Na een verwijdering wijst elke `vervangen door NNNN` die overblijft naar een ADR dat na de PR bestaat; het archief telt
 * mee als doel en als verwijzer (ADR 0053 punt 5).
 * @param {Context} context
 */
function verifyVervangersBestaan(context) {
  const nummers = new Set([...context.adrBestanden, ...context.adrArchief].map((f) => f.slice(0, 4)));
  const paden = [
    ...context.adrBestanden.map((f) => `docs/adr/${f}`),
    ...context.adrArchief.map((f) => `${ARCHIEF}${f}`),
  ];
  /** @type {Map<string, string>} */
  const vervangers = new Map();
  for (const file of paden) {
    const info = documentInfo(file, context.authority.working(file) ?? '');
    if (info === null) throw new Error(`${file}: ongeldige ADR-status`);
    const doel = /^vervangen door (\d{4})$/.exec(info.status)?.[1];
    if (doel !== undefined && !nummers.has(doel))
      throw new Error(`${file}: vervangen door ${doel}, maar ADR ${doel} bestaat na deze PR niet meer; ${A4_MELDING}`);
    const nummer = adrNumber(file);
    if (doel !== undefined && nummer !== undefined) vervangers.set(nummer, doel);
  }
  for (const begin of vervangers.keys()) {
    const gezien = new Set();
    let nummer = begin;
    while (vervangers.has(nummer)) {
      if (gezien.has(nummer)) throw new Error(`ADR ${begin}: cyclus in vervangen-door-verwijzingen`);
      gezien.add(nummer);
      nummer = vervangers.get(nummer) ?? nummer;
    }
  }
}

/**
 * A4 (ADR 0046 punt 2): een ADR met een eigenaarstatus op main verdwijnt alleen in een besluit-PR (alleen `docs/adr/`,
 * `docs/specs/`), en nooit via een rename. Zo'n verwijdering is een besluit.
 * @param {{ status: string, pad: string, van?: string }[]} changes @param {Context} context
 * @returns {Besluit[]}
 */
function verifyAdrWeg(changes, context) {
  const eigenaarstatus = (/** @type {string} */ file) => {
    const status =
      documentKind(file) === 'adr' ? documentInfo(file, context.authority.trusted(file) ?? '')?.status : undefined;
    return status !== undefined && status !== 'voorgesteld' ? status : null;
  };
  for (const change of changes) {
    const { status, van } = change;
    const bron = status === 'R' && van !== undefined && verhuisBron(change) === null ? eigenaarstatus(van) : null;
    if (bron !== null) throw new Error(`${van ?? ''}: hernoemd met status ${bron}; ${A4_MELDING}`);
  }
  const weg = changes.filter(({ status, pad }) => status === 'D' && eigenaarstatus(pad) !== null).map(({ pad }) => pad);
  // Verwijderen plus toevoegen onder hetzelfde nummer is een rename die git niet herkent (nummers blijven).
  const nummer = (/** @type {string} */ pad) => /^docs\/adr\/(\d{4})-/.exec(pad)?.[1];
  const zelfdeNummer = weg.find((file) =>
    changes.some(({ status, pad }) => status === 'A' && pad !== file && nummer(pad) === nummer(file)),
  );
  if (zelfdeNummer !== undefined)
    throw new Error(`${zelfdeNummer}: verwijderd naast een nieuw ADR met hetzelfde nummer; ${A4_MELDING}`);
  const vreemd = changes.find(({ pad }) => !/^docs\/(?:adr|specs)\//.test(pad));
  if (weg.length > 0 && vreemd !== undefined)
    throw new Error(`${weg.join(', ')}: verwijderd naast ${vreemd.pad}; ${A4_MELDING}`);
  // Elk verdwenen ADR-pad (ook een voorgesteld ADR, ook als bron van een rename) kan het doel van `vervangen door` zijn.
  const verdwenen = (/** @type {{ status: string, pad: string, van?: string }} */ { status, pad, van }) =>
    status === 'R' ? (van ?? '') : status === 'D' ? pad : '';
  if (changes.some((wijziging) => documentKind(verdwenen(wijziging)) === 'adr')) verifyVervangersBestaan(context);
  return weg.map((file) => ({ file, opMain: false }));
}

/** `vervangen door NNNN` wijst naar een ADR (ook in het archief) op main of in de PR (ADR 0046 punt 5). @param {string} file @param {string} status @param {Context} context */
function verifyVervanger(file, status, context) {
  const nummer = /^vervangen door (\d{4})$/.exec(status)?.[1];
  if (nummer === undefined || file.startsWith(`docs/adr/${nummer}-`)) return;
  if (![...context.adrBestanden, ...context.adrArchief].some((naam) => naam.startsWith(`${nummer}-`)))
    throw new Error(`${file}: vervangen door ${nummer}, maar dat ADR staat niet op main of in de PR`);
}

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

const ARCHIEF = 'docs/adr/archief/';
const TEMPLATE_SPECS = 'docs/template/specs/';

/**
 * De bron van een verhuizing onder dezelfde bestandsnaam: `docs/adr/` naar `archief/`, of `docs/specs/` naar
 * `docs/template/specs/` (framework §10). Null voor elke andere wijziging.
 * @param {{ status: string, pad: string, van?: string }} change @returns {string | null}
 */
function verhuisBron({ status, pad, van }) {
  if (status !== 'R' || van === undefined || documentKind(pad) === null) return null;
  const naam = path.posix.basename(pad);
  const map = pad.startsWith(ARCHIEF) ? 'docs/adr/' : pad.startsWith(TEMPLATE_SPECS) ? 'docs/specs/' : null;
  return map !== null && van === `${map}${naam}` ? van : null;
}

/**
 * Verhuizen mag, wijzigen niet (framework §10): een verhuizing is byte-gelijk; naar `archief/` alleen een vervangen of
 * vervallen ADR, met alleen wijzigingen onder `docs/` ernaast. Elke andere wijziging die `archief/` raakt (nieuw, gewijzigd,
 * verwijderd, terug of onder een andere naam) is A4, ook in een besluit-PR.
 * @param {{ status: string, pad: string, van?: string }[]} changes @param {Context} context
 */
function verifyVerhuizingen(changes, context) {
  const naarArchief = changes.filter((change) => verhuisBron(change) !== null && change.pad.startsWith(ARCHIEF));
  for (const change of changes) {
    const bron = verhuisBron(change);
    if (bron === null) {
      const raakt = [change.pad, change.van ?? ''].find((pad) => pad.startsWith(ARCHIEF));
      if (raakt !== undefined)
        throw new Error(`${raakt}: geen byte-gelijke verhuizing naar het archief; ${A4_MELDING}`);
    } else if (context.authority.trusted(bron) !== context.authority.working(change.pad))
      throw new Error(`${change.pad}: verhuisd van ${bron} maar niet byte-gelijk (framework §10)`);
  }
  for (const { pad, van = '' } of naarArchief) {
    const status = documentInfo(van, context.authority.trusted(van) ?? '')?.status ?? '';
    if (status !== 'vervallen' && !/^vervangen door \d{4}$/.test(status))
      throw new Error(
        `${pad}: alleen een vervangen of vervallen ADR verhuist naar het archief (status ${status}); ${A4_MELDING}`,
      );
  }
  const vreemd = changes.find(({ pad }) => !pad.startsWith('docs/'));
  if (naarArchief.length > 0 && vreemd !== undefined)
    throw new Error(
      `${vreemd.pad}: een verhuizing naar het archief gaat alleen samen met wijzigingen onder docs/ (framework §10)`,
    );
}

/** Bestandsnamen van de ADR's op HEAD in `map` (standaard `docs/adr/`, zonder archief). @param {string} root @param {string} sha @param {string} [map] */
function adrFiles(root, sha, map = 'docs/adr/') {
  const names = gitText(root, ['ls-tree', '--name-only', '-z', sha, map]);
  if (names === null) throw new Error(`ADR-bestanden op ${sha} zijn niet leesbaar`);
  return names
    .split('\0')
    .flatMap((file) => (file.startsWith(map) ? (/^(\d{4}-[^/]+\.md)$/.exec(file.slice(map.length))?.[1] ?? []) : []));
}

/** De ADR's op HEAD in `docs/adr/` en, apart, in het archief. @param {string} root @param {string} sha */
function adrLijsten(root, sha) {
  return { adrBestanden: adrFiles(root, sha), adrArchief: adrFiles(root, sha, ARCHIEF) };
}

/** Een hernoemd of gekopieerd document met een eigenaarstatus op main telt niet als nieuw voorstel. @param {string} file @param {{ pad: string, van?: string }[]} changes @param {Context} context */
function verifyGeenRename(file, changes, context) {
  const van = changes.find((change) => change.pad === file)?.van;
  if (van === undefined) return;
  const status = documentInfo(van, context.authority.trusted(van) ?? '')?.status;
  if (status !== undefined && !['voorstel', 'voorgesteld'].includes(status))
    throw new Error(
      `${file}: hernoemd of gekopieerd van ${van} (${status}); een nieuwe status krijgt het onder een eigen naam in een besluit-PR`,
    );
}

/**
 * Een gewijzigde bestaande test in de feature-lane mag geen gevallen weghalen of skippen (`docs/dod.md`, Altijd; ADR 0062).
 * @param {{ status: string, pad: string }[]} changes @param {Context} context
 */
function verifyTestwijzigingen(changes, context) {
  for (const { status, pad } of changes) {
    if (status !== 'M' || !context.config.testpaden.some((glob) => globMatch(glob, pad))) continue;
    const risk = testChangeRisk(
      gitText(context.root, ['show', `${context.split}:${pad}`]) ?? '',
      gitText(context.root, ['show', `${context.sha}:${pad}`]) ?? '',
      pad,
    );
    if (risk !== null)
      throw new Error(
        `${pad}: ${risk === 'skip' ? 'tests skippen' : 'testgevallen weghalen'} vraagt afzonderlijk eigenaarakkoord`,
      );
  }
}

/** Inhoud van de lane: alleen een nieuwe tabel in migraties, en dan een kop "Datawijzigingen" in een van de specs. @param {string[]} files @param {{ status: string, pad: string }[]} changes @param {Context} context */
function verifyFeatureInhoud(files, changes, context) {
  const teksten = files.map((file) => context.authority.working(file) ?? '');
  if (teksten.some((tekst) => isFunctionalUiSpec(tekst))) verifyFunctionalUiChanges(context, changes);
  verifyTestwijzigingen(changes, context);
  const migraties = changes.filter(
    ({ status, pad }) => status === 'A' && context.config.migraties.some((glob) => globMatch(glob, pad)),
  );
  for (const { pad } of migraties) {
    const fout = migratieOvertreding(gitText(context.root, ['show', `${context.sha}:${pad}`]) ?? '\0');
    if (fout !== null) throw new Error(`${pad}: ${fout}; dat is framework-lane met het volledige sjabloon`);
  }
  if (migraties.length > 0 && !teksten.some((tekst) => /^## Datawijzigingen \(met grants\)\n+(?!##)\S/m.test(tekst)))
    throw new Error(`${files.join(', ')}: een nieuwe migratie vraagt de kop "Datawijzigingen (met grants)" in de spec`);
}

/**
 * Besluiten in de PR zelf (ADR 0046 punt 1 en 5, ADR 0062, ADR 0063): alleen in een besluit-PR (framework-lane: alleen
 * `docs/adr/` en `docs/specs/`) of in de feature-lane (specs met code, zonder ADR of kritiek pad). De merge door de eigenaar is het besluit.
 * @param {{ besluiten: Besluit[], changes: { status: string, pad: string, van?: string }[] }} pr @param {Context} context
 * @returns {string | null} de melding voor de uitvoer, of null zonder nieuw besluit
 */
function verifyInPrStatus({ besluiten, changes }, context) {
  const open = besluiten.filter(({ opMain }) => !opMain);
  const [eerste] = open;
  if (eerste === undefined) return null;
  const bestanden = besluiten.map(({ file }) => file);
  // De UI-uitzondering (ADR 0056) geldt voor precies één spec; bij meer specs geldt de gewone lane (geen volgordeafhankelijkheid).
  const functioneleUi = besluiten.length === 1 && isFunctionalUiSpec(context.authority.working(eerste.file) ?? '');
  const { lane, reden } = laneVan({
    changes,
    besluiten: bestanden,
    config: context.config,
    repository: context.authority.repository,
    functioneleUi,
  });
  if (lane === null) throw new Error(`${bestanden.join(', ')}: ${GEEN_BESLUIT}; geen herkende lane: ${reden}`);
  for (const { file } of open) verifyGeenRename(file, changes, context);
  if (lane === 'feature') {
    verifyFeatureInhoud(bestanden, changes, context);
    verifyVolgorde(bestanden, context);
  }
  return `statusovergang in de PR (${lane === 'framework' ? 'besluit-PR, framework' : lane}-lane): ${bestanden.join(', ')}; het besluit is de merge door de eigenaar (ADR 0046)`;
}

/** Ook een gebouwd-status rapporteert de gebruikte UI-uitzondering. @param {{ status: string, pad: string }[]} changes @param {Context} context */
function functionalUiSummary(changes, context) {
  const ui = changes.some(
    ({ pad }) => documentKind(pad) === 'spec' && isFunctionalUiSpec(context.authority.working(pad) ?? ''),
  );
  if (!ui) return '';
  const paths = changes.filter(({ status, pad }) => pad.startsWith('src/core/') || (status === 'M' && isUiTest(pad)));
  return `; functionele UI (ADR 0056), corepaden en bestaande UI-tests: ${paths.map(({ pad }) => pad).join(', ')}`;
}

/** Een GitHub Actions-foutannotatie; `%`, CR en LF worden geëscaped zoals `@actions/core` doet, zodat een bestandsnaam geen commando kan invoegen. @param {string} message */
export function annotatie(message) {
  const veilig = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  return `::error title=document-status::${veilig}`;
}

/** Korte stapsamenvatting voor de job (ADR 0045 punt 20). @param {string} tekst */
function samenvatting(tekst) {
  const bestand = process.env['GITHUB_STEP_SUMMARY'];
  if (bestand !== undefined && bestand !== '') appendFileSync(bestand, tekst);
}

/** @param {{ status: string, pad: string, van?: string }[]} changes @param {Context} context */
function verifyDocuments(changes, context) {
  const gewijzigd = changes.flatMap((change) => {
    const { pad } = change;
    // Een byte-gelijke verhuizing (verifyVerhuizingen) is geen nieuw document: de bron op main is de basis.
    const bron = verhuisBron(change) ?? pad;
    const besluit = verifyDocument(
      { file: pad, before: context.authority.trusted(bron), after: context.authority.working(pad) },
      context,
    );
    return besluit === null ? [] : [besluit];
  });
  verifyVervangersBestaan(context);
  return gewijzigd;
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
  const prNummer = process.env['PR_NUMBER'] ?? '';
  const pr = /^[1-9]\d*$/.test(prNummer) ? Number(prNummer) : null;
  const code = changes.some(({ pad }) => !pad.startsWith('docs/') && pad !== 'CHANGELOG.md');
  /** @type {Context} */
  const context = { root, base, sha, split, pr, code, ...adrLijsten(root, sha), authority: snapshot, config };
  verifyNummerVrij(changes, context);
  verifyVerhuizingen(changes, context);
  const verwijderd = verifyAdrWeg(changes, context);
  const gewijzigd = verifyDocuments(changes, context);
  const besluiten = [...gewijzigd, ...verwijderd];
  const besluitmelding = verifyInPrStatus({ besluiten, changes }, context);
  const ui = functionalUiSummary(changes, context);
  const melding =
    besluitmelding === null && ui === ''
      ? null
      : `${besluitmelding ?? 'besluiten en bouwbewijs gecontroleerd vanuit main'}${ui}`;
  console.log('document-status: besluiten en bouwbewijs gecontroleerd vanuit main');
  samenvatting(
    `## document-status: goedgekeurd\n\n${melding ?? 'besluiten en bouwbewijs gecontroleerd vanuit main'}\n`,
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
