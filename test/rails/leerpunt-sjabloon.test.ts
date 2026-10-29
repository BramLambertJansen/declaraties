import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec leerlus (docs/specs/leerlus.md), ADR 0059: het issue form `leerpunt`, de CLI-koppen in de skill `opleveren`
// en de reviewermelding houden dezelfde velden, labels en soorten.
//
// Vaste opmaak van .github/ISSUE_TEMPLATE/leerpunt.yml (geen YAML-dependency; deze test leest regel voor regel en
// faalt op elke regel die niet in deze vorm past):
//
//   name: Leerpunt
//   description: <tekst>
//   title: "Leerpunt: "
//   labels: [leerpunt]
//   body:
//     - type: dropdown            # twee spaties, dan `- type: dropdown|textarea|input`
//       id: soort                 # vier spaties
//       attributes:               # vier spaties
//         label: Soort            # zes spaties
//         description: <tekst>    # zes spaties, optioneel
//         options:                # zes spaties, alleen bij dropdown
//           - Doorgeglipte fout   # acht spaties
//       validations:              # vier spaties
//         required: true          # zes spaties; bij `eerder` `required: false` of geen validations-blok
//
// Een waarde staat op één regel, onomhuld of tussen dubbele aanhalingstekens (zonder escapes); waarden met `: ` of `#`
// moeten tussen aanhalingstekens. Lege regels en regels die met `#` beginnen tellen niet. Geen andere sleutels (ook geen
// `render:`, `placeholder:` of `value:`), geen `type: markdown`.
//
// CLI-tekst in de skill: één fenced codeblok in .claude/skills/opleveren/SKILL.md met de regels `### <label>`; de
// `### `-regels in dat blok zijn precies de labels van het sjabloon, in dezelfde volgorde.
// Reviewer: .claude/agents/reviewer.md noemt `Leerpunt: ja (<soort>)` en `Leerpunt: nee` bij de blokkerende bevinding en
// somt de negen soorten op als backtick-spans (`Doorgeglipte fout`, …), aaneengesloten en in de volgorde van het sjabloon.

const TEMPLATE = '.github/ISSUE_TEMPLATE/leerpunt.yml';
const SKILL = '.claude/skills/opleveren/SKILL.md';
const REVIEWER = '.claude/agents/reviewer.md';

const read = (file: string): string => (existsSync(file) ? readFileSync(file, 'utf8') : '');

type Field = {
  type: string;
  id: string;
  label: string;
  description: string | null;
  options: string[];
  required: boolean;
  extra: string[];
};

type Form = { top: Map<string, string>; fields: Field[]; unknown: string[] };

const SOORTEN = [
  'Doorgeglipte fout',
  'Herhaald handwerk',
  'Onduidelijke instructie',
  'Ontbrekend component',
  'Wrijving in de werkstraat',
  'Valkuil zonder check',
  'Efficiëntie van de code',
  'Kracht van de coding agent',
  'Tokenefficiëntie',
];
const LADDER = ['Type', 'Check', 'Gouden pad of generator', 'Skill', 'Padregel', 'AGENTS.md'];

// Volgorde, type, label en uitleg letterlijk uit "Hergebruik en UX" van de spec.
const VELDEN = [
  { id: 'soort', type: 'dropdown', label: 'Soort', description: null, required: true },
  {
    id: 'bron',
    type: 'textarea',
    label: 'Bron',
    description:
      'App-PR-nummer, checknaam of signaalmoment (slotvraag, derde CI-ronde, eigenaarcorrectie, reviewbevinding, tweede correctiepoging). Geen appdata, logs of schermafbeeldingen.',
    required: true,
  },
  {
    id: 'kosten',
    type: 'textarea',
    label: 'Kosten',
    description:
      'Alleen tellingen uit pnpm meting of de PR: CI-rondes, beurten, prompts, minuten. Onbekend is onbekend.',
    required: true,
  },
  {
    id: 'reproductie',
    type: 'textarea',
    label: 'Generieke reproductie',
    description:
      'Stappen op een verse kopie van de template, zonder appcode of appdata. Zonder reproductie geen leerpunt.',
    required: true,
  },
  { id: 'ladder', type: 'dropdown', label: 'Voorstel voor de plek', description: null, required: true },
  {
    id: 'template_sha',
    type: 'input',
    label: 'Template-SHA van de app',
    description: 'Uitvoer van git merge-base HEAD template/main (40 tekens); in de template zelf: HEAD.',
    required: true,
  },
  {
    id: 'eerder',
    type: 'input',
    label: 'Eerder',
    description: 'Bij een terugkerende fout: eerder: #nnn. Anders leeg.',
    required: false,
  },
];

const BESCHRIJVING =
  'Een les uit het bouwen van een app die de template kan verbeteren. Alleen in de template-repo; geen appcode, appdata of geheimen.';

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

type State = { form: Form; field: Field | null; section: 'attributes' | 'validations' | 'options' | null };

function attributeLine(line: string, state: State): boolean {
  const field = state.field;
  const match = /^ {6}(\w+):(?: (.*))?$/.exec(line);
  if (field === null || match === null || state.section === null) return false;
  const [, key = '', value = ''] = match;
  if (state.section === 'validations') {
    if (key !== 'required' || !['true', 'false'].includes(value)) return false;
    field.required = value === 'true';
    return true;
  }
  if (key === 'label') field.label = unquote(value);
  else if (key === 'description') field.description = unquote(value);
  else if (key === 'options' && value === '') state.section = 'options';
  else field.extra.push(key);
  return true;
}

function fieldLine(line: string, state: State): boolean {
  const entry = /^ {2}- type: (\S+)$/.exec(line);
  if (entry !== null) {
    state.field = {
      type: entry[1] ?? '',
      id: '',
      label: '',
      description: null,
      options: [],
      required: false,
      extra: [],
    };
    state.form.fields.push(state.field);
    state.section = null;
    return true;
  }
  const prop = /^ {4}(\w+):(?: (.*))?$/.exec(line);
  if (state.field === null || prop === null) return false;
  const [, key = '', value = ''] = prop;
  if (key === 'id') state.field.id = unquote(value);
  else if ((key === 'attributes' || key === 'validations') && value === '') state.section = key;
  else state.field.extra.push(key);
  return true;
}

function parseLine(line: string, state: State): boolean {
  const option = /^ {8}- (.+)$/.exec(line);
  if (option !== null && state.section === 'options' && state.field !== null) {
    state.field.options.push(unquote(option[1] ?? ''));
    return true;
  }
  if (/^ {6}\S/.test(line) && state.section === 'options') state.section = 'attributes';
  if (/^ {6}\S/.test(line)) return attributeLine(line, state);
  if (/^ {2}\S|^ {4}\S/.test(line)) return fieldLine(line, state);
  const top = /^(\w+):(?: (.*))?$/.exec(line);
  if (top === null) return false;
  state.form.top.set(top[1] ?? '', unquote(top[2] ?? ''));
  state.field = null;
  return true;
}

function parseForm(text: string): Form {
  const state: State = { form: { top: new Map(), fields: [], unknown: [] }, field: null, section: null };
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!parseLine(line, state)) state.form.unknown.push(line);
  }
  return state.form;
}

const formText = read(TEMPLATE);
const form = parseForm(formText);
const byId = (id: string): Field | undefined => form.fields.find((field) => field.id === id);

describe('leerpunt-sjabloon: velden en opmaak', () => {
  test('leerlus/AC-1: het sjabloon bestaat en volgt de vaste opmaak (geen onleesbare regels)', () => {
    expect(existsSync(TEMPLATE), `${TEMPLATE} ontbreekt`).toBe(true);
    expect(form.unknown).toStrictEqual([]);
    expect(form.fields.map((field) => field.extra)).toStrictEqual(form.fields.map(() => []));
  });

  test('leerlus/AC-1: naam, titel en labels [leerpunt]', () => {
    expect([...form.top.keys()].sort()).toStrictEqual(['body', 'description', 'labels', 'name', 'title']);
    expect(form.top.get('name')).toBe('Leerpunt');
    expect(form.top.get('title')).toBe('Leerpunt: ');
    expect(form.top.get('labels')).toBe('[leerpunt]');
  });

  test('leerlus/AC-1: precies de zeven velden, in volgorde, met type, label en verplichting', () => {
    expect(form.fields.map(({ id, type, label, required }) => ({ id, type, label, required }))).toStrictEqual(
      VELDEN.map(({ id, type, label, required }) => ({ id, type, label, required })),
    );
  });

  test('leerlus/AC-1: soort heeft exact de negen opties en ladder de zes, in volgorde', () => {
    expect(byId('soort')?.options).toStrictEqual(SOORTEN);
    expect(byId('ladder')?.options).toStrictEqual(LADDER);
    const zonderOpties = form.fields.filter((field) => field.type !== 'dropdown').map((field) => field.options);
    expect(zonderOpties.every((options) => options.length === 0)).toBe(true);
  });

  test('leerlus/AC-1: de uitleg per veld staat er letterlijk', () => {
    expect(form.fields.map(({ id, description }) => ({ id, description }))).toStrictEqual(
      VELDEN.map(({ id, description }) => ({ id, description })),
    );
  });
});

describe('leerpunt-sjabloon: geen appdata', () => {
  test("leerlus/AC-2: buiten de zeven veld-id's geen invoerveld, geen bijlage- of logtype", () => {
    expect(existsSync(TEMPLATE), `${TEMPLATE} ontbreekt`).toBe(true);
    const ids = form.fields.map((field) => field.id);
    expect(ids.filter((id) => !VELDEN.some((veld) => veld.id === id))).toStrictEqual([]);
    expect(ids).toHaveLength(VELDEN.length);
    expect(form.fields.filter((field) => !['dropdown', 'textarea', 'input'].includes(field.type))).toStrictEqual([]);
    // `render:` maakt van een textarea een log- of codeblok; `extra` vangt elke sleutel buiten de vaste opmaak.
    expect(formText).not.toMatch(/^\s*render:/m);
    expect(form.fields.flatMap((field) => field.extra)).toStrictEqual([]);
  });

  test('leerlus/AC-2: beschrijving, bron en reproductie sluiten appcode, appdata of geheimen uit', () => {
    expect(form.top.get('description')).toBe(BESCHRIJVING);
    expect(form.top.get('description')).toContain('geen appcode, appdata of geheimen');
    expect(byId('bron')?.description).toContain('Geen appdata, logs of schermafbeeldingen.');
    expect(byId('reproductie')?.description).toContain('zonder appcode of appdata');
  });
});

/** De `### `-regels uit het fenced codeblok in de skill dat `### Soort` bevat. */
function skillHeadings(text: string): string[] {
  const blocks = [...text.matchAll(/^\s*```[^\n]*\n([\s\S]*?)^\s*```\s*$/gm)].map((match) => match[1] ?? '');
  const block = blocks.find((body) => /^\s*### Soort\s*$/m.test(body)) ?? '';
  return [...block.matchAll(/^\s*### (.+?)\s*$/gm)].map((match) => match[1] ?? '');
}

describe('leerpunt-sjabloon: gelijk aan skill en reviewer', () => {
  test('leerlus/AC-3: de koppen van de CLI-tekst in opleveren zijn de labels van het sjabloon, in volgorde', () => {
    const labels = form.fields.map((field) => field.label);
    expect(labels).toStrictEqual(VELDEN.map((veld) => veld.label));
    expect(skillHeadings(read(SKILL))).toStrictEqual(labels);
  });

  test('leerlus/AC-4: reviewer vraagt per blokkerende bevinding "Leerpunt: ja (<soort>)" of "Leerpunt: nee"', () => {
    const reviewer = read(REVIEWER);
    const blokken = reviewer.split(/\n\s*\n|\n(?=\s*(?:\d+\.|-) )/).map((blok) => blok.replace(/\s+/g, ' '));
    const blok = blokken.find((tekst) => tekst.includes('Leerpunt: ja (<soort>)')) ?? '';
    expect(blok).toContain('Leerpunt: nee');
    expect(blok).toMatch(/blokkerende bevinding/i);
  });

  test('leerlus/AC-4: reviewer noemt dezelfde soortenlijst als het sjabloon', () => {
    const opties = byId('soort')?.options ?? [];
    expect(opties).toStrictEqual(SOORTEN);
    const spans = [...read(REVIEWER).matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? '');
    const start = spans.indexOf(opties[0] ?? '');
    expect(start, 'reviewer.md noemt de eerste soort niet als backtick-span').toBeGreaterThanOrEqual(0);
    expect(spans.slice(start, start + opties.length)).toStrictEqual(opties);
  });
});
