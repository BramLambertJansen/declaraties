# 0029 — Snellere beslisroute: één PR per besluit, ADR-drempel en mini-spec

Status: voorgesteld

Wijzigt [0027](0027-taakmandaat-voor-frameworkwerk.md) punt 2 en vult [0025](0025-werkstraat-tot-de-merge.md) punt 1 en 10 aan.

## Context

Een besluit kost nu 2–3 PR's: voorstel, status (`pnpm docs:decision` + `pnpm docs:status`, ADR 0027), soms een registerfix.
Gemeten met `gh pr list`: ADR 0025 #99 → #101 (2 PR's, 1u53m), ADR 0026 #115 → #116 (2, 2u03m), ADR 0028 #131 → #133 + #134
(3, 3u17m). Een statuswijziging zelf is snel (#126: 4m42s); de wachttijd zit in het aantal ronden. Van de laatste 40 gemergde
PR's (#93–#134, 11–13 okt) leveren er ~5 productfunctionaliteit (#93, #117, #128, #129, #111); de rest is docs, hooks, rails en
scripts. Meta-ADR's 0023, 0025, 0027 en 0028 hadden deels een frameworkregel kunnen zijn. De spec-plicht (framework §8 stap 1)
eist het volledige sjabloon bij elke migratie, route of permissie.

Wat het register wel en niet bewijst: `canRecordStatus` (`.claude/hooks/lib/task-authority.mjs:86`) accepteert een
statusovergang alleen met een record op main met dezelfde digest én het document al op main (`currentDecision`, :78).
Daarom faalt een status die de eigenaar in de voorstel-PR zelf zet nu in `check-document-status.mjs` (`verifyDocument`).
Het echte vertrouwensanker is in beide routes dezelfde: de merge door de eigenaar (ADR 0027, "Vertrouwensgrens"). De agent
pusht onder het account van de eigenaar, dus geen PR-artefact (auteur, committer, web-flow-handtekening) onderscheidt eigenaar
van agent; ook de contents-API van `gh` maakt een web-flow-commit. De tweede PR voegt dus geen verifieerbare kracht toe,
alleen een ronde. Het register heeft wél eigen waarde voor het broncodemandaat (`canWriteProtected`: paden + bouwbranch).

## Besluit

1. **Eén PR per besluit; de merge is het besluit.** De architect levert spec of ADR als `voorstel`/`voorgesteld`. De eigenaar
   zet de statusregel in dezelfde PR (GitHub-webeditor) en merget. Geldt voor `goedgekeurd`, `geaccepteerd`, `vervallen` en
   `vervangen door NNNN`. De agent zet die regel nooit (AGENTS.md, ADR 0025 punt 10 blijven gelden). `gebouwd` blijft bij
   `pnpm docs:status --pr` met bouwbewijs (ADR 0027 punt 4).
2. **Register alleen voor broncodemandaat.** Een spec die beschermde bronbestanden nodig heeft, krijgt zijn
   `pnpm docs:decision`-record in díe PR; na de merge staan document en record samen op main en is het mandaat actief. Een ADR
   of spec zonder `--path` krijgt geen record: de status op main is zelf het bewijs (eerste tak van `canRecordStatus`).
3. **Wat de guard controleert** (minimale wijziging in `verifyDocument`, als `canRecordStatus` faalt en de overgang van
   `voorstel`/`voorgesteld` of een nieuw bestand naar een eigenaarstatus gaat): (a) de commit die de statusregel zette wijzigt
   alleen statusregels (`statusOnlyDiff(parent, commit)`); (b) de digest op HEAD is gelijk aan die op die commit, dus geen
   inhoud na de status; (c) de committer is GitHub web-flow. (c) is frictie tegen een per ongeluk gepushte status, géén
   identiteitsbewijs. De uitslag meldt "statusovergang in de PR; bevoegdheid is de merge door de eigenaar (overgang, ADR 0017)".
   Niet verifieerbaar: wíe de regel zette en of de eigenaar las. Tot deze wijziging op main staat, geldt de route van ADR 0027.
4. **Drempel voor een ADR.** Een ADR is nodig als minstens één geldt; de ADR noemt welke: **A1** raakt twee of meer zones
   (`src/core`, `src/web`, `src/api`, `db/`, `.github/`, `.claude/`) of het contract daartussen; **A2** moeilijk terug te draaien:
   migratie op bestaande rijen, rollen/RLS-model, auth of identiteit, provider of nieuwe dependency; **A3** verruimt rechten van
   agent of rol, of zwakt een check, hook of gate af; **A4** wijzigt of vervangt een geaccepteerde ADR. Anders: een regel in
   `docs/framework.md` of `docs/` met PR-nummer, via de gewone gate-PR met eigenaarreview. Een strengere check is geen ADR.
5. **Mini-spec** voor een route of permissie zonder migratie: koppen Doel, Rollen en wie wat ziet, Routes en foutcodes,
   Acceptatiecriteria (randgevallen als criterium), Hergebruik en UX (verplicht niet-leeg vanaf `goedgekeurd`, `check-docs.mjs:184`;
   zonder UI "n.v.t. — reden"). Frontmatter gelijk (`status`, `namespace`, `model`). Volledig sjabloon blijft verplicht zodra
   `db/`, RLS, grants, `security definer` of `src/core` geraakt wordt. `check-docs` hoeft hiervoor niet te wijzigen: het eist nu
   alleen woordenlijst en "Hergebruik en UX"; de overige koppen zijn proza (`_template.md`).
6. **Meten.** Per besluit: aantal PR's dat het document of zijn record raakt tot de eindstatus op main, en doorlooptijd van
   `createdAt` eerste PR tot `mergedAt` laatste, via `gh pr list --state merged --json number,createdAt,mergedAt,files`.
   Basislijn mediaan: 2 PR's, 2u03m. **Herzien** na de eerste 5 besluiten als de mediaan > 1 PR is of de doorlooptijd niet onder
   de basislijn ligt; direct bij één status op main zonder statuscommit van de eigenaar in de PR.

## Alternatieven

- **Agent levert direct met `geaccepteerd`, merge = akkoord**: verworpen; botst met AGENTS.md en ADR 0025 punt 10, en een
  `voorgesteld` document kan dan niet meer bewust geparkeerd op main staan (zoals 0023).
- **Register-PR houden, sneller mergen**: verworpen; het aantal ronden blijft, zonder extra bewijs.
- **Status uit het register laten afleiden (geen statusregel)**: verworpen; groter dan nodig, raakt hooks, generator en feiten.
- **Volledig sjabloon houden met "n.v.t."**: verworpen; de kosten zitten in het schrijven en lezen, niet in de check.

## Gevolgen

Na invoering: één PR per besluit, minder meta-ADR's; de zwakte blijft gelijk (merge-afspraak, `overgang`). Wijzigingen in
andere bestanden (beschermd; elk in de bouw-PR van deze ADR, met eigenaarakkoord):
- `scripts/kit/check-document-status.mjs` — tak uit punt 3, met tests in `test/rails/`.
- `docs/operations/agent-doorloop.md` — "Besluit en taakscope voorbereiden" naar de route uit punt 1–2.
- `docs/framework.md` regel 4 ("Wijzigen alleen via een PR met ADR") naar de drempel uit punt 4; §8 stap 1 en §10 (mini-spec).
- `AGENTS.md` Werkafspraken (spec-sjabloon noemt de mini-spec); `docs/specs/_mini.md` nieuw.
- `docs/roadmap.md` — de controle uit punt 3 als deel van `check-spec-approval`.
- ADR 0027 en 0025: alleen een verwijsregel "Gewijzigd door 0029".

## Niet beslist

- **GitHub App (ST-01, W-3 geparkeerd 2026-10-12)** opnieuw wegen als structurele oplossing: de agent pusht onder het account
  van de eigenaar, die eigen PR's niet formeel kan goedkeuren (diff-guard `overgang`). Pas met een App wordt punt 3 een
  identiteitsbewijs. Geen token-, App- of credentialwerk in deze ADR.
- Open voor de eigenaar: (c) als harde voorwaarde of alleen melding; `_mini.md` als apart bestand of frontmatter-veld;
  of 0023 (voorgesteld) een frameworkregel wordt; drempelwaarden uit punt 6.
