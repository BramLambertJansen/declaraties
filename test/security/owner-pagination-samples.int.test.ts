import { expect, test } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { eigenaarApiProblemen } from './controles.ts';
import { openEigenaarProbe } from './probe-eigenaar.ts';
import type { ResourceRegel } from './resources.ts';

test('security/AC-13: een ontbrekend tweede sample maakt de echte eigenaarschapssuite rood', async () => {
  const probe = await openEigenaarProbe();
  try {
    const setup = probe.opzet();
    const rule = setup.resources['security_probes'];
    if (rule === undefined) throw new Error('Probe-resource ontbreekt');
    const broken = unsafeCast<ResourceRegel>(
      { ...rule, sample: { create: rule.sample.create } },
      'Mutante fixture verwijdert het verplichte tweede pagineringssample',
    );
    const problems = await eigenaarApiProblemen({ ...setup, resources: { security_probes: broken } });
    expect(problems.some((problem) => problem.includes('createTweede'))).toBe(true);
  } finally {
    await probe.sluit();
  }
});
