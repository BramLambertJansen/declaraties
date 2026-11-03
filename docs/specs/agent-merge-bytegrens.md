---
status: gebouwd # #482; gevalideerd: 188e95836b7cc79aa316a1a35fdc136cc3a5f9e8
namespace: agent-merge-bytegrens
sjabloon: mini
---

# Bytegrens naast de regelgrens voor agent-merge

## Doel

Een agent-merge vraagt naast hoogstens `agentMerge.maxRegels` regels ook hoogstens `agentMerge.maxBytes` gewijzigde bytes,
zodat een PR met weinig maar zeer lange regels (een geminificeerd bestand, één regel van 50 kB) de omvanggrens niet omzeilt
([ADR 0069](../adr/0069-agent-merge-niet-kritiek.md) punt 3, herzien). Aanleiding: restpunt van bevinding P2 van de review
van 3 november 2026.

## Rollen en wie wat ziet

n.v.t. — tooling voor de hoofdsessie (`pnpm pr:merge`) en de diff-guard in CI; geen app-gebruikers.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/agent-merge.mjs` — `leesAgentMerge()`, `omvangRedenen()` en `teGroot()` voor de regelgrens; de bytegrens volgt
  dezelfde vorm
- `scripts/kit/pr-merge.mjs` — `omvangRedenen()` op het REST-antwoord van `pulls/<nr>/files`

## Acceptatiecriteria

- **agent-merge-bytegrens/AC-1** — `leesAgentMerge()` leest `maxBytes` als geheel getal ≥ 1; ontbreekt het of is het
  ongeldig (`0`, `-1`, `40000.5`, `"40000"`, `null`), dan is het resultaat `null` (geen agent-merge), net als bij `maxRegels`.
  `agentMergeFouten()` geeft bij een ongeldige `maxBytes` de nieuwe melding uit "Hergebruik en UX", bij een ongeldige
  `maxRegels` de bestaande. `.claude/gates.json` krijgt `"maxBytes": 40000`; `check-docs` controleert de vorm op het ruwe
  blok, zoals bij `maxRegels`. Een app zonder `maxBytes` valt dicht: geen agent-merge, de diff-guard geeft
  `AGENT_MERGE_ONLEESBAAR`, `check-docs` is rood; de CHANGELOG noemt dat voor apps. Tabeltest met elk van die waarden.
- **agent-merge-bytegrens/AC-2** — Eén gedeelde functie `patchBytes(tekst)` in `scripts/kit/agent-merge.mjs` telt de bytes
  van een hunk-tekst: splits op `\n`; elke regel die met `+` of `-` begint telt met de UTF-8-bytes ná dat eerste teken,
  inclusief een eventuele `\r`; `\ No newline at end of file`, `@@`-regels en contextregels tellen niet. Een toegevoegde
  regel `++x`, een verwijderde `---` en een verwijderde `-- sql` tellen dus volledig mee. Tabeltest: 40.000 en 40.001 bytes,
  één regel van 40.001 bytes, `é` (2 bytes), CRLF, `\ No newline`, `++x`, `---` en `-- sql`.
- **agent-merge-bytegrens/AC-3** — De diff-guard (`leesPr()`) leest `git diff -U0 --no-color --no-ext-diff --no-textconv
  --find-renames <merge-base> <head>` als Buffer op dezelfde merge-base, slaat per bestand de kopregels over (van
  `diff --git` tot de eerste `@@`) en telt de rest met `patchBytes()`. Te grote of onleesbare uitvoer (ook ENOBUFS) maakt
  `bytes` ongedefinieerd: oordeel `nee` met de onleesbaar-melding, nooit een crash van de diff-guard. `agentMergeOordeel()`
  geeft `nee` als `bytes > maxBytes` of als `bytes` ontbreekt of geen geheel getal ≥ 0 is; `bytes === maxBytes` mag. Test
  met een kleine `maxBuffer` en met een zuivere hernoeming (0 bytes).
- **agent-merge-bytegrens/AC-4** — `pr:merge` telt per bestand met `patchBytes()` op het veld `patch` van
  `pulls/<nr>/files` (REST heeft geen kopregels). Het telt per bestand ook de `+`- en `-`-regels en vergelijkt die met
  `additions` en `deletions` van dat bestand, en de som met `additions + deletions` van `pulls/<nr>`; wijkt iets af
  (afgekapte patch), dan weigert het met de onleesbaar-melding. Een bestand zonder `patch` blijft geweigerd zoals nu. De
  telling in CI en in `pr:merge` hoeven niet gelijk te zijn (git en GitHub kunnen hernoemingen en hunks anders zien); elk
  valt op zichzelf dicht. Unittest met nagebootste REST-antwoorden: 40.000 en 40.001 bytes, één lange regel, een afgekapte
  patch en de gevallen uit AC-2.
- **agent-merge-bytegrens/AC-5** — Docs mee: R-REPO-01 in `docs/framework.md` ("omvanggrens `agentMerge`", zonder
  sleutelnamen, zodat het regelboek netto niet groeit; bytes vóór en na in de PR), de `$comment` in `.claude/gates.json`, de
  kopcommentaren van `agent-merge.mjs` en `diff-guard.mjs`. `docs/operations/agent-doorloop.md` en de skill `opleveren`
  noemen de omvanggrens nu niet en krijgen geen nieuwe tekst.

## Raakt ook

Bestaande tests die met de nieuwe sleutel wijzigen (R-TEST-02, reden: `agentMerge` krijgt een verplicht veld):
`test/rails/agent-merge-zonder-codex.test.ts` (verwacht object zonder `maxBytes`), de gates-fixtures in
`test/scripts/pr-merge.test.ts` en de verwachte redenlijsten in `test/scripts/pr-merge-zonder-codex.test.ts`. Ze krijgen
`maxBytes` erbij; geen assertie wordt zwakker.

## Hergebruik en UX

n.v.t. — geen UI. Letterlijke nieuwe meldingen:

- `PR te groot voor een agent-merge: <n> bytes gewijzigd, grens <maxBytes> (agentMerge.maxBytes)`
- `omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge`

## Open vragen

- **OV-1** — Welke grens? Opties: 40.000 bytes, een grens per regel (bijv. 300 tekens), of beide. Aanbeveling: 40.000 bytes
  totaal, geen grens per regel. Gemeten over de laatste 80 merges naar `main` (`src/`, `docs/`, `CHANGELOG.md`; een
  deelmeting over alle paden in 50 merges gaf hetzelfde maximum): de grootste PR onder 400 regels wijzigde 30,9 kB, een
  marge van ongeveer 29 %. Legitieme docs- en tabelregels lopen tot 2,2 kB, dus een grens per regel zou gewoon werk weigeren.
  Bij docs-zware PR's (tot 290 B per regel) is de bytegrens de bindende grens, ongeveer 140 regels; dat is bedoeld, want de
  reviewer moet de hele diff kunnen overzien.
