// Toets op effect (ADR 0066, spec rolhek-effect): na een Bash-commando van een subagent krijgt elk pad dat echt veranderde
// de beslissing van een Edit van die rol. Opslag in `<git-common-dir>/rolhek-effect/`, buiten de schrijfrechten van de sandbox.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decideChange, globMatch } from './rolhek.mjs';
import { archiefBron } from './document-state.mjs';
import { blobVan, entryVan, gelijk, veranderingen } from './effect-compare.mjs';
import { MAX_MS, blobBytes, gitDirVan, momentopname, padStaten } from './effect-snapshot.mjs';

/**
 * @typedef {import('./effect-snapshot.mjs').Snapshot} Snapshot
 * @typedef {import('./effect-snapshot.mjs').Git} Git
 * @typedef {import('./effect-compare.mjs').Verandering} Verandering
 * @typedef {{ rel: string | null, actor: string, rol: string, commando: string, reden: string, voor: import('./effect-snapshot.mjs').Entry | null }} Overtreding
 * @typedef {{ actor: string, start: number, eind: number, paden: string[], staten?: Record<string, string> }} Venster
 * `staten`: de werkmapstaat per pad direct na het venster; alleen die staat is verklaard (AC-2).
 * @typedef {{ root: string, git: Git, ctx: import('./rolhek.mjs').Ctx, now: () => number, alleenLezen?: boolean }} Repo
 * `alleenLezen`: pr:verify in de sandbox; de lijst wordt berekend maar niet weggeschreven.
 */

// Een momentopname van een subagent geldt een dag (AC-4: tot het einde van de sessie; daarna ruimt SubagentStart op).
const BEWAAR_MS = 24 * 60 * 60 * 1000;

/** @param {{ root: string, git: Git }} repo */
export function opslag(repo) {
  const bekend = OPSLAG.get(repo);
  if (bekend !== undefined) return bekend;
  // Gekoppelde worktrees delen de git-common-dir: elk een eigen deel, anders vergelijkt de ene werkmap opnamen van de andere.
  const basis = path.join(gitDirVan(repo), 'rolhek-effect');
  const map = eigenGitMap(repo.root) ? basis : path.join(basis, `wt-${createHash('sha256').update(repo.root).digest('hex').slice(0, 16)}`);
  OPSLAG.set(repo, map);
  return map;
}

/** @param {string} root */
function eigenGitMap(root) {
  try {
    return statSync(path.join(root, '.git')).isDirectory();
  } catch {
    return false;
  }
}

/** Eén `git rev-parse` per hook-aanroep. @type {WeakMap<object, string>} */
const OPSLAG = new WeakMap();

/**
 * De inhoud van een blob, alleen als die echt bij de id hoort: `.git/objects` is in de sandbox schrijfbaar, dus een los object
 * kan vervalst zijn (zoals de lader in `.claude/hooks/laden.mjs` controleert).
 * @param {Repo} repo @param {string} blob
 */
function echteBlob(repo, blob) {
  const bytes = blobBytes(repo.root, blob);
  const algoritme = blob.length === 64 ? 'sha256' : 'sha1';
  const id = createHash(algoritme).update(`blob ${String(bytes.length)}\0`).update(bytes).digest('hex');
  // Dicht falen: een vervalst object maakt van een bestaande test anders een nieuw bestand (geen toets op weggehaalde tests).
  if (id !== blob) throw new Error(`object ${blob} klopt niet met zijn hash; de toets valt dicht`);
  return bytes.toString('utf8');
}

/** @param {string} file @param {unknown} fallback */
function leesJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** @param {string} file @param {unknown} value */
function schrijfJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value)}\n`);
}

/** Een veilige bestandsnaam voor een id uit de payload. @param {string} id */
const sleutel = (id) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'leeg';

/** @param {Repo} repo @returns {Overtreding[]} */
export function overtredingen(repo) {
  const lijst = leesJson(path.join(opslag(repo), 'overtredingen.json'), []);
  return Array.isArray(lijst) ? lijst : [];
}

/** @param {Repo} repo @returns {Record<string, string>} */
function overgenomen(repo) {
  const map = leesJson(path.join(opslag(repo), 'overgenomen.json'), {});
  return typeof map === 'object' && map !== null ? map : {};
}

/** @param {Repo} repo @returns {Venster[]} */
function vensters(repo) {
  try {
    return readFileSync(path.join(opslag(repo), 'vensters.jsonl'), 'utf8')
      .split('\n')
      .filter((regel) => regel !== '')
      .map((regel) => JSON.parse(regel));
  } catch {
    return [];
  }
}

/** @param {Repo} repo @param {Venster} venster */
export function legVensterVast(repo, venster) {
  const file = path.join(opslag(repo), 'vensters.jsonl');
  mkdirSync(path.dirname(file), { recursive: true });
  const bewaard = vensters(repo).filter((oud) => oud.eind > repo.now() - BEWAAR_MS);
  const met = { ...venster, staten: padStaten(repo, venster.paden) };
  writeFileSync(file, [...bewaard, met].map((regel) => `${JSON.stringify(regel)}\n`).join(''));
}

/**
 * De paden die het venster van een andere actor verklaart: alleen als het pad nu nog de staat heeft die dat venster
 * achterliet. Een eerdere Edit van de hoofdsessie maakt een latere schrijfactie van een subagent op hetzelfde pad niet vrij.
 * @param {Repo} repo @param {{ actor: string, start: number, paden: readonly string[] }} vraag
 */
function verklaardePaden(repo, { actor, start, paden }) {
  // Met de hoofdsessie als dader (AC-4, vlag `aan`) verklaart haar venster een pad van een subagent niet meer: het pad krijgt
  // dan de beslissing van beide rollen.
  const hoofdTelt = repo.ctx.config.rolhekEffectHoofdsessie === 'aan';
  const anderen = vensters(repo).filter((venster) =>
    venster.actor !== actor && venster.eind >= start && !(hoofdTelt && venster.actor.startsWith('hoofd:')));
  const kandidaten = paden.filter((rel) => anderen.some((venster) => venster.paden.includes(rel)));
  const nu = padStaten(repo, kandidaten);
  return new Set(kandidaten.filter((rel) => anderen.some((venster) => venster.staten?.[rel] !== undefined && venster.staten[rel] === nu[rel])));
}

/** De staat van een pad nu, als sleutel voor vergelijken. @param {Snapshot} snap @param {string} rel */
const staatSleutel = (snap, rel) => JSON.stringify(entryVan(snap, rel));

/**
 * De inhoud van vóór het commando (AC-3): het bewaarde voorbeeld, anders de index.
 * @param {Repo} repo @param {Snapshot} voor
 * @returns {(rel: string) => string | null}
 */
function leesVoor(repo, voor) {
  return (rel) => {
    if (rel.endsWith('/')) return null;
    const blob = blobVan(entryVan(voor, rel));
    if (blob === null) return rel in voor.paden ? null : repo.ctx.read(rel);
    return echteBlob(repo, blob);
  };
}

/** De blob-id in een indexregel, of null. @param {string} idx */
function indexBlob(idx) {
  const blob = idx.split('|')[0]?.split(' ')[1] ?? '';
  return /^[0-9a-f]{40,64}$/.test(blob) ? blob : null;
}

/** Weg uit de werkmap: ook een gecommitte verwijdering (schoon en niet in de index). @param {import('./effect-snapshot.mjs').Entry} entry */
const weg = (entry) => entry.wt === 'weg' || (entry.wt === 'schoon' && entry.idx === '');

/** @param {Repo} repo @param {string} rel */
function leesNu(repo, rel) {
  if (rel.endsWith('/')) return null;
  try {
    // Alleen een gewoon bestand: een FIFO zou de hook laten hangen.
    if (!lstatSync(path.join(repo.root, rel)).isFile()) return null;
    return readFileSync(path.join(repo.root, rel), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Een verandering met de beslissing van `decideChange` voor deze rol.
 * @param {Repo} repo @param {{ verandering: Verandering, agentType: string, voor: Snapshot, verhuisd: ReadonlySet<string> }} doel
 */
function beslis(repo, { verandering, agentType, voor, verhuisd }) {
  const { rel, na } = verandering;
  const ctx = { ...repo.ctx, read: leesVoor(repo, voor) };
  const del = { kind: /** @type {const} */ ('delete'), after: null };
  const nu = { kind: /** @type {const} */ ('write'), after: leesNu(repo, rel), verhuizing: verhuisd.has(rel) };
  const besluiten = [decideChange({ rel, change: weg(na) ? del : nu, agentType }, ctx)];
  // Een gestagede inhoud telt apart: een tester kan een `test.skip` stagen en de werkmap ongemoeid laten.
  if (verandering.voor.idx !== na.idx && !rel.endsWith('/')) {
    const blob = indexBlob(na.idx);
    const after = blob === null ? null : echteBlob(repo, blob);
    // `git mv` naar het archief staget dezelfde inhoud: ook die verhuizing telt (AC-5).
    const change = blob === null ? del : { kind: /** @type {const} */ ('write'), after, verhuizing: nu.verhuizing && after === nu.after };
    besluiten.push(decideChange({ rel, change, agentType }, ctx));
  }
  /** @param {'deny' | 'ask' | 'context'} soort */
  const samen = (soort) => [...new Set(besluiten.flatMap((besluit) => besluit[soort]))];
  return { deny: samen('deny'), ask: samen('ask'), context: samen('context') };
}

/**
 * Verhuizingen naar een archief (spec rolhek-vooraf-krimp AC-5, ADR 0080): een nieuw `docs/adr/archief/<naam>` of
 * `docs/specs/archief/<naam>` met dezelfde inhoud als het `docs/adr/<naam>` of `docs/specs/<naam>` dat in hetzelfde commando verdween.
 * @param {Repo} repo @param {{ lijst: readonly Verandering[], voor: Snapshot }} doel
 * @returns {Set<string>}
 */
function verhuizingen(repo, { lijst, voor }) {
  const weggehaald = new Set(lijst.filter((verandering) => weg(verandering.na)).map((verandering) => verandering.rel));
  const lees = leesVoor(repo, voor);
  return new Set(lijst
    .filter((verandering) => weg(verandering.voor) && !weg(verandering.na))
    .filter((verandering) => {
      const bron = archiefBron(verandering.rel);
      const inhoud = bron !== null && weggehaald.has(bron) ? lees(bron) : null;
      return inhoud !== null && inhoud === leesNu(repo, verandering.rel);
    })
    .map((verandering) => verandering.rel));
}

/** @param {Repo} repo @param {{ voor: Snapshot, na: Snapshot }} paar */
function veranderingenIn(repo, paar) {
  const branchRef = repo.ctx.branch === '' || repo.ctx.branch === 'HEAD' ? '' : `refs/heads/${repo.ctx.branch}`;
  const diffPaden = (/** @type {string} */ oud, /** @type {string} */ nieuw) =>
    repo.git(['diff', '--name-only', '-z', '--no-renames', oud, nieuw]).split('\0').filter((rel) => rel !== '');
  return veranderingen(paar, { diffPaden, branchRef });
}

/** Alleen de veranderde paden, voor het venster van de hoofdsessie (AC-2). @param {Repo} repo @param {{ voor: Snapshot, na: Snapshot, start: number }} paar */
export function veranderdePaden(repo, paar) {
  return veranderingenIn(repo, paar).map((verandering) => verandering.rel);
}

/**
 * Overtredingen en meldingen voor de veranderingen tussen `voor` en `na`; paden die een ander venster verklaart, een
 * overgenomen staat hebben of al op de lijst staan, tellen niet.
 * @param {Repo} repo
 * @param {{ voor: Snapshot, na: Snapshot, start: number }} paar
 * @param {{ actor: string, agentType: string, commando: string }} wie
 */
export function toets(repo, paar, wie) {
  const lijst = veranderingenIn(repo, paar);
  const verklaard = verklaardePaden(repo, { actor: wie.actor, start: paar.start, paden: lijst.map((verandering) => verandering.rel) });
  const vrij = uitweg(repo, paar.na);
  /** @type {Overtreding[]} */
  const nieuw = [];
  /** @type {string[]} */
  const meldingen = [];
  const verhuisd = verhuizingen(repo, { lijst, voor: paar.voor });
  for (const verandering of lijst) {
    if (verklaard.has(verandering.rel) || vrij(verandering)) continue;
    const besluit = beslis(repo, { verandering, agentType: wie.agentType, voor: paar.voor, verhuisd });
    const reden = [...besluit.deny, ...besluit.ask].join('; ');
    if (reden !== '') nieuw.push({ rel: verandering.rel, actor: wie.actor, rol: wie.agentType || 'hoofdsessie', commando: wie.commando, reden, voor: verandering.voor });
    meldingen.push(...besluit.context);
  }
  return { nieuw, meldingen, paden: lijst.map((verandering) => verandering.rel) };
}

/**
 * De uitwegen van AC-5: terugzetten naar de staat van vóór een open overtreding, en een staat die de eigenaar overnam, zijn
 * geen nieuwe overtreding (voor elke actor, ook de hoofdsessie).
 * @param {Repo} repo @param {Snapshot} na
 * @returns {(verandering: Verandering) => boolean}
 */
function uitweg(repo, na) {
  const genomen = overgenomen(repo);
  const open = overtredingen(repo);
  return (verandering) =>
    open.some((oud) => oud.rel === verandering.rel && oud.voor !== null && gelijk(oud.voor, verandering.na)) ||
    genomen[verandering.rel] === staatSleutel(na, verandering.rel);
}

/**
 * De inhoud van een pad in de werkmap: `weg`, `b:<blob>` voor een bestand (ook als het gelijk is aan de index), anders de staat
 * zelf (map, link). Een andere modus of alleen een andere index telt zo niet als werkmapwijziging.
 * @param {import('./effect-snapshot.mjs').Entry} entry
 */
function werkmapInhoud(entry) {
  if (entry.wt === 'schoon') return entry.idx === '' ? 'weg' : `b:${blobVan(entry) ?? ''}`;
  const blob = blobVan(entry);
  return blob === null ? entry.wt.replace(/^\d+:/, '') : `b:${blob}`;
}

/**
 * De hoofdsessie als dader op de werkmap (spec rolhek-vooraf-krimp AC-4): elk pad waarvan de werkmapinhoud veranderde krijgt
 * `decideChange` met rol hoofdsessie. Niet: `.git/`, paden waarvan alleen de index veranderde, en paden die een verschoven HEAD
 * verklaart (in `git diff --name-only <oud> <nieuw>` en daarna gelijk aan de index). Een pad onder `gegenereerd` mag alleen
 * het exacte commando uit `generatoren` schrijven. Een venster van een andere actor maakt een pad hier niet vrij: zo krijgt
 * een pad dat ook een subagent raakte de beslissing van beide rollen (de strengste wint op de lijst).
 * @param {Repo} repo @param {{ voor: Snapshot, na: Snapshot }} paar @param {{ actor: string, commando: string }} wie
 * @returns {{ nieuw: (Overtreding & { blokkeer: boolean })[], meldingen: string[], paden: string[] }}
 */
export function toetsHoofdsessie(repo, paar, wie) {
  const headPaden = paar.voor.head !== paar.na.head && paar.voor.head !== '' && paar.na.head !== ''
    ? new Set(repo.git(['diff', '--name-only', '-z', '--no-renames', paar.voor.head, paar.na.head]).split('\0'))
    : new Set();
  const config = repo.ctx.config;
  const generator = (config.generatoren ?? []).includes(wie.commando.trim());
  const vrij = uitweg(repo, paar.na);
  const lijst = veranderingenIn(repo, paar).filter((verandering) =>
    !verandering.rel.startsWith('.git/') &&
    !vrij(verandering) &&
    werkmapInhoud(verandering.voor) !== werkmapInhoud(verandering.na) &&
    !(headPaden.has(verandering.rel) && verandering.na.wt === 'schoon') &&
    !(generator && config.gegenereerd.some((glob) => globMatch(glob, verandering.rel))));
  const verhuisd = verhuizingen(repo, { lijst, voor: paar.voor });
  /** @type {(Overtreding & { blokkeer: boolean })[]} */
  const nieuw = [];
  /** @type {string[]} */
  const meldingen = [];
  for (const verandering of lijst) {
    const besluit = beslis(repo, { verandering, agentType: '', voor: paar.voor, verhuisd });
    const reden = [...besluit.deny, ...besluit.ask].join('; ');
    if (reden !== '')
      nieuw.push({ rel: verandering.rel, actor: wie.actor, rol: 'hoofdsessie', commando: wie.commando, reden, voor: verandering.voor, blokkeer: besluit.deny.length > 0 });
    meldingen.push(...besluit.context);
  }
  return { nieuw, meldingen, paden: lijst.map((verandering) => verandering.rel) };
}

/**
 * Voegt overtredingen toe (één per pad) en laat vervallen wat weer gelijk is aan de staat van vóór de overtreding (AC-5).
 * @param {Repo} repo @param {{ nieuw: Overtreding[], nu: Snapshot | null }} wijziging
 * @returns {Overtreding[]}
 */
export function werkLijstBij(repo, { nieuw, nu }) {
  const bestaand = overtredingen(repo).filter((oud) =>
    oud.rel === null || oud.voor === null || nu === null || !gelijk(entryVan(nu, oud.rel), oud.voor));
  const paden = new Set(bestaand.map((oud) => oud.rel));
  const lijst = [...bestaand, ...nieuw.filter((overtreding) => !paden.has(overtreding.rel))];
  if (repo.alleenLezen !== true) schrijfJson(path.join(opslag(repo), 'overtredingen.json'), lijst);
  return lijst;
}

/** @param {Repo} repo @param {'pre' | 'agent'} soort @param {string} id */
const opnamePad = (repo, soort, id) => path.join(opslag(repo), soort, `${sleutel(id)}.json`);

/**
 * Legt een momentopname vast; `teGroot` of te traag (AC-7) wordt bewaard als `null`, zodat de vergelijking dicht valt.
 * @param {Repo} repo @param {{ soort: 'pre' | 'agent', id: string }} waar @param {Record<string, unknown>} extra
 */
export function legVast(repo, { soort, id }, extra) {
  const start = repo.now();
  const snap = momentopname(repo);
  const bruikbaar = !snap.teGroot && repo.now() - start <= MAX_MS;
  schrijfJson(opnamePad(repo, soort, id), { ...extra, tijd: start, snap: bruikbaar ? snap : null });
}

/** @param {Repo} repo @param {'pre' | 'agent'} soort @param {string} id */
export function leesOpname(repo, soort, id) {
  /** @type {{ tijd?: number, snap?: Snapshot | null, sessie?: string, agentType?: string, gestopt?: number, vooraf?: string } | null} */
  const opname = leesJson(opnamePad(repo, soort, id), null);
  return opname;
}

/** @param {Repo} repo @param {string} id */
export function wisOpname(repo, id) {
  rmSync(opnamePad(repo, 'pre', id), { force: true });
}

/** @param {Repo} repo @param {string} id @param {Record<string, unknown>} velden */
export function werkAgentBij(repo, id, velden) {
  const opname = leesOpname(repo, 'agent', id);
  if (opname !== null) schrijfJson(opnamePad(repo, 'agent', id), { ...opname, ...velden });
}

/** De momentopnamen van subagents, optioneel van één sessie; oudere dan BEWAAR_MS vallen weg. @param {Repo} repo @param {string | null} sessie */
export function agentOpnamen(repo, sessie) {
  const map = path.join(opslag(repo), 'agent');
  return lijstMap(map).flatMap((naam) => {
    const id = naam.replace(/\.json$/, '');
    const opname = leesOpname(repo, 'agent', id);
    if (opname === null || (opname.tijd ?? 0) < repo.now() - BEWAAR_MS) return [];
    return sessie === null || opname.sessie === sessie ? [{ id, opname }] : [];
  });
}

/** @param {string} map @returns {string[]} */
function lijstMap(map) {
  try {
    return readdirSync(map);
  } catch {
    return [];
  }
}

/** @param {Repo} repo */
export function ruimOp(repo) {
  for (const soort of ['agent', 'pre']) {
    const map = path.join(opslag(repo), soort);
    for (const naam of lijstMap(map)) {
      const opname = leesJson(path.join(map, naam), null);
      const tijd = typeof opname === 'object' && opname !== null && 'tijd' in opname ? Number(opname.tijd) : 0;
      if (tijd < repo.now() - BEWAAR_MS) rmSync(path.join(map, naam), { force: true });
    }
  }
}

/** @param {Repo} repo @param {Record<string, string>} map */
export function schrijfOvergenomen(repo, map) {
  schrijfJson(path.join(opslag(repo), 'overgenomen.json'), map);
}

export { overgenomen as leesOvergenomen, schrijfJson };
