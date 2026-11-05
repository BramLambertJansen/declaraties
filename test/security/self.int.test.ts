import { describe, expect, test } from 'vitest';
import { routes } from '../../src/api/app.ts';
import {
  classificatieProblemen,
  eigenaarApiProblemen,
  eigenaarTabellen,
  spoofApiProblemen,
  spoofDbProblemen,
  strictProblemen,
  tabelEigenaarProblemen,
} from './controles.ts';
import { routeLabel } from './fixtures.ts';
import {
  EIGENAAR_ROUTES,
  EIGENAAR_ROUTES_LOS,
  EIGENAAR_ROUTES_ONEINDIG,
  openEigenaarProbe,
  probeClassificatieProblemen,
  type EigenaarProbe,
} from './probe-eigenaar.ts';
import { resources, routeClassificatie } from './resources.ts';

// De suite test zichzelf (spec security-suite, AC-13): de probe-resource uit de generatorsjabloon is groen, en elke bewust
// gebroken variant maakt de bijbehorende controle rood. Het bewijs is de controlefunctie op de gebroken variant aan te roepen
// en haar problemen te lezen, niet de suite te laten falen. Elke variant draait in een eigen, terugdraaiende transactie.
const LANG = 120_000;
const SELECT_POLICY = 'security_probes_select_own';

async function metProbe<T>(voorbereiding: readonly string[], werk: (ep: EigenaarProbe) => Promise<T>): Promise<T> {
  const ep = await openEigenaarProbe();
  try {
    await ep.alsEigenaar(voorbereiding);
    return await werk(ep);
  } finally {
    await ep.sluit();
  }
}

describe('security/AC-13: de suite test zichzelf', { timeout: LANG }, () => {
  test('security/AC-13: de goede probe-resource is groen voor elke controle van AC-8 t/m AC-11', async () => {
    // Elke controle krijgt een eigen terugdraaiende transactie: ze maken allemaal rijen met hetzelfde sample, en de unieke
    // index (owner_id, label) laat dat maar één keer per transactie toe.
    const problemen = {
      tabel: await metProbe([], (ep) => tabelEigenaarProblemen(ep.spelers, resources)),
      spoofDb: await metProbe([], (ep) => spoofDbProblemen(ep.spelers, resources)),
      api: await metProbe([], (ep) => eigenaarApiProblemen(ep.opzet())),
      spoofApi: await metProbe([], (ep) => spoofApiProblemen(ep.opzet())),
      classificatie: await metProbe([], async (ep) => probeClassificatieProblemen(await eigenaarTabellen(ep.spelers))),
      strict: strictProblemen(EIGENAAR_ROUTES),
    };

    expect(problemen).toStrictEqual({ tabel: [], spoofDb: [], api: [], spoofApi: [], classificatie: [], strict: [] });
  });

  test('security/AC-13: een weggehaalde policy maakt AC-8 rood', async () => {
    const problemen = await metProbe([`drop policy ${SELECT_POLICY} on public.security_probes`], (ep) =>
      tabelEigenaarProblemen(ep.spelers, resources),
    );

    expect(problemen.length).toBeGreaterThan(0);
    expect(problemen.every((probleem) => probleem.startsWith('public.security_probes: '))).toBe(true);
  });

  test('security/AC-13: using (true) op de select-policy maakt AC-8 rood: B raakt de rij van A', async () => {
    const voorbereiding = [
      `drop policy ${SELECT_POLICY} on public.security_probes`,
      `create policy ${SELECT_POLICY} on public.security_probes for select to app_authenticated using (true)`,
    ];

    const problemen = await metProbe(voorbereiding, (ep) => tabelEigenaarProblemen(ep.spelers, resources));

    expect(problemen).toContain('public.security_probes: B raakt via select 1 rij(en) van A');
  });

  test('security/AC-13: using (true) op de select-policy maakt AC-9 rood: B ziet de rij van A in de lijst en bij lezen', async () => {
    const voorbereiding = [
      `drop policy ${SELECT_POLICY} on public.security_probes`,
      `create policy ${SELECT_POLICY} on public.security_probes for select to app_authenticated using (true)`,
    ];

    const problemen = await metProbe(voorbereiding, (ep) => eigenaarApiProblemen(ep.opzet()));

    expect(
      problemen.some((probleem) => probleem.includes('de lijst van B') && probleem.includes('bevat een rij van A')),
    ).toBe(true);
    expect(problemen.some((probleem) => probleem.includes('B read op een rij van A gaf 200'))).toBe(true);
  });

  test.each(['update', 'delete'] as const)(
    'security/AC-13: alleen de %s-policy met using (true) maakt AC-8 rood: B raakt de rij van A',
    async (actie) => {
      const naam = `security_probes_${actie}_own`;
      const voorbereiding = [
        `drop policy ${naam} on public.security_probes`,
        `create policy ${naam} on public.security_probes for ${actie} to app_authenticated using (true)${actie === 'update' ? ' with check (true)' : ''}`,
      ];

      const problemen = await metProbe(voorbereiding, (ep) => tabelEigenaarProblemen(ep.spelers, resources));

      expect(problemen).toContain(`public.security_probes: B raakt via ${actie} 1 rij(en) van A`);
    },
  );

  test('security/AC-13: een lijst met een cursor die nooit eindigt maakt AC-9 rood in plaats van stil te stoppen', async () => {
    const problemen = await metProbe([], (ep) => eigenaarApiProblemen(ep.opzet(EIGENAAR_ROUTES_ONEINDIG)));

    expect(problemen.some((probleem) => probleem.includes('controle afgebroken') && probleem.includes('cursor'))).toBe(
      true,
    );
  });

  test('security/AC-13: een sample.update met een kolom zonder update-recht maakt AC-8 rood met een aanwijzing', async () => {
    const regel = resources.security_probes;
    if (regel === undefined) throw new Error('resources.security_probes ontbreekt');
    const ongeldig = {
      security_probes: { ...regel, sample: { ...regel.sample, update: { created_at: '2020-01-01T00:00:00Z' } } },
    };

    const problemen = await metProbe([], (ep) => tabelEigenaarProblemen(ep.spelers, ongeldig));

    expect(problemen.some((probleem) => probleem.includes('kies een updatebare kolom in sample.update'))).toBe(true);
  });

  test('security/AC-13: een kolomrecht op owner_id maakt AC-10 rood: A kan de eigen owner_id kiezen', async () => {
    const voorbereiding = ['grant insert (owner_id), update (owner_id) on public.security_probes to app_authenticated'];

    const problemen = await metProbe(voorbereiding, (ep) => spoofDbProblemen(ep.spelers, resources));

    expect(problemen.some((probleem) => probleem.includes('A insert met de eigen owner_id'))).toBe(true);
    expect(problemen.some((probleem) => probleem.includes('A update met de eigen owner_id'))).toBe(true);
  });

  test('security/AC-13: een route zonder strict input maakt AC-10 rood: owner_id wordt stilletjes genegeerd', async () => {
    const problemen = await metProbe([], async (ep) => ({
      api: await spoofApiProblemen(ep.opzet(EIGENAAR_ROUTES_LOS)),
      strict: strictProblemen(EIGENAAR_ROUTES_LOS),
    }));

    expect(problemen.strict).toStrictEqual(["route 'POST /probes': input is niet strict"]);
    expect(
      problemen.api.some((probleem) => probleem.includes('create met velden (label, owner_id) gaf 409 ALREADY_EXISTS')),
    ).toBe(true);
  });

  test('security/AC-13: een ongeldige sample.spoof maakt AC-10 rood, niet groen door een validatiefout op een ander veld', async () => {
    const problemen = await metProbe([], (ep) => {
      const opzet = ep.opzet();
      const regel = resources.security_probes;
      if (regel === undefined) throw new Error('resources.security_probes ontbreekt');
      const ongeldig = { ...regel, sample: { ...regel.sample, spoof: { label: '' } } };
      return spoofApiProblemen({ ...opzet, resources: { security_probes: ongeldig } });
    });

    expect(problemen.some((probleem) => probleem.includes('create zonder spoof-veld gaf 400'))).toBe(true);
  });

  test('security/AC-13: zonder sample.spoof is AC-10 via de API rood met een aanwijzing (fail-closed)', async () => {
    const problemen = await metProbe([], (ep) => {
      const regel = resources.security_probes;
      if (regel === undefined) throw new Error('resources.security_probes ontbreekt');
      const zonderSpoof = { create: regel.sample.create, createTweede: regel.sample.createTweede };
      return spoofApiProblemen({ ...ep.opzet(), resources: { security_probes: { ...regel, sample: zonderSpoof } } });
    });

    expect(problemen.some((probleem) => probleem.includes('sample.spoof ontbreekt'))).toBe(true);
  });

  test('security/AC-13: een route buiten routeClassificatie maakt AC-11 rood', () => {
    const problemen = classificatieProblemen({
      routes: [...routes.map(routeLabel), 'DELETE /nieuw/:id'],
      classificatie: routeClassificatie,
      resources,
      eigenaarTabellen: [],
    });

    expect(problemen).toStrictEqual([
      "route 'DELETE /nieuw/:id' staat niet in routeClassificatie (test/security/resources.ts)",
    ]);
  });
});
