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

// Tokens (spec semantische-tokens, 3c): alleen CSS als tekst, geen Tailwind of TypeScript. Groepen en klassen volgen uit
// de toewijzingen in `@theme inline` (index.css), de standaard uit semantic.css of components.css, de app-waarde uit
// theme.css.

/** @typedef {{ selector: string, naam: string, waarde: string, regel: number }} Declaratie */
/** @typedef {{ token: string, klassen: string[], licht: string, donker?: string, app?: string, bron: string }} TokenItem */

const TOKEN_GROEPEN = ['kleur', 'typografie', 'dichtheid', 'lagen', 'beweging'];
const DARK = "[data-theme='dark']";

// Volgorde telt: de langste namespace eerst (`--font-weight-` vóór `--font-`).
/** @type {readonly { prefix: RegExp, groep: string, klassen: (naam: string) => string[] }[]} */
const NAMESPACES = [
  { prefix: /^--color-(.+)$/, groep: 'kleur', klassen: (n) => [`bg-${n}`, `text-${n}`, `border-${n}`] },
  { prefix: /^--font-weight-(.+)$/, groep: 'typografie', klassen: (n) => [`font-${n}`] },
  { prefix: /^--font-(sans|mono)$/, groep: 'typografie', klassen: (n) => [`font-${n}`] },
  { prefix: /^--text-(\w+?)(?:--line-height)?$/, groep: 'typografie', klassen: (n) => [`text-${n}`] },
  { prefix: /^--spacing$/, groep: 'dichtheid', klassen: () => ['p-*', 'm-*', 'gap-*'] },
  { prefix: /^--spacing-(.+)$/, groep: 'dichtheid', klassen: (n) => [`min-h-${n}`, `h-${n}`] },
  { prefix: /^--z-index-(.+)$/, groep: 'lagen', klassen: (n) => [`z-${n}`] },
  { prefix: /^--transition-duration-(.+)$/, groep: 'beweging', klassen: (n) => [`duration-${n}`] },
  { prefix: /^--ease-(.+)$/, groep: 'beweging', klassen: (n) => [`ease-${n}`] },
];

/**
 * Declaraties van custom properties met het innerste blok als selector; een waarde over meer regels wordt samengevoegd.
 * @param {string} text
 * @returns {Declaratie[]}
 */
export function cssDeclaraties(text) {
  /** @type {string[]} */
  const stack = [];
  /** @type {Declaratie[]} */
  const out = [];
  /** @type {Declaratie | null} */
  let open = null;
  text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .split('\n')
    .forEach((line, index) => {
      if (open !== null) {
        open.waarde = `${open.waarde} ${line.trim()}`.trim();
      } else {
        const block = /^\s*([^{}]+?)\s*\{\s*$/.exec(line);
        if (block !== null) stack.push(block[1] ?? '');
        if (/^\s*\}\s*$/.test(line)) stack.pop();
        const decl = /^\s*(--[\w-]+)\s*:\s*(.*)$/.exec(line);
        if (decl === null) return;
        open = { selector: stack.at(-1) ?? '', naam: decl[1] ?? '', waarde: (decl[2] ?? '').trim(), regel: index + 1 };
        out.push(open);
      }
      if (open?.waarde.endsWith(';')) {
        open.waarde = open.waarde.slice(0, -1).trim();
        open = null;
      }
    });
  return out;
}

/**
 * Groep en klassen per token uit `@theme inline`; een verwijzing via een componenttoken
 * (`--spacing-control: var(--control-h)` → `--density-control`) volgt één stap.
 * @param {readonly Declaratie[]} theme
 * @param {readonly Declaratie[]} components
 */
function themaKoppelingen(theme, components) {
  /** @type {Map<string, { groep: string, klassen: string[] }>} */
  const koppeling = new Map();
  for (const { naam, waarde } of theme) {
    const ns = NAMESPACES.map((space) => ({ space, match: space.prefix.exec(naam) })).find(({ match }) => match);
    const doel = /^var\((--[\w-]+)\)$/.exec(waarde)?.[1];
    if (ns === undefined || ns.match === null || doel === undefined) continue;
    const via = components.find((decl) => decl.naam === doel);
    const token = via === undefined ? doel : (/var\((--[\w-]+)\)/.exec(via.waarde)?.[1] ?? doel);
    const klassen = [...(koppeling.get(token)?.klassen ?? []), ...ns.space.klassen(ns.match[1] ?? '')];
    koppeling.set(token, { groep: ns.space.groep, klassen: [...new Set(klassen)] });
  }
  return koppeling;
}

/**
 * @param {readonly Declaratie[]} decls
 * @param {string} token
 * @param {string} selector
 */
function waardeVan(decls, token, selector) {
  return decls.find((decl) => decl.naam === token && decl.selector === selector);
}

/**
 * De app-waarde(n) uit theme.css als tekst, of undefined.
 * @param {readonly Declaratie[]} app
 * @param {string} token
 * @param {string} pad
 */
function appWaarde(app, token, pad) {
  const licht = waardeVan(app, token, ':root');
  const donker = waardeVan(app, token, DARK);
  const delen = [
    ...(licht === undefined ? [] : [`${licht.waarde} (${pad}:${String(licht.regel)})`]),
    ...(donker === undefined ? [] : [`donker ${donker.waarde} (${pad}:${String(donker.regel)})`]),
  ];
  return delen.length === 0 ? undefined : delen.join('; ');
}

/**
 * Tokens per groep met klasse, standaard (licht/donker), app-waarde en bron; een app-override van een bekend token
 * zonder groep onder `overig`, theme.css-namen die niet in semantic.css staan onder `onbekend`.
 * @param {{ semantic: string, components: string, index: string, theme: string | null }} css
 * @param {{ semantic: string, components: string, theme: string }} paden
 * @returns {Record<string, TokenItem[]>}
 */
export function tokenOverzicht(css, paden) {
  const semantic = cssDeclaraties(css.semantic);
  const components = cssDeclaraties(css.components);
  const theme = cssDeclaraties(css.index).filter((decl) => decl.selector === '@theme inline');
  const app = css.theme === null ? [] : cssDeclaraties(css.theme);
  const koppeling = themaKoppelingen(theme, components);
  /** @type {Record<string, TokenItem[]>} */
  const groepen = Object.fromEntries([...TOKEN_GROEPEN, 'overig'].map((groep) => [groep, []]));
  const bronnen = [
    { decls: semantic, pad: paden.semantic, semantisch: true },
    { decls: components, pad: paden.components, semantisch: false },
  ];
  for (const { decls, pad, semantisch } of bronnen) {
    for (const decl of decls.filter((item) => item.selector === ':root')) {
      const gekoppeld = koppeling.get(decl.naam);
      const eigen = semantisch ? appWaarde(app, decl.naam, paden.theme) : undefined;
      // Bekend maar zonder groep (`--radius`): alleen zichtbaar als de app het overschrijft.
      const groep = gekoppeld?.groep ?? (eigen === undefined ? undefined : 'overig');
      if (groep === undefined) continue;
      const donker = semantisch ? waardeVan(semantic, decl.naam, DARK) : undefined;
      groepen[groep]?.push({
        token: decl.naam,
        klassen: gekoppeld?.klassen ?? [],
        licht: decl.waarde,
        ...(donker === undefined ? {} : { donker: donker.waarde }),
        ...(eigen === undefined ? {} : { app: eigen }),
        bron: `${pad}:${String(decl.regel)}`,
      });
    }
  }
  const bekend = new Set(semantic.map((decl) => decl.naam));
  groepen['onbekend'] = app
    .filter((decl) => !bekend.has(decl.naam))
    .map((decl) => ({
      token: decl.naam,
      klassen: [],
      licht: decl.waarde,
      bron: `${paden.theme}:${String(decl.regel)}`,
    }));
  return groepen;
}

/**
 * Tekstvorm: één regel per token met gelabelde velden.
 * @param {Record<string, readonly TokenItem[]>} groepen
 */
export function tokensTekst(groepen) {
  return Object.fromEntries(
    Object.entries(groepen).map(([groep, items]) => [
      groep,
      items.map(({ token, klassen, licht, donker, app, bron }) =>
        [
          token,
          `klasse ${klassen.length === 0 ? '(geen)' : klassen.join(', ')}`,
          `standaard ${licht}`,
          ...(donker === undefined ? [] : [`donker ${donker}`]),
          ...(app === undefined ? [] : [`app ${app}`]),
          bron,
        ].join(' · '),
      ),
    ]),
  );
}
