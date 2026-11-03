// Minimale Claude Code-versie (ADR 0045 punt 3, spec rolhek-dicht AC-3): vanaf 2.1.295 bestaat `onFailure: "block"`, waarmee het
// rolhek dichtvalt bij crash, timeout of ongeldige uitvoer. Dezelfde grens staat in `scripts/doctor.sh` (een test bewaakt dat).
export const MIN_CLAUDE_VERSIE = '2.1.295';

const DICHT = `het rolhek valt pas vanaf ${MIN_CLAUDE_VERSIE} dicht bij storing`;
const OPLOSSING = '  → werk Claude Code bij';

/** @param {string} versie @returns {number[]} */
const delen = (versie) => versie.split('.').map(Number);

/** -1, 0 of 1 voor a tegenover b, numeriek per deel. @param {string} a @param {string} b */
function vergelijk(a, b) {
  const [x, y] = [delen(a), delen(b)];
  for (let i = 0; i < 3; i += 1) {
    const verschil = (x[i] ?? 0) - (y[i] ?? 0);
    if (verschil !== 0) return Math.sign(verschil);
  }
  return 0;
}

/**
 * Meldregels bij een te oude of onleesbare versie; leeg als de versie volstaat of `claude` ontbreekt (null of lege uitvoer).
 * @param {string | null} uitvoer stdout van `claude --version`, bijvoorbeeld `2.1.317 (Claude Code)`
 * @returns {string[]}
 */
export function claudeVersieMelding(uitvoer) {
  const tekst = (uitvoer ?? '').trim();
  if (tekst === '') return [];
  const versie = /^(\d+\.\d+\.\d+)/.exec(tekst)?.[1];
  if (versie === undefined) return [`✗ Claude Code-versie onleesbaar: ${DICHT}`, OPLOSSING];
  return vergelijk(versie, MIN_CLAUDE_VERSIE) < 0 ? [`✗ Claude Code ${versie} is te oud: ${DICHT}`, OPLOSSING] : [];
}
