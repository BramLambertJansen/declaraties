// Meldingen op de PR (ADR 0070 punt 3, meting-stuurt/AC-3): is $GITHUB_STEP_SUMMARY gezet (in GitHub Actions), dan komt de
// tekst in de samenvatting van de CI-job, die op de PR staat; ook als de job rood is. Zonder die variabele doet het niets.
import { appendFileSync } from 'node:fs';

/** @param {string} titel @param {readonly string[]} regels */
export function naarSamenvatting(titel, regels) {
  const bestand = process.env['GITHUB_STEP_SUMMARY'];
  if (bestand === undefined || bestand === '' || regels.length === 0) return;
  appendFileSync(bestand, `### ${titel}\n\n\`\`\`text\n${regels.join('\n')}\n\`\`\`\n\n`);
}
