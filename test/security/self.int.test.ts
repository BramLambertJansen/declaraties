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
    const problemen = await metProbe([], async (ep) => ({
      tabel: await tabelEigenaarProblemen(ep.spelers, resources),
      spoofDb: await spoofDbProblemen(ep.spelers, resources),
      api: await eigenaarApiProblemen(ep.opzet()),
      spoofApi: await spoofApiProblemen(ep.opzet()),
      classificatie: probeClassificatieProblemen(await eigenaarTabellen(ep.spelers)),
      strict: strictProblemen(EIGENAAR_ROUTES),
    }));

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
    expect(problemen.api.some((probleem) => probleem.includes('create met velden (label, owner_id)'))).toBe(true);
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
