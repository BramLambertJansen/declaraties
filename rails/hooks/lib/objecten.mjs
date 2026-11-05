// Gecontroleerd lezen uit git (ADR 0045): git controleert de hash van een object niet bij gewoon lezen, en `.git/objects` is voor
// de sandbox schrijfbaar. Wie een bestand uit de vertrouwde basis leest, hasht daarom zelf de commit, elke tree op het pad en de blob.
// Zelfde werkwijze als .claude/hooks/laden.mjs (de stub moet zelfstandig blijven en kan deze module niet importeren).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const GIT_ENV = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' };

/** @param {string} soort @param {Uint8Array} data @param {number} lengte */
function objectOid(soort, data, lengte) {
  return createHash(lengte === 64 ? 'sha256' : 'sha1').update(`${soort} ${String(data.length)}\0`).update(data).digest('hex');
}

/** De ruwe inhoud van een object, alleen als die bij zijn oid hoort. @param {string} root @param {string} soort @param {string} oid */
function gecontroleerd(root, soort, oid) {
  const data = execFileSync('git', ['cat-file', soort, oid], { cwd: root, env: GIT_ENV, stdio: ['ignore', 'pipe', 'ignore'] });
  if (objectOid(soort, data, oid.length) !== oid) throw new Error(`object ${oid} klopt niet met zijn hash`);
  return data;
}

/** De entry `naam` in een gecontroleerde tree. @param {string} root @param {string} oid @param {string} naam */
function entry(root, oid, naam) {
  const data = gecontroleerd(root, 'tree', oid);
  const breedte = oid.length / 2;
  for (let i = 0; i < data.length; ) {
    const spatie = data.indexOf(0x20, i);
    const nul = data.indexOf(0, spatie);
    if (spatie < 0 || nul < 0) return null;
    if (data.subarray(spatie + 1, nul).toString() === naam)
      return { modus: data.subarray(i, spatie).toString(), oid: data.subarray(nul + 1, nul + 1 + breedte).toString('hex') };
    i = nul + 1 + breedte;
  }
  return null;
}

/**
 * De inhoud van `pad` in commit `sha`, alleen als commit, trees en blob bij hun oid horen; anders, of als het pad geen gewoon
 * bestand is, null.
 * @param {string} root @param {string} sha @param {string} pad
 */
export function vertrouwdeTekst(root, sha, pad) {
  if (!OID.test(sha)) return null;
  try {
    let oid = /^tree ([0-9a-f]+)\n/.exec(gecontroleerd(root, 'commit', sha).toString())?.[1];
    const delen = pad.split('/');
    for (const [index, naam] of delen.entries()) {
      const gevonden = oid === undefined ? null : entry(root, oid, naam);
      const laatste = index === delen.length - 1;
      if (gevonden === null || (!laatste && gevonden.modus !== '40000')) return null;
      if (laatste && gevonden.modus !== '100644' && gevonden.modus !== '100755') return null;
      oid = gevonden.oid;
    }
    return oid === undefined ? null : gecontroleerd(root, 'blob', oid).toString('utf8');
  } catch {
    return null;
  }
}

/** Of `sha` een commit is die bij zijn oid hoort. @param {string} root @param {string} sha */
export function vertrouwdeCommit(root, sha) {
  try {
    return OID.test(sha) && gecontroleerd(root, 'commit', sha).length > 0;
  } catch {
    return false;
  }
}

/** De anker-SHA die de stub-lader doorgeeft (ADR 0045 punt 3), of null buiten een hook (tests, scripts). */
export function anker() {
  const waarde = process.env['RAILS_ANKER'];
  return waarde === undefined || waarde === '' ? null : waarde;
}
