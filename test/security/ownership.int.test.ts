import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { routes } from '../../src/api/app.ts';
import { encodeCursor } from '../../src/core/shared/cursor.ts';
import {
  classificatieProblemen,
  eigenaarApiProblemen,
  eigenaarTabellen,
  echteZender,
  spoofApiProblemen,
  spoofDbProblemen,
  strictProblemen,
  tabelEigenaarProblemen,
} from './controles.ts';
import { createSecurityFixtures, routeLabel } from './fixtures.ts';
import {
  EIGENAAR_ROUTES,
  openEigenaarProbe,
  probeClassificatieProblemen,
  type EigenaarProbe,
} from './probe-eigenaar.ts';
import { routeClassificatie, resources, sampleVoor } from './resources.ts';

// Generieke securitysuite, deel 2 (spec security-suite, AC-8 t/m AC-11): eigenaarschap van A tegen B, op de database en via de
// API, en de fail-closed classificatie. Draait tegen de probe-resource (public.security_probes, opgebouwd uit de generatorsjabloon
// in een terugdraaiende transactie) en de probe-app; elke owner-tabel en eigenaar-route van het echte register doet vanzelf mee.
// Echte database en RLS; alleen de sessie van de probe-app komt uit de test-gateway van asUser (zie fixtures.ts). `pnpm test:db`.
const LANG = 120_000;

let ep: EigenaarProbe;
beforeEach(async () => {
  ep = await openEigenaarProbe();
}, LANG);
afterEach(async () => {
  await ep.sluit();
});

describe('security/AC-8: eigenaarschap op de database', { timeout: LANG }, () => {
  test('security/AC-8: de catalogus bevat de probe-tabel als owner-tabel (de controle is niet leeg)', async () => {
    expect(await eigenaarTabellen(ep.spelers)).toContain('public.security_probes');
  });

  test('security/AC-8: bij elke owner-tabel raakt B met select, update en delete 0 rijen en blijft de rij van A ongewijzigd', async () => {
    expect(await tabelEigenaarProblemen(ep.spelers, resources)).toStrictEqual([]);
  });
});

describe('security/AC-9: eigenaarschap via de API', { timeout: LANG }, () => {
  test('security/AC-9: de probe-routes dekken alle vijf de acties van de resource', () => {
    const acties = Object.values(ep.opzet().classificatie).flatMap((klasse) =>
      klasse.scope === 'eigenaar' ? [klasse.actie] : [],
    );
    expect(acties.sort()).toStrictEqual(['create', 'delete', 'list', 'read', 'update']);
  });

  test('security/AC-9: B krijgt 404 NOT_FOUND op het id van A (gelijk aan een onbekend id) en de lijst van B bevat niets van A', async () => {
    expect(await eigenaarApiProblemen(ep.opzet())).toStrictEqual([]);
  });

  test('security/AC-9: een cursor vóór de rij van A (alle rijen komen erna) geeft B niets van A', async () => {
    const opzet = ep.opzet();
    const maak = await opzet.zend('A', {
      method: 'POST',
      pad: '/probes',
      params: {},
      invoer: { label: 'beveiligingstest-cursor' },
    });
    const aId = z.object({ id: z.string() }).parse(maak.json).id;

    const bAntwoord = await opzet.zend('B', {
      method: 'GET',
      pad: '/probes',
      params: {},
      invoer: { cursor: encodeCursor({ id: '00000000-0000-4000-8000-000000000000' }), limit: 100 },
    });

    expect(maak.status, maak.tekst).toBe(200);
    expect(bAntwoord.status, bAntwoord.tekst).toBe(200);
    expect(bAntwoord.tekst).not.toContain(aId);
    expect(bAntwoord.tekst).not.toContain('beveiligingstest-cursor');
  });

  test('security/AC-9: elke eigenaar-route van het echte register krijgt de A-tegen-B-tests met echte accounts en cookies', async () => {
    const eigenaarRoutes = Object.entries(routeClassificatie).filter(([, klasse]) => klasse.scope === 'eigenaar');
    if (eigenaarRoutes.length === 0) {
      // De template heeft geen owner-resource: het register bevat alleen eigen-account- en admin-routes.
      expect(Object.keys(routeClassificatie).sort()).toStrictEqual(routes.map(routeLabel).sort());
      return;
    }
    const t = createSecurityFixtures();
    try {
      for (const [naam, regel] of Object.entries(resources)) {
        const classificatie = Object.fromEntries(
          eigenaarRoutes.filter(([, klasse]) => klasse.scope === 'eigenaar' && klasse.resource === naam),
        );
        if (Object.keys(classificatie).length === 0) continue;
        const rol = regel.rol ?? 'user';
        const opzet = {
          zend: echteZender(t, rol),
          classificatie,
          resources: { [naam]: regel },
          gebruikers: { A: (await t.A(rol)).userId, B: (await t.B(rol)).userId },
        };
        expect(await eigenaarApiProblemen(opzet)).toStrictEqual([]);
        expect(await spoofApiProblemen(opzet)).toStrictEqual([]);
      }
    } finally {
      await t.close();
    }
  });
});

describe('security/AC-10: owner_id, id en created_at zijn niet te kiezen', { timeout: LANG }, () => {
  test('security/AC-10: direct op de database faalt een insert of update met owner_id van B, de eigen owner_id, id of created_at met 42501', async () => {
    expect(await spoofDbProblemen(ep.spelers, resources)).toStrictEqual([]);
  });

  test('security/AC-10: via de API-input geven owner_id, id en created_at 400 VALIDATION en verandert er niets', async () => {
    expect(await spoofApiProblemen(ep.opzet())).toStrictEqual([]);
  });

  test('security/AC-10: elke route van het register en van de probe-app heeft een strict input', () => {
    expect(strictProblemen(routes)).toStrictEqual([]);
    expect(strictProblemen(EIGENAAR_ROUTES)).toStrictEqual([]);
  });
});

describe('security/AC-11: fail-closed classificatie', { timeout: LANG }, () => {
  const labels = routes.map(routeLabel);

  test('security/AC-11: elke route van het register staat in routeClassificatie en elke owner-tabel in resources', async () => {
    const tabellen = await eigenaarTabellen(ep.spelers);

    expect(
      classificatieProblemen({
        routes: labels,
        classificatie: routeClassificatie,
        resources,
        eigenaarTabellen: tabellen,
      }),
    ).toStrictEqual([]);
    expect(probeClassificatieProblemen(tabellen)).toStrictEqual([]);
  });

  test('security/AC-11: een route die niet in routeClassificatie staat is rood met de naam van de route', () => {
    const problemen = classificatieProblemen({
      routes: [...labels, 'GET /nieuw/:id'],
      classificatie: routeClassificatie,
      resources,
      eigenaarTabellen: [],
    });

    expect(problemen).toStrictEqual([
      "route 'GET /nieuw/:id' staat niet in routeClassificatie (test/security/resources.ts)",
    ]);
  });

  test('security/AC-11: een verouderde regel in routeClassificatie (route niet in het register) is rood', () => {
    const problemen = classificatieProblemen({
      routes: labels,
      classificatie: { ...routeClassificatie, 'GET /weg': { scope: 'admin' } },
      resources,
      eigenaarTabellen: [],
    });

    expect(problemen).toStrictEqual(["routeClassificatie bevat 'GET /weg', maar die route staat niet in het register"]);
  });

  test('security/AC-11: een eigenaar-route naar een niet-gedeclareerde resource is rood met de naam van route en resource', () => {
    const problemen = classificatieProblemen({
      routes: ['GET /facturen'],
      classificatie: { 'GET /facturen': { scope: 'eigenaar', resource: 'facturen', actie: 'list' } },
      resources,
      eigenaarTabellen: [],
    });

    expect(problemen).toStrictEqual([
      "route 'GET /facturen' wijst naar resource 'facturen', die niet in resources staat (test/security/resources.ts)",
    ]);
  });

  test('security/AC-11: een owner-tabel zonder regel in resources is rood met de naam van de tabel', () => {
    const problemen = classificatieProblemen({
      routes: labels,
      classificatie: routeClassificatie,
      resources,
      eigenaarTabellen: ['public.security_probes', 'public.facturen'],
    });

    expect(problemen).toStrictEqual([
      "owner-tabel 'public.facturen' heeft geen regel in resources (test/security/resources.ts)",
    ]);
  });

  test('security/AC-11: de directe databasecontrole is rood voor een owner-tabel zonder regel in resources', async () => {
    const problemen = await tabelEigenaarProblemen(ep.spelers, {});

    expect(problemen).toContain(
      'public.security_probes: owner-tabel zonder regel in resources (test/security/resources.ts)',
    );
  });

  test('security/AC-11: elke route van het register heeft een afleidbare of in resources.ts gedeclareerde voorbeeldinput', () => {
    for (const route of routes) {
      expect(() => sampleVoor(route), routeLabel(route)).not.toThrow();
    }
  });
});
