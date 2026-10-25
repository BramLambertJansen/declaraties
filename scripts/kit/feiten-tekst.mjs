// Pure delen van scripts/kit/feiten.mjs: ADR-filter, volgende nummers, fase uit de roadmap en de tekstweergave.
// Geen bestandstoegang, zodat test/scripts/feiten.test.ts ze met invoer als tekst kan toetsen.

const TEMPLATE_ADR_MAX = 99;
const ROADMAP = 'docs/roadmap.md';

/** @typedef {{ nummer: string, titel: string, status: string }} Adr */
/** @typedef {{ spec: string, status: string }} Spec */

/** @param {string} status */
function isHistorisch(status) {
  return status === 'vervallen' || status.startsWith('vervangen door');
}

/**
 * Volgende vrije nummers over de volledige lijst (ook vervangen en vervallen ADR's, en dubbele nummers).
 * @param {readonly { nummer: string }[]} list
 */
export function nextAdr(list) {
  const numbers = list.map((adr) => Number(adr.nummer));
  const template = Math.max(0, ...numbers.filter((n) => n <= TEMPLATE_ADR_MAX)) + 1;
  const app = Math.max(TEMPLATE_ADR_MAX, ...numbers.filter((n) => n > TEMPLATE_ADR_MAX)) + 1;
  return `${String(template).padStart(4, '0')} (template, tot 0099) · ${String(app).padStart(4, '0')} (app, vanaf 0100)`;
}

/**
 * Standaard alleen geldende en voorgestelde ADR's plus een telling; `alle` toont ook de vervangen en vervallen.
 * @param {readonly Adr[]} list
 * @param {boolean} alle
 * @param {readonly string[]} [gereserveerd]
 */
export function adrOverzicht(list, alle, gereserveerd = []) {
  const volgende = nextAdr([...list, ...gereserveerd.map((nummer) => ({ nummer }))]);
  if (alle) return { lijst: list, volgende };
  const historisch = list.filter((adr) => isHistorisch(adr.status)).length;
  return {
    lijst: list.filter((adr) => !isHistorisch(adr.status)),
    overig: `${historisch} vervangen/vervallen (feiten adr --alle)`,
    volgende,
  };
}

/**
 * Componenten als tekst: varianten als `prop=a|b`, `publiek`/`intern` als label, importnaam alleen als die afwijkt.
 * @param {readonly { naam: string, bron: string, publiek: boolean, varianten: Record<string, readonly string[]>, importnamen: readonly string[] }[]} list
 */
export function componentenTekst(list) {
  return list.map(({ naam, bron, publiek, varianten, importnamen }) => {
    const props = Object.entries(varianten).map(([prop, values]) => `${prop}=${values.join('|')}`);
    const eigenNaam = importnamen.length === 0 || (importnamen.length === 1 && importnamen[0] === naam);
    return [
      naam,
      publiek ? 'publiek' : 'intern',
      bron,
      ...props,
      ...(eigenNaam ? [] : [`import ${importnamen.join(', ')}`]),
    ].join(' · ');
  });
}

/**
 * Regels van een `## kop`-sectie, met het regelnummer (1-based) in het bestand.
 * @param {readonly string[]} lines
 * @param {string} heading
 */
function sectionLines(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).map((text, index) => ({ text, regel: start + 2 + index }));
}

/** @param {string} first */
function faseVan(first) {
  const fase = /\bfase (\d)\b(?:,? stuk (\d+[a-z]?))?/.exec(first);
  if (fase !== null) return fase[2] === undefined ? `fase ${fase[1]}` : `fase ${fase[1]} (stuk ${fase[2]})`;
  // De stukken staan onder "### Fase 1 — Fundament" in de roadmap.
  const stuk = /\bstuk (\d+[a-z]?)\b/.exec(first);
  return stuk === null ? null : `fase 1 (stuk ${stuk[1]})`;
}

/**
 * @param {string} block
 * @param {readonly Spec[]} specs
 */
function specsIn(block, specs) {
  return specs
    .map(({ spec, status }) => ({ naam: spec.replace(/\.md$/, ''), status }))
    .filter(({ naam }) => {
      const escaped = naam.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:specs/|spec |\`)${escaped}(?:\\.md)?(?![\\w-])`).test(block);
    })
    .map(({ naam, status }) => `spec ${naam} (${status})`);
}

/**
 * Open items (`- [ ]`) van één roadmapsectie met titel, fase, genoemde specs en regelnummer.
 * @param {readonly { text: string, regel: number }[]} lines
 * @param {{ sectie: string, specs: readonly Spec[] }} context
 */
function openItems(lines, { sectie, specs }) {
  return lines.flatMap(({ text, regel }, index) => {
    if (!text.startsWith('- [ ] ')) return [];
    const next = lines.slice(index + 1).findIndex((line) => !line.text.startsWith(' ') && line.text.trim() !== '');
    const block = lines
      .slice(index, next === -1 ? undefined : index + 1 + next)
      .map((line) => line.text)
      .join('\n');
    const titel = /\*\*(.+?)\*\*/.exec(text)?.[1] ?? text.slice(6, 86);
    const fase = faseVan(text);
    const waar = `${ROADMAP}:${regel}`;
    return [
      [sectie, titel, fase ?? `fase onbekend → lees ${waar}`, ...specsIn(block, specs), ...(fase ? [waar] : [])].join(
        ' · ',
      ),
    ];
  });
}

/**
 * Wat de reviewer nodig heeft om de fase te kiezen (docs/dod.md:3) zonder de hele roadmap te lezen.
 * @param {{ roadmap: string | null, dod: string | null, specs: readonly Spec[] }} input
 */
export function faseOverzicht({ roadmap, dod, specs }) {
  const lines = roadmap?.split('\n') ?? [];
  const nu = sectionLines(lines, 'Nu');
  const volgende = sectionLines(lines, 'Volgende');
  if (nu.length === 0 && volgende.length === 0) return { fase: `onbekend → lees ${ROADMAP}` };
  const kopjes = (dod ?? '')
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3));
  return {
    regel:
      'fase van de roadmap-items die de PR aanvinkt of raakt; meer fases: loop ze alle af; twijfel: de eigenaar (docs/dod.md:3)',
    dod: kopjes.length > 0 ? kopjes.join(' · ') : 'onbekend → lees docs/dod.md',
    open: [...openItems(nu, { sectie: 'Nu', specs }), ...openItems(volgende, { sectie: 'Volgende', specs })],
    anders: `staat het item niet in deze lijst (afgevinkt, Geparkeerd, Gebouwd) of is de fase onbekend → lees ${ROADMAP}`,
  };
}

/** @param {unknown} value */
function field(value) {
  // Een lege lijst blijft zichtbaar: een permissie zonder rollen is informatie (de tester leidt de verboden rollen af).
  if (Array.isArray(value)) return value.length === 0 ? '(geen)' : value.map(String).join(', ');
  if (typeof value !== 'object' || value === null) return String(value);
  return Object.entries(value)
    .map(([key, content]) => `${key}=${Array.isArray(content) ? content.join('|') : String(content)}`)
    .join(' ');
}

/** @param {unknown} value */
function inline(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return field(value);
  return Object.values(value)
    .map(field)
    .filter((text) => text !== '')
    .join(' · ');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function render(value) {
  if (Array.isArray(value)) return value.length === 0 ? '(geen)' : value.map((item) => `- ${inline(item)}`).join('\n');
  if (typeof value !== 'object' || value === null) return String(value);
  return Object.entries(value)
    .map(([key, content]) => (Array.isArray(content) ? `${key}:\n${render(content)}` : `${key}: ${inline(content)}`))
    .join('\n');
}

/**
 * @param {readonly { naam: string, kop?: string, inhoud: unknown }[]} sections
 */
export function toText(sections) {
  return sections
    .map(({ naam, kop, inhoud }) => `## ${naam}${kop === undefined ? '' : ` (${kop})`}\n${render(inhoud)}`)
    .join('\n\n');
}
