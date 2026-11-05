import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { afgeleid } from '../../rails/hooks/lib/padtabel.mjs';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import {
  NIEUW_ALTIJD_VRAGEN,
  NIEUW_GATES,
  OUDE_GATES_TEKST,
  REPO,
  VLOER,
  nieuw,
  nieuwePaden,
  object,
  repo,
  tekstLijst,
} from './padtabel-kit';

// check-docs op de padtabel (spec padtabel, Werking 6): samenhangregels, dubbele en !-sleutels, de vloer, de spiegels naar
// CODEOWNERS en de Edit-`ask` op de afgeleide lijsten, schrijfrecht tegen de afgeleide gates en de oude vorm.
const PREFIX = '.claude/gates.json: paden.';

async function uitslag(gatesTekst: string, extra: { codeowners?: string[]; ask?: string[] } = {}) {
  return docsViolations(repo({ gatesTekst, ...extra }));
}

async function meldingen(paden: Record<string, unknown>, rest: Record<string, unknown> = {}): Promise<string[]> {
  return (await uitslag(JSON.stringify({ ...nieuw(paden), ...rest }))).map((v) => v.message);
}

const padenMeldingen = (lijst: string[]) => lijst.filter((m) => m.startsWith(PREFIX) || m.includes('paden'));

describe('padtabel: de fixture in de nieuwe vorm is schoon', () => {
  test('geen enkele melding over paden, spiegels of schrijfrecht (padtabel/AC-3, AC-7, AC-8, AC-10)', async () => {
    const lijst = await uitslag(JSON.stringify(nieuw()));
    expect(padenMeldingen(lijst.map((v) => v.message))).toEqual([]);
    expect(lijst.filter((v) => v.key.startsWith('docs:spiegel:') || v.key.startsWith('docs:schrijfrecht:'))).toEqual(
      [],
    );
  });
});

describe('padtabel/AC-3 samenhang tussen schrijven en besluit', () => {
  test('altijdVragen zonder besluit-pr is rood (padtabel/AC-3)', async () => {
    const paden = { ...nieuwePaden(), 'extra/**': { schrijven: 'altijdVragen', besluit: 'eigenaar' } };
    expect(await meldingen(paden)).toContain(`${PREFIX}extra/**: altijdVragen vraagt besluit besluit-pr`);
  });

  test.each(['gate', 'voorReview'])('schrijven %s met besluit agent is rood (padtabel/AC-3)', async (schrijven) => {
    const paden = { ...nieuwePaden(), 'extra/**': { schrijven, besluit: 'agent' } };
    expect(await meldingen(paden)).toContain(`${PREFIX}extra/**: schrijven ${schrijven} met besluit agent`);
  });
});

describe('padtabel/AC-7 CODEOWNERS en de Edit-ask spiegelen de afgeleide lijsten', () => {
  test('CODEOWNERS mist een afgeleide gate en noemt er een te veel: rood (padtabel/AC-7)', async () => {
    const codeowners = [...NIEUW_GATES.filter((g) => g !== 'src/core/**'), 'package.json', 'deploy/**'];
    const keys = (await uitslag(JSON.stringify(nieuw()), { codeowners })).map((v) => v.key);
    expect(keys).toContain('docs:spiegel:codeowners-gates:src/core/**');
    expect(keys).toContain('docs:spiegel:gates:deploy/**');
  });

  test('CODEOWNERS zonder de jsonGates-sleutel package.json: rood (padtabel/AC-7)', async () => {
    const keys = (await uitslag(JSON.stringify(nieuw()), { codeowners: NIEUW_GATES })).map((v) => v.key);
    expect(keys).toContain('docs:spiegel:codeowners-gates:package.json');
  });

  test('Edit-ask wijkt af van de afgeleide altijdVragen: rood (padtabel/AC-7)', async () => {
    const ask = [...NIEUW_ALTIJD_VRAGEN.filter((g) => g !== 'pnpm-lock.yaml'), '.claude/**'];
    const keys = (await uitslag(JSON.stringify(nieuw()), { ask })).map((v) => v.key);
    expect(keys).toContain('docs:spiegel:ask:pnpm-lock.yaml');
    expect(keys).toContain('docs:spiegel:voorreview:.claude/**');
  });

  test('de echte CODEOWNERS en Edit-ask zijn precies de afgeleide gates plus jsonGates en altijdVragen (padtabel/AC-7)', () => {
    const ruw = object(JSON.parse(readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8')));
    const lijsten = afgeleid(ruw);
    const owners = readFileSync(path.join(REPO, '.github/CODEOWNERS'), 'utf8')
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0] ?? '')
      .filter((entry) => entry !== '' && !entry.startsWith('#'))
      .map((entry) => entry.replace(/^\//, '').replace(/\/$/, '/**'));
    expect(new Set(owners)).toEqual(new Set([...lijsten.gates, ...Object.keys(object(ruw['jsonGates']))]));
    const settings = object(JSON.parse(readFileSync(path.join(REPO, '.claude/settings.json'), 'utf8')));
    const ask = tekstLijst(object(settings['permissions'])['ask'])
      .map((regel) => /^Edit\((.+)\)$/.exec(regel)?.[1])
      .filter((pad) => pad !== undefined);
    expect(new Set(ask)).toEqual(new Set(lijsten.altijdVragen));
  });
});

describe('padtabel/AC-8 schrijfrecht van de rollen tegen de afgeleide gates', () => {
  test('docs met docs/** overlapt met gate docs/adr/** (padtabel/AC-8)', async () => {
    const config = nieuw();
    const schrijfrecht = { ...object(config['schrijfrecht']), docs: ['docs/**'] };
    expect(await meldingen(nieuwePaden(), { schrijfrecht })).toContain(
      '.claude/gates.json: schrijfrecht van docs (docs/**) overlapt met gate docs/adr/**',
    );
  });

  test.each(['architect', 'tester', 'reviewer', 'docs'])(
    '%s met src/core/** overlapt met gate src/core/** (padtabel/AC-8)',
    async (rol) => {
      const config = nieuw();
      const schrijfrecht = { ...object(config['schrijfrecht']), [rol]: ['src/core/**'] };
      expect(await meldingen(nieuwePaden(), { schrijfrecht })).toContain(
        `.claude/gates.json: schrijfrecht van ${rol} (src/core/**) overlapt met gate src/core/**`,
      );
    },
  );

  test('een vrije rij (src/**, agent) telt niet als gate (padtabel/AC-8)', async () => {
    const config = nieuw();
    const schrijfrecht = { ...object(config['schrijfrecht']), docs: ['src/web/**'] };
    expect((await meldingen(nieuwePaden(), { schrijfrecht })).filter((m) => m.includes('schrijfrecht'))).toEqual([]);
  });
});

describe('padtabel/AC-9 dubbele sleutels en !-globs', () => {
  test('twee keer dezelfde sleutel in de ruwe tekst is rood (padtabel/AC-9)', async () => {
    const tekst = JSON.stringify(nieuw(), null, 2).replace(
      '"src/**": {',
      '"src/**": {\n      "schrijven": "gate"\n    },\n    "src/**": {',
    );
    expect(tekst.match(/"src\/\*\*":/g)).toHaveLength(2);
    expect((await uitslag(tekst)).map((v) => v.message)).toContain(`${PREFIX}src/**: dubbele sleutel`);
  });

  test('een sleutel !x/** is rood (padtabel/AC-9)', async () => {
    const paden = { ...nieuwePaden(), '!x/**': { schrijven: 'gate' } };
    expect(await meldingen(paden)).toContain(`${PREFIX}!x/**: een glob begint niet met !`);
  });
});

describe('padtabel/AC-10 de vloer', () => {
  test.each(VLOER)('rij %s ontbreekt: rood (padtabel/AC-10)', async (glob) => {
    const paden = Object.fromEntries(Object.entries(nieuwePaden()).filter(([sleutel]) => sleutel !== glob));
    expect(await meldingen(paden)).toContain(`${PREFIX}${glob}: vloer: verwacht altijdVragen en besluit-pr`);
  });

  test.each(
    VLOER.flatMap((glob) => [
      [glob, 'voorReview', 'besluit-pr'],
      [glob, 'altijdVragen', 'eigenaar'],
    ]),
  )('rij %s lager dan de vloer (%s, %s): rood (padtabel/AC-10)', async (glob = '', schrijven, besluit) => {
    const paden = { ...nieuwePaden(), [glob]: { schrijven, besluit } };
    expect(await meldingen(paden)).toContain(`${PREFIX}${glob}: vloer: verwacht altijdVragen en besluit-pr`);
  });

  test('de vloer telt alleen een eigen rij: .claude/** met altijdVragen dekt .claude/gates.json niet (padtabel/AC-10)', async () => {
    const rest = Object.fromEntries(
      Object.entries(nieuwePaden()).filter(([sleutel]) => sleutel !== '.claude/gates.json'),
    );
    const paden = { ...rest, '.claude/**': { schrijven: 'altijdVragen', besluit: 'besluit-pr' } };
    expect(await meldingen(paden)).toContain(`${PREFIX}.claude/gates.json: vloer: verwacht altijdVragen en besluit-pr`);
  });
});

describe('padtabel/AC-11 de oude vorm in check-docs', () => {
  test('gates.json van 30cc352 geeft de migratiemelding (padtabel/AC-11)', async () => {
    const ruw = object(JSON.parse(OUDE_GATES_TEKST));
    const codeowners = [...tekstLijst(ruw['gates']), 'package.json'];
    const lijst = (await uitslag(OUDE_GATES_TEKST, { codeowners, ask: tekstLijst(ruw['altijdVragen']) })).map(
      (v) => v.message,
    );
    expect(lijst).toContain('.claude/gates.json: oude vorm zonder paden; zet de lijsten om naar paden (ADR 0079)');
  });

  test('paden naast de oude lijsten is rood (padtabel/AC-11)', async () => {
    const lijst = await meldingen(nieuwePaden(), { gates: ['src/core/**'] });
    expect(lijst).toContain('.claude/gates.json: paden naast de oude lijsten');
  });
});
