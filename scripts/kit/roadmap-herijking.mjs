// Herijken krijgt een trigger (ADR 0070 punt 5, meting-stuurt/AC-7, R-DOC-08): sluit een PR een roadmap-fase, dan eist
// check:roadmap een herijkingsregel in docs/roadmap-archief.md. Een fase sluit als ze op de basis minstens één open item had
// (`- [ ]` onder `## Nu` of `## Volgende`, fase uit de eerste regel via `faseVan`) en in de werkmap geen meer (afgevinkt,
// geparkeerd of verhuisd). De regel staat onder de kop `### Fase <n>`, begint met `Herijking fase <n>:` en noemt een ISO-datum,
// `leespad` met een getal in KB en `trend`; hij is nieuw tegenover de basis. Items zonder fase tellen niet.
// Pure kern zonder git of fs; check-roadmap.mjs levert de teksten.
import { faseVan } from './feiten-tekst.mjs';

const ARCHIEF = 'docs/roadmap-archief.md';
const OPEN = /^- \[ \] (.*)$/;
const KOP2 = /^## (.+?)\s*$/;

/**
 * Per fasenummer het aantal open items onder `## Nu` en `## Volgende`.
 * @param {string | null} roadmap
 * @returns {Map<number, number>}
 */
export function openPerFase(roadmap) {
  /** @type {Map<number, number>} */
  const per = new Map();
  let sectie = '';
  for (const regel of (roadmap ?? '').split('\n')) {
    const kop = KOP2.exec(regel);
    if (kop !== null) sectie = kop[1] ?? '';
    const item = OPEN.exec(regel);
    if (item === null || !['Nu', 'Volgende'].includes(sectie)) continue;
    const fase = faseVan(item[1] ?? '');
    if (fase !== null) per.set(fase.nummer, (per.get(fase.nummer) ?? 0) + 1);
  }
  return per;
}

/**
 * De regels onder `### Fase <n>` (gevolgd door een spatie of het einde van de regel), tot de volgende `## `- of `### `-kop.
 * @param {string | null} archief @param {number} n
 */
function onderFase(archief, n) {
  const regels = (archief ?? '').split('\n');
  const kop = new RegExp(`^### Fase ${String(n)}(?: |$)`);
  const start = regels.findIndex((regel) => kop.test(regel));
  if (start === -1) return [];
  const rest = regels.slice(start + 1);
  const eind = rest.findIndex((regel) => /^#{2,3} /.test(regel));
  return eind === -1 ? rest : rest.slice(0, eind);
}

/** @param {string} regel @param {number} n */
function isHerijking(regel, n) {
  return (
    regel.startsWith(`Herijking fase ${String(n)}:`) &&
    /\b\d{4}-\d{2}-\d{2}\b/.test(regel) &&
    /\bleespad\b[^\n]*?\d+(?:[.,]\d+)?\s*KB\b/.test(regel) &&
    /\btrend\b/.test(regel)
  );
}

/**
 * Meldingen voor elke fase die deze PR sluit zonder nieuwe herijkingsregel.
 * @param {{ basisRoadmap: string | null, roadmap: string | null, basisArchief: string | null, archief: string | null }} teksten
 * @returns {{ key: string, message: string }[]}
 */
export function herijkingMeldingen({ basisRoadmap, roadmap, basisArchief, archief }) {
  const voor = openPerFase(basisRoadmap);
  const na = openPerFase(roadmap);
  return [...voor.keys()]
    .filter((n) => (na.get(n) ?? 0) === 0)
    .sort((a, b) => a - b)
    .filter((n) => {
      const eerder = new Set(onderFase(basisArchief, n).filter((regel) => isHerijking(regel, n)));
      return !onderFase(archief, n).some((regel) => isHerijking(regel, n) && !eerder.has(regel));
    })
    .map((n) => ({
      key: `roadmap:herijking:${String(n)}`,
      message: `deze PR sluit fase ${String(n)} (geen open item meer onder ## Nu of ## Volgende); zet onder ### Fase ${String(n)} in ${ARCHIEF} een nieuwe regel "Herijking fase ${String(n)}: <datum JJJJ-MM-DD>, leespad <n> KB, trend <uitslag>" (R-DOC-08, ADR 0070)`,
    }));
}
