import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  COMMENT_ZONDER_BEWIJS,
  commentOnvolledig,
  leesSjabloon,
  sluitOordeel,
  toetsBody,
} from '../../scripts/kit/leerpunt.mjs';
import {
  LABEL_ONVOLLEDIG,
  LABEL_ZONDER_BEWIJS,
  leesGebeurtenis,
  onderhoudRepo,
  stappen,
  teToetsen,
} from '../../scripts/kit/leerpunt-check.mjs';

// Issue-check voor leerpunten (ADR 0078 punt 3, spec leerlus-bewijs AC-5 en AC-6).
const velden = leesSjabloon(readFileSync('.github/ISSUE_TEMPLATE/leerpunt.yml', 'utf8'));

// Een body zoals het GitHub-formulier hem schrijft: `### <label>`, lege regel, waarde.
const WAARDEN: Record<string, string> = {
  Soort: 'Valkuil zonder check',
  Bron: 'PR #502, tweede review',
  Kosten: '1 extra reviewronde',
  'Generieke reproductie': '1. verse kopie\n2. post zonder pre',
  'Voorstel voor de plek': 'Check',
  'Template-SHA van de app': 'a'.repeat(40),
  Eerder: '_No response_',
};
const body = (waarden: Record<string, string> = WAARDEN, volgorde = velden.map((v) => v.label)) =>
  volgorde
    .filter((label) => label in waarden)
    .map((label) => `### ${label}\n\n${waarden[label] ?? ''}`)
    .join('\n\n');
const zonder = (label: string) => Object.fromEntries(Object.entries(WAARDEN).filter(([k]) => k !== label));

// Vorm van echte issues die het sjabloon niet volgen (ingekort): #424 en #500 met `##`-koppen, #504 met vette koppen,
// #487 vrije tekst.
const ECHT = {
  424: '## Wat gebeurde\n\nIn #423 werd `document-status` rood.\n\n## Oorzaak\n\n`testChangeRisk` telt met een regex.\n\n## Voorstel\n\nTel via de AST.',
  487: 'Uit de nalooprondes bleven twee bevindingen over.\n\n**1. `change-email` mist een maximale e-maillengte (PR #93)**\n...',
  500: '## Wat gebeurde\n\nIn PR #494 vonden drie reviewrondes omwegen.\n\n## Voorstel (voor triage)\n\nKies een grens.\n\n## Vangnet\n\n- Tests.',
  504: '**Soort**: valkuil zonder check.\n\n**Wat gebeurde**: in PR #502 claimde een fix fail-closed.\n\n**Les**: elke tak.',
};

describe('leerlus-bewijs/AC-5 het sjabloon', () => {
  test('leerlus-bewijs/AC-5: een body van het formulier klopt, ook met CRLF', () => {
    expect(toetsBody(body(), velden)).toEqual([]);
    expect(toetsBody(body().replaceAll('\n', '\r\n'), velden)).toEqual([]);
  });

  test('leerlus-bewijs/AC-5: Eerder mag ontbreken of leeg zijn', () => {
    expect(toetsBody(body(zonder('Eerder')), velden)).toEqual([]);
    expect(toetsBody(body({ ...WAARDEN, Eerder: 'eerder: #424' }), velden)).toEqual([]);
  });

  test.each([
    ['kop ontbreekt', body(zonder('Kosten')), ['ontbreekt: Kosten']],
    ['verplicht veld leeg', body({ ...WAARDEN, Bron: '' }), ['leeg: Bron']],
    ['_No response_ telt als leeg', body({ ...WAARDEN, Bron: '_No response_' }), ['leeg: Bron']],
    ['vrije tekst in Soort', body({ ...WAARDEN, Soort: 'valkuil' }), ['onbekende waarde bij Soort: valkuil']],
    [
      'vrije tekst in de plek',
      body({ ...WAARDEN, 'Voorstel voor de plek': 'Lintregel of check' }),
      ['onbekende waarde bij Voorstel voor de plek: Lintregel of check'],
    ],
    [
      'verkeerde volgorde',
      body(WAARDEN, [
        'Bron',
        'Soort',
        'Kosten',
        'Generieke reproductie',
        'Voorstel voor de plek',
        'Template-SHA van de app',
      ]),
      ['volgorde: Bron'],
    ],
  ])('leerlus-bewijs/AC-5: %s', (_naam, tekst, fouten) => {
    expect(toetsBody(tekst, velden)).toEqual(fouten);
  });

  test.each(Object.entries(ECHT))('leerlus-bewijs/AC-5: vorm van #%s volgt het sjabloon niet', (_nummer, tekst) => {
    expect(toetsBody(tekst, velden)).toEqual(velden.filter((v) => v.verplicht).map((v) => `ontbreekt: ${v.label}`));
  });

  test('leerlus-bewijs/AC-5: bij fouten label aan met één comment, zonder fouten label uit', () => {
    expect(stappen({ fouten: ['leeg: Bron'], oordeel: null, heropend: false })).toEqual([
      {
        label: LABEL_ONVOLLEDIG,
        aan: true,
        comment: commentOnvolledig(['leeg: Bron']),
        merk: '<!-- leerpunt-check:onvolledig -->',
      },
    ]);
    expect(stappen({ fouten: [], oordeel: null, heropend: false })).toEqual([
      { label: LABEL_ONVOLLEDIG, aan: false, comment: null, merk: '<!-- leerpunt-check:onvolledig -->' },
    ]);
    expect(commentOnvolledig(['leeg: Bron'])).toBe('Dit leerpunt volgt het sjabloon niet:\n\n- leeg: Bron');
  });
});

const event = (actie: string, issue: Record<string, unknown>) => ({
  action: actie,
  issue: { number: 9, state: 'open', body: '', labels: [{ name: 'leerpunt' }], ...issue },
});

describe('leerlus-bewijs/AC-5 en AC-6 welke gebeurtenis wat toetst', () => {
  test.each([
    ['issues', 'opened', 'open', { sjabloon: true, sluiten: false, heropend: false }],
    ['issues', 'edited', 'open', { sjabloon: true, sluiten: false, heropend: false }],
    ['issues', 'labeled', 'open', { sjabloon: true, sluiten: false, heropend: false }],
    ['issues', 'reopened', 'open', { sjabloon: true, sluiten: false, heropend: true }],
    ['issues', 'closed', 'closed', { sjabloon: false, sluiten: true, heropend: false }],
    ['issues', 'labeled', 'closed', { sjabloon: true, sluiten: true, heropend: false }],
    ['issue_comment', 'created', 'closed', { sjabloon: false, sluiten: true, heropend: false }],
    ['issue_comment', 'created', 'open', { sjabloon: false, sluiten: false, heropend: false }],
  ])('leerlus-bewijs/AC-5: %s %s op een %s issue', (...[naam, actie, state, verwacht]) => {
    expect(teToetsen(leesGebeurtenis(event(actie, { state }), naam))).toEqual(verwacht);
  });

  test('leerlus-bewijs/AC-5: issue zonder label leerpunt: niets', () => {
    expect(teToetsen(leesGebeurtenis(event('opened', { labels: [{ name: 'bug' }] }), 'issues'))).toEqual({
      sjabloon: false,
      sluiten: false,
      heropend: false,
    });
  });

  test('leerlus-bewijs/AC-5: alleen in de onderhoudsrepo', () => {
    // Niet het echte gates.json: in een app (check:new-resource na app:init) is `onderhoud` weg.
    expect(onderhoudRepo('{"onderhoud":{"repository":"eigenaar/template"}}')).toBe('eigenaar/template');
    expect(onderhoudRepo('{}')).toBeNull();
  });
});

describe('leerlus-bewijs/AC-6 sluiten met bewijs', () => {
  const PR_BEWIJS = { merged: true, body: '## Leerpunt\n\n- #9: trede Check; bewijs test/a.test.ts' };
  const ACHTERHAALD = { body: 'achterhaald: opgelost door #520', association: 'OWNER' };

  test.each([
    ['gemergde PR met regel', { prs: [PR_BEWIJS], comments: [] }, 'bewijs'],
    ['PR niet gemerged', { prs: [{ ...PR_BEWIJS, merged: false }], comments: [] }, 'zonder-bewijs'],
    [
      'PR zonder regel voor dit nummer',
      { prs: [{ merged: true, body: '## Leerpunt\n\n- #8: trede Check; bewijs test/a.test.ts' }], comments: [] },
      'zonder-bewijs',
    ],
    ['geen PR (commit op main)', { prs: [], comments: [] }, 'zonder-bewijs'],
    ['achterhaald van de eigenaar', { prs: [], comments: [ACHTERHAALD] }, 'achterhaald'],
    [
      'achterhaald van een collaborator',
      { prs: [], comments: [{ ...ACHTERHAALD, association: 'COLLABORATOR' }] },
      'achterhaald',
    ],
    [
      'achterhaald van een ander',
      { prs: [], comments: [{ ...ACHTERHAALD, association: 'CONTRIBUTOR' }] },
      'zonder-bewijs',
    ],
    ['achterhaald zonder reden', { prs: [], comments: [{ ...ACHTERHAALD, body: 'achterhaald:' }] }, 'zonder-bewijs'],
  ])('leerlus-bewijs/AC-6: %s', (_naam, bron, oordeel) => {
    expect(sluitOordeel(9, bron)).toBe(oordeel);
  });

  test('leerlus-bewijs/AC-6: zonder bewijs label aan met comment; met bewijs, achterhaald of heropend label uit', () => {
    expect(stappen({ fouten: null, oordeel: 'zonder-bewijs', heropend: false })).toEqual([
      {
        label: LABEL_ZONDER_BEWIJS,
        aan: true,
        comment: COMMENT_ZONDER_BEWIJS,
        merk: '<!-- leerpunt-check:zonder-bewijs -->',
      },
    ]);
    for (const oordeel of ['bewijs', 'achterhaald'])
      expect(stappen({ fouten: null, oordeel, heropend: false })).toMatchObject([
        { label: LABEL_ZONDER_BEWIJS, aan: false },
      ]);
    expect(stappen({ fouten: [], oordeel: null, heropend: true })).toMatchObject([
      { label: LABEL_ONVOLLEDIG, aan: false },
      { label: LABEL_ZONDER_BEWIJS, aan: false },
    ]);
  });
});
