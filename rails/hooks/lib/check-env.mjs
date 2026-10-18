/**
 * De omgeving voor de checks die de werkstraat-hook start. Het anker (`RAILS_ANKER`) is voor de hooks zelf: vitest en scripts
 * zouden anders hun eigen vertrouwde basis door dat anker laten vervangen (ADR 0033).
 * @param {NodeJS.ProcessEnv} base
 * @param {Record<string, string> | undefined} extra
 * @returns {NodeJS.ProcessEnv}
 */
export function checkEnv(base, extra) {
  return { ...Object.fromEntries(Object.entries(base).filter(([naam]) => naam !== 'RAILS_ANKER')), ...extra };
}
