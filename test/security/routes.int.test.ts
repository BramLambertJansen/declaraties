import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { routes } from '../../src/api/app.ts';
import { ROLES } from '../../src/core/shared/can.ts';
import {
  adminHeeftPermissie,
  createSecurityFixtures,
  foutvormProblemen,
  heeftBody,
  metVeld,
  onjuisteVelden,
  openProbe,
  oracleSleutelsVerschil,
  routeLabel,
  sampleFor,
  teGroteBody,
  verplichteVelden,
  verwachteUitkomst,
  zonderVeld,
  type ActorSoort,
  type Antwoord,
  type AppRoute,
  type Probe,
  type Verzoek,
} from './fixtures.ts';

// Generieke securitysuite, deel 1 (spec security-suite, AC-1 t/m AC-7): elke route uit het register (`routes` in
// src/api/app.ts) krijgt sessie-, rechten-, MFA-, input- en foutvormtests, zonder dat er per route iets te schrijven is.
// Echte stack: Better Auth-sessies, Postgres met RLS, Mailpit; niets gemockt. Draait via `pnpm test:db`.
// Alleen weigeringen worden aangeroepen: elk verzoek eindigt vóór de handler (401, 403, 400 of 413).
const LANG = 120_000;
const t = createSecurityFixtures();
afterAll(async () => {
  await t.close();
});

type Ac = 'AC-2' | 'AC-3' | 'AC-4' | 'AC-5' | 'AC-6';
const bezocht: Record<Ac, Set<string>> = {
  'AC-2': new Set(),
  'AC-3': new Set(),
  'AC-4': new Set(),
  'AC-5': new Set(),
  'AC-6': new Set(),
};
// Elk foutantwoord uit AC-2 t/m AC-6, voor de eindcontrole van AC-7.
const grootboek: { readonly ac: Ac; readonly label: string; readonly antwoord: Antwoord }[] = [];

const perRoute = routes.map((route) => [routeLabel(route), route] as const);
const codeVan = (antwoord: Antwoord): string | undefined => {
  const gelezen = z.object({ code: z.string() }).safeParse(antwoord.json);
  return gelezen.success ? gelezen.data.code : undefined;
};

// De weigering die de oracle voorschrijft; een toegestane combinatie wordt in deze suite nooit aangeroepen.
function weigering(soort: ActorSoort, route: AppRoute): { status: number; code: string } {
  const uitkomst = verwachteUitkomst(soort, route.contract.permission);
  if (uitkomst.toegestaan)
    throw new Error(`${soort} mag ${routeLabel(route)} volgens de oracle: dat is geen weigering`);
  return { status: uitkomst.status, code: uitkomst.code };
}

// Eén weigering: status en code kloppen én de foutvorm is { code, requestId } (AC-7), en de route telt mee voor AC-1.
function verwachtFout(
  { ac, label, antwoord }: { ac: Ac; label: string; antwoord: Antwoord },
  verwacht: { status: number; code: string },
) {
  bezocht[ac].add(label);
  grootboek.push({ ac, label, antwoord });
  expect(
    { status: antwoord.status, code: codeVan(antwoord) },
    `${ac} ${label}: ${antwoord.tekst.slice(0, 200)}`,
  ).toStrictEqual(verwacht);
  expect(foutvormProblemen(antwoord), `${ac} ${label}: foutvorm`).toStrictEqual([]);
}

describe('security/AC-2: geen sessie', { timeout: LANG }, () => {
  test.each(perRoute)(
    'security/AC-2: %s zonder cookie geeft 401 UNAUTHENTICATED { code, requestId }',
    async (label, route) => {
      const antwoord = await t.stuurAls('geenSessie', route, { sample: sampleFor(route) });

      verwachtFout({ ac: 'AC-2', label, antwoord }, { status: 401, code: 'UNAUTHENTICATED' });
    },
  );
});

describe('security/AC-3: verlopen sessie', { timeout: LANG }, () => {
  const gevallen = routes.flatMap((route) =>
    (['absoluut', 'idle'] as const).map((variant) => [variant, routeLabel(route), route] as const),
  );
  const zichtbaar = (staat: Awaited<ReturnType<typeof t.bijwerkingen>>) => ({
    gebruikers: staat.gebruikers,
    voorbeelden: staat.voorbeelden,
  });

  test.each(gevallen)(
    'security/AC-3: %s verlopen sessie op %s geeft 401 UNAUTHENTICATED en wijzigt niets',
    async (variant, label, route) => {
      const bron = await t.verlopenBron();
      const browser = await t.verlopenBrowser(variant);
      const voor = await t.bijwerkingen();

      const antwoord = await t.stuurMetBrowser(browser, route, { sample: sampleFor(route) });

      verwachtFout({ ac: 'AC-3', label, antwoord }, { status: 401, code: 'UNAUTHENTICATED' });
      expect(zichtbaar(await t.bijwerkingen(voor.ids))).toStrictEqual(zichtbaar(voor));
      // De geldige eerste sessie van hetzelfde account is niet ingetrokken door het verlopen verzoek.
      expect((await t.call(bron.browser, 'GET /api/me')).status).toBe(200);
    },
  );
});

describe('security/AC-4: rechten per permissie en rol', { timeout: LANG }, () => {
  test('security/AC-4: de permissie-oracle heeft precies de sleutels van permissions.names', () => {
    expect(oracleSleutelsVerschil()).toStrictEqual({ alleenInOracle: [], alleenInTabel: [] });
  });

  test('security/AC-4: de suite kent elke rol uit ROLES (een nieuwe rol vraagt een actorsoort)', () => {
    expect([...ROLES].sort()).toStrictEqual(['admin', 'user']);
  });

  // Alleen de combinaties die de oracle weigert; een toegestane aanroep zou de handler uitvoeren (acceptatietest van de resource).
  const geweigerd = routes.flatMap((route) =>
    (['user', 'zonderRol'] as const).flatMap((soort) => {
      const uitkomst = verwachteUitkomst(soort, route.contract.permission);
      return uitkomst.toegestaan ? [] : [[soort, routeLabel(route), route] as const];
    }),
  );

  test.each(geweigerd)(
    'security/AC-4: %s op %s geeft 403 FORBIDDEN en de handler is niet uitgevoerd',
    async (soort, label, route) => {
      const voor = await t.bijwerkingen();

      const antwoord = await t.stuurAls(soort, route, { sample: sampleFor(route) });

      verwachtFout({ ac: 'AC-4', label, antwoord }, weigering(soort, route));
      expect(await t.bijwerkingen(voor.ids)).toStrictEqual(voor);
    },
  );
});

describe('security/AC-5: MFA voor admin', { timeout: LANG }, () => {
  const adminRoutes = routes.filter((route) => adminHeeftPermissie(route.contract.permission));
  const adminRoutesMetLabel = adminRoutes.map((route) => [routeLabel(route), route] as const);

  test.each(adminRoutesMetLabel)(
    'security/AC-5: adminZonderMfa op %s geeft 403 MFA_REQUIRED en de handler is niet uitgevoerd',
    async (label, route) => {
      const voor = await t.bijwerkingen();

      const antwoord = await t.stuurAls('adminZonderMfa', route, { sample: sampleFor(route) });

      verwachtFout({ ac: 'AC-5', label, antwoord }, weigering('adminZonderMfa', route));
      expect(weigering('adminZonderMfa', route).code).toBe('MFA_REQUIRED');
      expect(await t.bijwerkingen(voor.ids)).toStrictEqual(voor);
    },
  );

  // Met MFA alleen op routes zonder bijwerking (GET); de positieve flow van schrijfroutes is de acceptatietest van de resource.
  const leesRoutes = adminRoutesMetLabel.filter(([, route]) => route.contract.method === 'GET');

  test.each(leesRoutes)(
    'security/AC-5: adminMfa op %s geeft niet MFA_REQUIRED, FORBIDDEN of UNAUTHENTICATED',
    async (_, route) => {
      const antwoord = await t.stuurAls('adminMfa', route, { sample: sampleFor(route) });

      expect(antwoord.status, antwoord.tekst.slice(0, 200)).toBe(200);
      expect(codeVan(antwoord)).toBeUndefined();
    },
  );
});

// De ongeldige varianten van een route: onbekend veld, ontbrekend verplicht veld, verkeerd type per veld, kapotte JSON, arraybody.
function ongeldigeGevallen(route: AppRoute): { readonly omschrijving: string; readonly verzoek: Verzoek }[] {
  const sample = sampleFor(route);
  const gevallen = [
    { omschrijving: 'onbekend veld', verzoek: { sample: metVeld(sample, 'beveiligingstest_onbekend', 1) } },
    ...verplichteVelden(route).map((veld) => ({
      omschrijving: `ontbrekend veld '${veld}'`,
      verzoek: { sample: zonderVeld(sample, veld) },
    })),
    ...onjuisteVelden(route).map(({ veld, waarde }) => ({
      omschrijving: `verkeerd type voor '${veld}'`,
      verzoek: { sample: metVeld(sample, veld, waarde) },
    })),
  ];
  if (!heeftBody(route.contract.method)) return gevallen;
  return [
    ...gevallen,
    { omschrijving: 'kapotte JSON', verzoek: { sample, ruw: '{"kapot":' } },
    { omschrijving: 'arraybody', verzoek: { sample, ruw: '[]' } },
  ];
}

describe('security/AC-6: ongeldige input', { timeout: LANG }, () => {
  // Validatie komt vóór de rolcontrole (spec); een gewone user volstaat dus voor elke route.
  test.each(perRoute)(
    'security/AC-6: ongeldige input op %s geeft 400 VALIDATION en de handler is niet uitgevoerd',
    async (label, route) => {
      const voor = await t.bijwerkingen();
      const afwijkingen: string[] = [];

      for (const { omschrijving, verzoek } of ongeldigeGevallen(route)) {
        const antwoord = await t.stuurAls('user', route, verzoek);
        grootboek.push({ ac: 'AC-6', label, antwoord });
        if (antwoord.status !== 400 || codeVan(antwoord) !== 'VALIDATION') {
          afwijkingen.push(
            `${omschrijving}: verwacht 400 VALIDATION, kreeg ${String(antwoord.status)} ${antwoord.tekst.slice(0, 120)}`,
          );
        }
        afwijkingen.push(...foutvormProblemen(antwoord).map((probleem) => `${omschrijving}: ${probleem}`));
      }

      bezocht['AC-6'].add(label);
      expect(afwijkingen).toStrictEqual([]);
      expect(await t.bijwerkingen(voor.ids)).toStrictEqual(voor);
    },
  );

  const metBody = perRoute.filter(([, route]) => route.contract.method !== 'GET');

  test.each(metBody)(
    'security/AC-6: een body boven MAX_BODY_BYTES op %s geeft 413 PAYLOAD_TOO_LARGE',
    async (label, route) => {
      const antwoord = await t.stuurAls('user', route, { sample: sampleFor(route), ruw: teGroteBody() });

      grootboek.push({ ac: 'AC-6', label, antwoord });
      expect({ status: antwoord.status, code: codeVan(antwoord) }).toStrictEqual({
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
      });
      expect(foutvormProblemen(antwoord)).toStrictEqual([]);
    },
  );
});

describe('security/AC-7: foutvorm', { timeout: LANG }, () => {
  let probe: Probe;
  beforeAll(async () => {
    probe = await openProbe();
  }, LANG);
  afterAll(async () => {
    await probe.sluit();
  });

  const databasepaden = [
    {
      pad: '23505 (dubbele sleutel)',
      rol: 'user',
      method: 'POST',
      url: '/probes/dubbel',
      status: 409,
      code: 'ALREADY_EXISTS',
    },
    {
      pad: '23503 (onbekend doel)',
      rol: 'admin',
      method: 'POST',
      url: '/probes/onbekend-doel',
      status: 404,
      code: 'NOT_FOUND',
    },
    { pad: '42501 (geen recht)', rol: 'user', method: 'POST', url: '/probes/verboden', status: 403, code: 'FORBIDDEN' },
    {
      pad: 'onverwachte databasefout',
      rol: 'user',
      method: 'GET',
      url: '/probes/deel-door-nul',
      status: 500,
      code: 'INTERNAL_ERROR',
    },
    {
      pad: 'onverwachte uitzondering',
      rol: 'user',
      method: 'GET',
      url: '/probes/uitzondering',
      status: 500,
      code: 'INTERNAL_ERROR',
    },
  ] as const;

  test.each(databasepaden)(
    'security/AC-7: databasefoutpad $pad van de probe-app geeft precies { code, requestId }',
    async ({ rol, method, url, status, code }) => {
      // onError logt onverwachte fouten naar de console; hier alleen stil zetten, de fout zelf blijft echt.
      const stil = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const gebruiker = await probe.db.asUser(rol);

        const antwoord = await probe.stuur(probe.appVoor(gebruiker), method, url);

        expect({ status: antwoord.status, code: codeVan(antwoord) }, antwoord.tekst.slice(0, 200)).toStrictEqual({
          status,
          code,
        });
        expect(foutvormProblemen(antwoord)).toStrictEqual([]);
      } finally {
        stil.mockRestore();
      }
    },
  );

  test('security/AC-7: elk foutantwoord uit AC-2 t/m AC-6 is precies { code, requestId } met requestId gelijk aan X-Request-Id', () => {
    const problemen = grootboek.flatMap(({ ac, label, antwoord }) =>
      foutvormProblemen(antwoord).map((probleem) => `${ac} ${label}: ${probleem}`),
    );
    // Rood als een eerdere groep niets heeft vastgelegd (dan is er niets gecontroleerd).
    const aantal = (ac: Ac) => grootboek.filter((regel) => regel.ac === ac).length;

    expect(problemen).toStrictEqual([]);
    expect(aantal('AC-2')).toBeGreaterThanOrEqual(routes.length);
    expect(aantal('AC-3')).toBeGreaterThanOrEqual(routes.length * 2);
    expect(aantal('AC-4')).toBeGreaterThanOrEqual(routes.length);
    expect(aantal('AC-5')).toBeGreaterThanOrEqual(
      routes.filter((route) => adminHeeftPermissie(route.contract.permission)).length,
    );
    expect(aantal('AC-6')).toBeGreaterThanOrEqual(routes.length);
  });
});

describe('security/AC-1: het hele routeregister', () => {
  test('security/AC-1: elke route uit routes is geïtereerd door AC-2 t/m AC-6; het aantal iteraties is routes.length', () => {
    const alle = perRoute.map(([label]) => label).sort();
    const admin = routes
      .filter((route) => adminHeeftPermissie(route.contract.permission))
      .map(routeLabel)
      .sort();

    expect(routes.length).toBeGreaterThan(0);
    expect(new Set(alle).size).toBe(routes.length);
    for (const ac of ['AC-2', 'AC-3', 'AC-4', 'AC-6'] as const) {
      expect([...bezocht[ac]].sort(), ac).toStrictEqual(alle);
      expect(bezocht[ac].size, ac).toBe(routes.length);
    }
    expect([...bezocht['AC-5']].sort()).toStrictEqual(admin);
  });
});
