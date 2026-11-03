import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// Spec inloggat-dichten, "Raakt ook" (ADR 0075): na de bouw (#479) beschrijven regelboek en spec eigen-account het nieuwe gedrag.
// Een link van de e-mailwijziging werkt één keer en er staat geen sessietoken in JSON. Structuurtests op sleutelwoorden.
const lees = (pad: string): string => readFileSync(pad, 'utf8');
const regel = (id: string): string =>
  lees('docs/framework.md')
    .split('\n')
    .find((r) => r.startsWith(`- **${id}** `)) ?? '';

describe('inloggat-dichten: regelboek en spec eigen-account volgen het gebouwde gedrag', () => {
  test('R-AUTH-06 noemt geen bekend gat meer en wel het eenmalig gebruik', () => {
    const tekst = regel('R-AUTH-06');
    expect(tekst).toMatch(/werken één keer \(`app\.claim_one_time_use`\)/);
    expectAbsent(tekst, /bekend gat/i, { recognizes: ['Bekend gat', 'bekend gat'] });
  });

  test('eigen-account: link 1 nogmaals geopend geeft EMAIL_LINK_INVALID; geen herzending van mail 2', () => {
    const spec = lees('docs/specs/eigen-account.md');
    const rij = spec.split('\n').find((r) => r.startsWith('| Link 1 nogmaals geopend')) ?? '';
    expect(rij).toMatch(/`EMAIL_LINK_INVALID` \|$/);
    expectAbsent(spec, /stuurt mail 2 opnieuw|mail 2 gaat opnieuw weg/, {
      recognizes: ['Link 1 opnieuw openen stuurt mail 2 opnieuw', 'mail 2 gaat opnieuw weg'],
    });
  });

  test('eigen-account: het token-lek is geen aparte core-taak meer', () => {
    const spec = lees('docs/specs/eigen-account.md');
    expect(spec).toMatch(/\*\*Sessietoken in JSON:\*\* `authGateway\.handler` haalt elke `token`/);
    expectAbsent(spec, /Aparte core-taak|het token-lek bij inloggen/, {
      recognizes: ['**Aparte core-taak (buiten deze spec):**', 'het token-lek bij inloggen (core-taak hierboven)'],
    });
  });
});
