import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// Gebouwde specs bijgewerkt voor het wachten op een lopende Codex-review (spec agent-merge-codex-wachten AC-6). Structuurtests
// op sleutelwoorden, geen hele zinnen.
const lees = (pad: string): string => readFileSync(pad, 'utf8');
const blok = (tekst: string, begin: string, einde: string): string => {
  const start = tekst.indexOf(begin);
  expect(start).toBeGreaterThanOrEqual(0);
  const stop = tekst.indexOf(einde, start + begin.length);
  return tekst.slice(start, stop === -1 ? undefined : stop);
};
const LINK = /\(agent-merge-codex-wachten\.md\)/;

describe('agent-merge-codex-wachten/AC-6 gebouwde spec agent-merge-zonder-codex', () => {
  const spec = lees('docs/specs/agent-merge-zonder-codex.md');
  const ac4 = blok(spec, '- **agent-merge-zonder-codex/AC-4**', '\n- **');

  test('agent-merge-codex-wachten/AC-6 status gebouwd met een nieuwere PR dan #464', () => {
    expect(spec).toMatch(/^status: gebouwd # #\d+$/m);
    expectAbsent(spec, /^status: gebouwd # #464$/m, { recognizes: ['status: gebouwd # #464'] });
  });

  test('agent-merge-codex-wachten/AC-6 AC-4: 👀 en bezig zijn een spoor met wachtreden', () => {
    const geenSpoor = blok(ac4, 'Geen spoor zijn:', '.');
    expectAbsent(geenSpoor, /leeg, bezig|reactie `eyes`/, { recognizes: ['leeg, bezig', 'een reactie `eyes`'] });
    expect(ac4).toMatch(/alleen 👀 → wachtreden/);
    expectAbsent(ac4, /alleen 👀 → geen Codex-reden/, { recognizes: ['alleen 👀 → geen Codex-reden'] });
    expect(ac4).toMatch(LINK);
  });

  test('agent-merge-codex-wachten/AC-6 randgeval, "Wat Codex achterlaat" en OV-1 dragen het besluit', () => {
    const rij = spec.split('\n').find((r) => r.startsWith('| Codex gaf 👀 en daarna niets')) ?? '';
    expect(rij).toMatch(/spoor: geen merge met wachtreden; een hangende 👀 faalt dicht, de eigenaar merget/);
    const achterlaat = blok(spec, '## Wat Codex achterlaat', '\n## ');
    expect(achterlaat).toMatch(LINK);
    expectAbsent(achterlaat, /dat een 👀 geen spoor is/, { recognizes: ['dat een 👀 geen spoor is'] });
    expect(spec).toMatch(/^- \*\*OV-1 ✅ besloten: \(a\)\*\*/m);
  });
});

describe('agent-merge-codex-wachten/AC-6 gebouwde spec agent-merge-niet-kritiek', () => {
  const spec = lees('docs/specs/agent-merge-niet-kritiek.md');
  const ac3 = blok(spec, '- **agent-merge-niet-kritiek/AC-3**', '\n- **');

  test('agent-merge-codex-wachten/AC-6 AC-3: een 👀 of lopende review geeft de wachtreden', () => {
    expect(spec).toMatch(/^status: gebouwd # #\d+$/m);
    expectAbsent(spec, /^status: gebouwd # #464$/m, { recognizes: ['status: gebouwd # #464'] });
    expect(ac3).toMatch(/spoor van Codex: een afgeronde review of een die nog bezig is/);
    expect(ac3).toMatch(/een 👀 van die bot of een lopende review geeft de wachtreden/);
    expect(ac3).toMatch(LINK);
  });
});

describe('agent-merge-codex-wachten/AC-6 deze spec en de doc-commentaren', () => {
  test('agent-merge-codex-wachten/AC-6 de spec is gebouwd', () => {
    expect(lees('docs/specs/agent-merge-codex-wachten.md')).toMatch(/^status: gebouwd # #\d+$/m);
  });

  // Regressiewacht: de doc-commentaren veranderden al in #476 (AC-6, bouw-PR); deze test bewaakt dat ze zo blijven.
  test('agent-merge-codex-wachten/AC-6 pr-merge.mjs zegt niet meer dat een 👀 niet telt', () => {
    const script = lees('scripts/kit/pr-merge.mjs');
    expectAbsent(script, /👀 of een lopende review telt niet|een 👀[^.]*tellen niet/, {
      recognizes: ['👀 of een lopende review telt niet', 'een 👀 … tellen niet'],
    });
    expect(script).toMatch(/CODEX_LOOPT/);
  });
});
