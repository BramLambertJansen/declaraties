import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { integrationTraitCatalog } from '../../src/core/api/integrations/index.ts';

// Spec koppeling-agentlaag, AC-7 t/m AC-13: tekstchecks op de skill `nieuwe-koppeling`, de paragraaf "Koppeling" in het
// spec-template, het hoofdstuk in het gouden pad en de afsluitchecks van architect en reviewer. AC-8 leest de catalogus
// uit core, zodat een bouw-PR die een waarde bouwt ook de stopregel weghaalt (en omgekeerd).

const SKILL = '.claude/skills/nieuwe-koppeling/SKILL.md';
const lees = (pad: string): string => (existsSync(pad) ? readFileSync(pad, 'utf8') : '');
const skill = lees(SKILL);
const sjabloon = lees('docs/specs/_template.md');
const specSjabloon = lees('scripts/kit/templates/spec.md.tmpl');
const goudenPad = lees('docs/gouden-pad.md');

const SPECS = [
  'koppelingsregister',
  'uitgaande-client',
  'geheimen-in-env',
  'netwerk-en-geheim-rails',
  'partnerstap',
  'koppelingsvorm',
];

// Bewust lokaal: testbestanden importeren niets van elkaar, dus dezelfde korte parser als in agents.test.ts.
function frontmatter(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? '', match[2] ?? '']),
  );
}

function koppen(tekst: string): string[] {
  return [...tekst.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1] ?? '');
}

// De tekst van een `## `-sectie tot de volgende `## `-kop; leeg als de kop ontbreekt.
function sectie(tekst: string, kop: string): string {
  const start = new RegExp(`^## ${kop}\\s*$`, 'm').exec(tekst);
  if (start === null) return '';
  const rest = tekst.slice(start.index + start[0].length);
  const einde = /^## /m.exec(rest);
  return einde === null ? rest : rest.slice(0, einde.index);
}

// Regels met het woord "stop" (ook "Stop", niet "Stoppen").
const stopregels = skill.split('\n').filter((regel) => /\bstop\b/i.test(regel));
const catalogus = integrationTraitCatalog();
const waarden = (built: boolean): string[] =>
  catalogus.flatMap((info) => info.values.filter((item) => item.built === built).map(({ value }) => value));

describe('koppeling-agentlaag/AC-7: frontmatter en feiten-injectie van de skill', () => {
  test('koppeling-agentlaag/AC-7: de skill bestaat met name, description en allowed-tools Bash(node scripts/kit/feiten.mjs *)', () => {
    const meta = frontmatter(skill);

    expect(meta['name']).toBe('nieuwe-koppeling');
    expect(meta['description']).toMatch(/\S/);
    expect(meta['allowed-tools']).toBe('Bash(node scripts/kit/feiten.mjs *)');
  });

  test('koppeling-agentlaag/AC-7: een !-injectie van feiten.mjs met de sectie koppelingen', () => {
    const injecties = [...skill.matchAll(/!`node scripts\/kit\/feiten\.mjs ([^`]*)`/g)].map((match) =>
      (match[1] ?? '').split(/\s+/),
    );

    expect(injecties.some((args) => args.includes('koppelingen'))).toBe(true);
  });

  test('koppeling-agentlaag/AC-7: de skill is hoogstens 120 regels', () => {
    expect(skill.length).toBeGreaterThan(0);
    expect(skill.trimEnd().split('\n').length).toBeLessThanOrEqual(120);
  });
});

describe('koppeling-agentlaag/AC-8: stopregels volgen de catalogus', () => {
  test('koppeling-agentlaag/AC-8: de catalogus heeft waarden met en zonder bouwsteen', () => {
    expect(waarden(false).length).toBeGreaterThan(0);
    expect(waarden(true).length).toBeGreaterThan(0);
  });

  test.each(waarden(false))('koppeling-agentlaag/AC-8: `%s` (built: false) staat op een stopregel', (value) => {
    expect(stopregels.filter((regel) => regel.includes(`\`${value}\``))).not.toHaveLength(0);
  });

  test.each(waarden(true))('koppeling-agentlaag/AC-8: `%s` (built: true) staat op geen stopregel', (value) => {
    expect(stopregels.filter((regel) => regel.includes(`\`${value}\``))).toStrictEqual([]);
  });
});

describe('koppeling-agentlaag/AC-9: links naar de zes specs en het schakelscript', () => {
  test.each(SPECS)('koppeling-agentlaag/AC-9: de skill linkt naar docs/specs/%s.md, en het doel bestaat', (spec) => {
    const links = [...skill.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? '');
    const naarSpec = links.filter((link) => link.endsWith(`docs/specs/${spec}.md`));

    expect(naarSpec).not.toHaveLength(0);
    for (const link of naarSpec) expect(existsSync(path.join(path.dirname(SKILL), link))).toBe(true);
  });

  test('koppeling-agentlaag/AC-9: de skill noemt pnpm integration:switch', () => {
    expect(skill).toContain('pnpm integration:switch');
  });
});

describe('koppeling-agentlaag/AC-10: geen URL in skill, template en gouden pad', () => {
  test.each([
    ['de skill', skill],
    ['de sectie "Koppeling" van _template.md', sectie(sjabloon, 'Koppeling')],
    [
      'het hoofdstuk "Koppeling met een externe dienst" in het gouden pad',
      sectie(goudenPad, 'Koppeling met een externe dienst'),
    ],
  ])('koppeling-agentlaag/AC-10: %s bevat geen http://, https:// of www.', (_label, tekst) => {
    expect(tekst.trim()).not.toBe('');
    for (const verboden of ['http://', 'https://', 'www.']) expect(tekst).not.toContain(verboden);
  });
});

describe('koppeling-agentlaag/AC-11: paragraaf "Koppeling" in het spec-template', () => {
  const koppeling = sectie(sjabloon, 'Koppeling');

  test('koppeling-agentlaag/AC-11: ## Koppeling staat direct na ## Routes en foutcodes', () => {
    const lijst = koppen(sjabloon);

    expect(lijst).toContain('Koppeling');
    expect(lijst.indexOf('Koppeling')).toBe(lijst.indexOf('Routes en foutcodes') + 1);
  });

  test('koppeling-agentlaag/AC-11: de zes kenmerknamen, "n.v.t." en "0100"', () => {
    for (const naam of ['machtiging', 'richting', 'ritme', 'gevoeligheid', 'kosten en quota', 'bron van waarheid']) {
      expect(koppeling.toLowerCase()).toContain(naam);
    }
    expect(koppeling).toContain('n.v.t.');
    expect(koppeling).toContain('0100');
  });

  test('koppeling-agentlaag/AC-11: een tabel met precies de zes kolommen per aanroep', () => {
    const kopregel = koppeling.split('\n').find((regel) => regel.trim().startsWith('| Methode'));
    const kolommen = (kopregel ?? '')
      .split('|')
      .map((cel) => cel.trim())
      .filter((cel) => cel !== '');

    expect(kolommen).toStrictEqual(['Methode', 'Padsjabloon', 'Time-out', 'Herhaalbaar', 'Schema', 'Foutcode']);
  });

  // OV-3: het skelet van `pnpm new:resource` volgt dezelfde koppen (new-resource-spec-vorm blijft groen).
  test('koppeling-agentlaag/AC-11: spec.md.tmpl heeft ## Koppeling direct na ## Routes en foutcodes, met "n.v.t. — geen externe dienst."', () => {
    const lijst = koppen(specSjabloon);

    expect(lijst.indexOf('Koppeling')).toBe(lijst.indexOf('Routes en foutcodes') + 1);
    expect(sectie(specSjabloon, 'Koppeling')).toContain('n.v.t. — geen externe dienst.');
  });
});

describe('koppeling-agentlaag/AC-12: hoofdstuk in het gouden pad', () => {
  const hoofdstuk = sectie(goudenPad, 'Koppeling met een externe dienst');

  test('koppeling-agentlaag/AC-12: ## Koppeling met een externe dienst bestaat en noemt de skill', () => {
    expect(koppen(goudenPad)).toContain('Koppeling met een externe dienst');
    expect(hoofdstuk).toContain('nieuwe-koppeling');
  });

  test.each(SPECS)('koppeling-agentlaag/AC-12: het hoofdstuk linkt naar de spec %s', (spec) => {
    expect(hoofdstuk).toMatch(new RegExp(`\\]\\((?:\\./)?specs/${spec}\\.md\\)`));
  });

  test('koppeling-agentlaag/AC-12: de zin "Het volledige hoofdstuk volgt" is weg', () => {
    expect(goudenPad.length).toBeGreaterThan(0);
    expect(goudenPad).not.toContain('Het volledige hoofdstuk volgt');
  });
});

describe('koppeling-agentlaag/AC-13: afsluitchecks van architect en reviewer', () => {
  test.each(['.claude/agents/architect.md', '.claude/agents/reviewer.md'])(
    'koppeling-agentlaag/AC-13: %s noemt nieuwe-koppeling en feiten.mjs koppelingen',
    (pad) => {
      const tekst = lees(pad);

      expect(tekst).toContain('nieuwe-koppeling');
      expect(tekst).toContain('feiten.mjs koppelingen');
    },
  );
});
