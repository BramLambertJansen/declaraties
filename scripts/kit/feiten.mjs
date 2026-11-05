// Live feiten (framework §8, ADR 0045): elke rol begint hiermee, niet met wat in proza staat.
// Gebruik: node scripts/kit/feiten.mjs [gates|adr|specs|migraties|routes|permissies|foutcodes|koppelingen|componenten|tokens|fase] [--alle] [--json]
//          node scripts/kit/feiten.mjs hoofdstuk <n>: de tekst vóór de eerste `## `-kop van docs/framework.md plus
//          hoofdstuk <n> (bij 8 ook 8a, 8b…; zoals `pnpm leespad` telt); onbekend: foutmelding en exit 1 (ADR 0065).
//          node scripts/kit/feiten.mjs pad <pad>: schrijfniveau en besluit uit de padtabel, met de globs die ze leveren (ADR 0079).
// Zonder sectie alles; elke rol vraagt in stap 1 van zijn agentbestand alleen wat hij nodig heeft (.claude/agents/*.md).
// `specs`, `adr` en `fase` tonen standaard een begrensde lijst met een telregel; `--alle` toont alles (meting-stuurt/AC-5).
// De secties staan in feiten-secties.mjs, weergave en filters in feiten-tekst.mjs; dit bestand is alleen de CLI.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toolchainProbleemIn } from './toolchain.mjs';

// Eerst de bewaking (leerpunt #462): ook een verse cloudsessie die op de toolchain faalt, hoort dat hooks of sandbox ontbreken.
// Alleen in Claude Code (AC-1); daarbuiten wordt bewaking.mjs niet eens geladen.
if (process.env['CLAUDECODE'] === '1')
  try {
    const { bewakingMeldingIn } = await import('./bewaking.mjs');
    const melding = bewakingMeldingIn(fileURLToPath(new URL('../..', import.meta.url)), process.env, Date.now());
    if (melding !== null) console.error(melding);
  } catch (fout) {
    console.error(`⚠ bewaking niet te controleren: ${fout instanceof Error ? fout.message : String(fout)}`);
  }

// Eerst de toolchain: catalogus.mjs laadt typescript, dus zonder node_modules anders een stacktrace (docs/ENVIRONMENT.md).
const probleem = toolchainProbleemIn(fileURLToPath(new URL('../..', import.meta.url)));
if (probleem !== null) {
  console.error(probleem);
  process.exit(1);
}

/** Drukt een hoofdstuk van het regelboek af (leesbudget/AC-4) en stopt. @param {string | undefined} n */
async function hoofdstuk(n) {
  const { hoofdstukTekst } = await import('./leespad.mjs');
  const boek = existsSync('docs/framework.md') ? readFileSync('docs/framework.md', 'utf8') : null;
  const tekst = boek === null || n === undefined ? null : hoofdstukTekst(boek, n);
  if (tekst === null) {
    console.error(
      `Onbekend hoofdstuk: ${n ?? '(geen)'}. Gebruik: node scripts/kit/feiten.mjs hoofdstuk <n>, met <n> een \`## <n>.\`-kop van docs/framework.md`,
    );
    process.exit(1);
  }
  await new Promise((klaar) => process.stdout.write(tekst, klaar));
  process.exit(0);
}

if (process.argv[2] === 'hoofdstuk') await hoofdstuk(process.argv[3]);

/** Drukt het niveau van één pad uit de padtabel af (ADR 0079 punt 7, spec padtabel AC-13) en stopt. @param {string | undefined} rel */
async function padRegel(rel) {
  if (rel === undefined || rel === '') {
    console.error('Gebruik: node scripts/kit/feiten.mjs pad <pad>');
    process.exit(1);
  }
  const { padNiveau } = await import('../../rails/hooks/lib/padtabel.mjs');
  /** @type {ReturnType<typeof padNiveau>} */
  let niveau;
  try {
    niveau = padNiveau(rel, JSON.parse(readFileSync('.claude/gates.json', 'utf8')));
  } catch (fout) {
    console.error(`.claude/gates.json: ${fout instanceof Error ? fout.message : String(fout)}`);
    process.exit(1);
  }
  const regel = `${rel}: schrijven ${niveau.schrijven} (${niveau.bronnen.schrijven.join(', ')}), besluit ${niveau.besluit} (${niveau.bronnen.besluit.join(', ')})\n`;
  await new Promise((klaar) => process.stdout.write(regel, klaar));
  process.exit(0);
}

if (process.argv[2] === 'pad') await padRegel(process.argv[3]);

const { toText } = await import('./feiten-tekst.mjs');
const { codeSecties, gereserveerdeAdrNummers, lezerSecties, plain, VOLGORDE, werkmap } =
  await import('./feiten-secties.mjs');

const args = process.argv.slice(2);
const alle = args.includes('--alle');
const uitLezer = (/** @type {readonly string[]} */ gereserveerd) => lezerSecties(werkmap, { alle, gereserveerd });

/** @type {Record<string, () => Promise<import('./feiten-secties.mjs').Result> | import('./feiten-secties.mjs').Result>} */
const sections = {
  ...codeSecties,
  adr: plain(async () => uitLezer(await gereserveerdeAdrNummers()).adr()),
  specs: plain(() => uitLezer([]).specs()),
  fase: plain(() => uitLezer([]).fase()),
};

const wanted = args.filter((arg) => !arg.startsWith('--'));
const unknown = wanted.filter((name) => !(name in sections));
if (unknown.length > 0) {
  console.error(`Onbekende sectie: ${unknown.join(', ')}. Kies uit: ${VOLGORDE.join(', ')}`);
  process.exit(2);
}
const names = wanted.length > 0 ? wanted : VOLGORDE;
const results = await Promise.all(names.map(async (naam) => ({ naam, ...(await sections[naam]?.()) })));
if (args.includes('--json')) {
  console.info(JSON.stringify(Object.fromEntries(results.map(({ naam, json }) => [naam, json])), null, 2));
} else {
  console.info(
    toText(results.map(({ naam, kop, inhoud }) => ({ naam, ...(kop === undefined ? {} : { kop }), inhoud }))),
  );
}
