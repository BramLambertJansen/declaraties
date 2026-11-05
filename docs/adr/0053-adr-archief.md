# 0053 — Afgesloten ADR's naar `docs/adr/archief/`

Status: geaccepteerd

Herzien: 2026-10-30 (#385): de gevolgregel over mandaatrecords in `.claude/decisions.json` vervalt; de records gaan weg
([0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md)).

Drempel: A4 (de route uit [0046](0046-werkstraat-en-beslisroute.md) punt 2 en 5 voor ADR's met een eigenaarstatus) en A3 (een
guard laat een overgang toe die hij nu weigert).

## Context

Van de 53 ADR's in `docs/adr/` zijn er 39 `vervangen door NNNN` of `vervallen`: 284 van de 393 KB. De consolidatie (0039–0052)
heeft hun inhoud overgenomen, maar elke `grep`, elke lijst uit `feiten.mjs adr` en elke agent die "het ADR over X" zoekt, raakt
eerst de oude tekst. Aanleiding (framework §1): gemeten wrijving uit de eigenaarreview "template slanker en sneller". A4 verbiedt
nu elke verwijdering of rename van een ADR met eigenaarstatus op main (`verifyGeenAdrWeg` in `check-document-status`; het rolhek
via `beslisOvergang`).

## Besluit

1. **Verhuizen mag, wijzigen niet.** Een ADR dat op main `vervangen door NNNN` of `vervallen` heeft, mag verhuizen naar
   `docs/adr/archief/` onder dezelfde bestandsnaam, byte-gelijk (zelfde blob). Andere renames, een verhuizing van een
   `geaccepteerd` ADR, een terugverhuizing en een nieuw bestand in `archief/` dat geen verhuizing is, blijven geweigerd.
2. **A4 geldt ook in het archief.** Een gearchiveerd ADR is een ADR-document: tekst en status veranderen niet en het wordt niet
   verwijderd. De guard herkent `docs/adr/archief/NNNN-<slug>.md` als ADR, zodat elke inhoudswijziging daar `a4` geeft.
3. **Nummers lopen door.** Het volgende vrije nummer en de controle op dubbele nummers tellen `docs/adr/` en `archief/` samen;
   een nummer wordt nooit hergebruikt.
4. **Links blijven toetsbaar.** Omdat de tekst byte-gelijk blijft, wijzen relatieve links in en naar gearchiveerde ADR's niet
   meer naar het juiste pad, en geaccepteerde ADR's zoals 0046 mogen niet worden aangepast. `check-docs` lost een link naar
   `docs/adr/NNNN-*.md` op tegen `docs/adr/` of `archief/`, en een relatieve link vanuit `archief/` alsof het bestand nog in
   `docs/adr/` stond. Links buiten `docs/adr/` die wel mogen wijzigen, gaan in dezelfde PR naar het nieuwe pad.
5. **Lijsten tonen het actieve deel.** `feiten.mjs adr` toont standaard alleen `docs/adr/`; het archief telt mee voor nummers en
   voor `vervangen door NNNN`-verwijzingen.
6. **Volgorde.** De guard draait uit main, dus eerst een rail-PR (scripts, rolhek-lib en fixtures; framework-lane, met
   eigenaarreview), daarna één verhuis-PR met alleen `git mv` onder `docs/adr/` en de bijgewerkte links: een besluit-PR.

Aan te passen in de rail-PR: `rails/hooks/lib/document-state.mjs` (`documentKind`; `beslisOvergang` blijft ongewijzigd en geeft
`a4` op het archiefpad), `scripts/kit/check-document-status.mjs` (`verifyGeenAdrWeg`, `verifyDocument`, `verifyGeenRename`,
`adrFiles`), `scripts/kit/check-docs.mjs` (`linkViolations`, `duplicateAdrNumbers`, `statusViolations`),
`scripts/kit/feiten.mjs` (`markdownFiles`, `adrs`, `nextAdr`), `scripts/kit/check-roadmap.mjs` (`heeftAdr`) en de A4-tekst in
framework §10. Het rolhek (`rails/hooks/lib/rolhek.mjs`) volgt via `documentKind`.

## Alternatieven

- **Laten staan:** niets te bouwen, maar de ruis blijft en groeit met elke consolidatie.
- **Verwijderen, git als archief:** het kleinst, maar dat is A4 loslaten; de eigenaar verwierp dat (0046 Alternatieven).
- **Verhuizen en links herschrijven:** links kloppen op GitHub, maar de tekst verandert; dan is "onwijzigbaar" niet meer
  byte-toetsbaar en vraagt elke correctie een oordeel.
- **Een stub op het oude pad:** wijzigt de tekst van een ADR met eigenaarstatus (A4) en houdt de bestanden in de lijst.

## Gevolgen

- A4 blijft inhoudelijk intact: geen ADR met eigenaarstatus verandert van tekst of status of verdwijnt uit de repo; alleen de
  map verandert, en de guard toetst dat aan de blob. De afweging van de eigenaar: minder ruis tegenover relatieve links in
  gearchiveerde en geaccepteerde ADR's die op GitHub naar een niet-bestaand pad wijzen (de check vangt ze, een lezer niet),
  plus één guarduitzondering meer om te onderhouden.
- Een `vervangen door`-keten blijft volgbaar: het nummer verwijst, niet het pad.
