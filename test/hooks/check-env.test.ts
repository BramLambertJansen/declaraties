import { expect, test } from 'vitest';
import { checkEnv } from '../../rails/hooks/lib/check-env.mjs';

// ADR 0033: het anker is voor de hooks zelf en komt niet in de omgeving van de checks die de werkstraat-hook start.
test('RAILS_ANKER verdwijnt uit de omgeving van de checks, de rest blijft', () => {
  const env = checkEnv({ PATH: '/bin', RAILS_ANKER: 'abc' }, undefined);

  expect(env).toStrictEqual({ PATH: '/bin' });
});

test('extra variabelen van de aanroeper winnen en kunnen RAILS_ANKER niet terugbrengen via de basis', () => {
  const env = checkEnv({ RAILS_ANKER: 'abc', A: '1' }, { A: '2', B: '3' });

  expect(env).toStrictEqual({ A: '2', B: '3' });
});
