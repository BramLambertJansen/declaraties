// De statusregel van Claude Code (framework §8): branch, achterstand op main, gewijzigde bestanden, de lokale stack en het
// model. Puur; rails/hooks/statusregel.mjs verzamelt de feiten zonder netwerk.

/** Poorten zoals scripts/doctor.sh ze leest: uit .env.local (`NAAM=<cijfers>`, laatste wint), anders de standaard. */
const STACK = [
  { naam: 'Postgres', sleutel: 'PG_PORT', standaard: 54322 },
  { naam: 'Mailpit', sleutel: 'MAIL_UI_PORT', standaard: 54324 },
  { naam: 'API', sleutel: 'API_PORT', standaard: 8787 },
  { naam: 'Web', sleutel: 'WEB_PORT', standaard: 5173 },
];

/**
 * @param {string | null} envLocal de inhoud van .env.local, of null
 * @returns {{ naam: string, poort: number }[]}
 */
export function poorten(envLocal) {
  const regels = (envLocal ?? '').split('\n');
  return STACK.map(({ naam, sleutel, standaard }) => {
    const waarden = regels.flatMap((regel) => {
      const gevonden = new RegExp(`^${sleutel}=([0-9]+)$`).exec(regel.trimEnd());
      return gevonden?.[1] === undefined ? [] : [Number(gevonden[1])];
    });
    return { naam, poort: waarden.at(-1) ?? standaard };
  });
}

/**
 * @param {{ branch: string, achter: number | null, gewijzigd: number, uit: readonly string[], model?: string }} feiten
 * @returns {string}
 */
export function statusregel({ branch, achter, gewijzigd, uit, model }) {
  return [
    branch,
    achter !== null && achter > 0 ? `${String(achter)} achter main` : '',
    gewijzigd > 0 ? `${String(gewijzigd)} gewijzigd` : '',
    uit.length === 0 ? 'stack ✓' : `stack ✗ (${uit.join(', ')})`,
    model ?? '',
  ]
    .filter((deel) => deel !== '')
    .join(' · ');
}
