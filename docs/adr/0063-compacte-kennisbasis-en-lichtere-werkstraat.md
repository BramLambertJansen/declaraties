# 0063 — Compacte kennisbasis en lichtere werkstraat

Status: geaccepteerd

Herzien: 2026-11-02 (#416): punt 3 en 7 volgen [0064](0064-leesbudget-per-laag.md)

Herziet in dezelfde PR [0045](0045-railwerk.md), [0046](0046-werkstraat-en-beslisroute.md),
[0052](0052-accountstatus-en-laatste-login.md), [0053](0053-adr-archief.md), [0056](0056-functionele-ui-in-een-pr.md),
[0057](0057-risicogestuurde-werkstraat.md), [0058](0058-beperkte-fixroute-en-volledige-featurestraat.md) en
[0062](0062-spec-en-bouw-in-een-pr.md): alleen de zinsdelen over taakmandaat en gate-label vallen weg. 0055 vervalt.
Drempel: A3 (mandaat en label vervallen) en A4. Uitwerking rails: [spec](../specs/compacte-kennisbasis-rails.md).

## Context

Agents komen tot ~400 KB docs tegen; de budgetten uit framework §9 dwingt geen check af en app-regels staan deels alleen in
ADR's. Taakmandaat en gate-label kosten machinerie zonder sterkere grens: zolang de eigenaar auteur én goedkeurder is, staat de
diff-guard in `overgang`. Aanleiding (P1): gemeten wrijving en de eigenaarreview "krachtiger, lichter, sneller; niets verloren".

## Besluit

1. **Eén bindend regelboek:** `docs/framework.md`, dat opent met: *"Deze regels gelden altijd. Afwijken alleen na een vraag en
   een expliciet akkoord van de eigenaar. Dat akkoord wordt vastgelegd in de PR (template) of in app-ADR 0100+ (app). Vaste
   uitzonderingen staan limitatief in §3."* Elke norm is één regel met een unieke R-id en herkomst (`R-DB-03 … (0042)`). De
   ankers §1–§12 (met §11a) blijven. `.claude/rules/*` bevat de regels letterlijk met dezelfde R-id; `check-docs` toetst dat.
   ADR's leggen alleen het waarom vast en zijn geen verplichte leesstof.
2. **Eerst vastleggen, dan schrappen.** Een norm krijgt een R-id vóór haar bron krimpt of verhuist; tekst over een check gaat
   alleen weg als die check de regel volledig afdwingt. Bekende gaten en geaccepteerde valse positieven blijven als regel staan.
   Inventaris: framework §1–§12, `AGENTS.md`, `.claude/rules/*`, de "Altijd"-items van `dod.md`, de normen van alle geaccepteerde
   ADR's (o.a. 0039 providers en toolchain, 0040 punt 10, 0041/0043 auth, 0042 database, 0048, 0049 deploy, 0050 jobs, 0051 AVG,
   0060 opslag), `nieuwe-app.md`, `operations/runner-invoer.md` en de open gaten uit §8. De reviewer toetst per item een R-id.
3. **Budgetten als ratchet** in `check-docs`, in bytes (1 KB = 1024): `AGENTS.md` ≤ 100 regels en 9 KB, `framework.md` ≤ 40 KB,
   een nieuwe spec ≤ 10 KB, een nieuw ADR ≤ 6 KB. Bestaande overschrijdingen staan in een baseline die alleen omlaag mag.
4. **`docs/template/`** voor documenten die alleen de template betreffen. Blijven staan: wat een geaccepteerd ADR linkt,
   `docs/operations/runner-invoer.md`, `roadmap.md` en `roadmap-archief.md`. Vervangen en vervallen ADR's gaan naar
   `docs/adr/archief/` volgens 0053.
5. **Taakmandaat vervalt:** `docs:decision`, de mandaatrecords en de mandaattakken in de rolhek-lib, `docs:status`,
   `check-document-status` en `check-roadmap` (die checks blijven). `.claude/decisions.json` houdt `requiredChecks` en een leeg
   `decisions`. De uitslag per rol, pad en modus blijft gelijk, behalve dat de mandaat-allow en -melding verdwijnen; geen nieuwe
   deny op `src/core`, `src/shared/permissions.ts` of `src/api/app.ts`. Ongewijzigd: alleen architect en hoofdsessie schrijven
   een eigenaarstatus, de developer `gebouwd` via `docs:status`, de A4-basis uit main, de functionele-UI-melding en het lezen van
   register en vertrouwde basis uit main. Zonder records laat de guard alleen de overgangen uit 0046 punt 5, `gebouwd` (0054,
   0062), de archiefverhuizing (0053) en de herzieningsroute (#379) toe; elke andere statusovergang wordt geweigerd.
6. **Gate-label vervalt:** `pr:label-gate`, `gateMarker` en de labelvoorwaarde in de diff-guard; de review-eis van de guard
   blijft. Een label vervangt geen eigenaarreview. Het rolhek weigert voor elke rol elke labelwijziging op een PR (`gh pr create`,
   `gh pr edit`, elke schrijfwijze) en labels, reviews en statussen via de API. `gh issue` blijft zoals nu (0059 ongewijzigd).
7. **Gaten in het rolhek dicht:** elke schrijf- of verwijderactie op een beschermd pad wordt herkend, ook via de opties van een
   programma (zoals `find`), via elk redirect-token en via een map, die geldt voor elk beschermd pad eronder. Het rolhek wordt
   verder niet verruimd. Agents lezen en zoeken met de Read-, Grep- en Glob-tools, niet met Bash; die regel komt in `AGENTS.md`.
8. **0055 vervalt** (nooit gebouwd); 0047 punt 1 en 4 gelden zoals ze luiden. Testregisters per resource worden zo nodig een
   roadmap-item met een eigen besluit. De specs `taakmandaat-frameworkwerk` en `taakmandaat-vervolg` vervallen.
9. **Overgang en volgorde.** Rechten gelden pas na de merge; een werkversie, prompt, label of commit-auteur vervangt dat niet. Tot
   PR 6b gemerged is, werken mandaat en label zoals nu. Volgorde: PR 2 rails (archief, verwijzingen, budget), PR 3 regelboek,
   PR 4 instructies, PR 5 archiveren en `docs/template/`, PR 6a rolhek, PR 6b mandaat en label weg.

Geen besluit: een reset van de releasehistorie vóór v1.0 is een apart besluit (issue #384).

## Alternatieven

- **0045 en 0046 vervangen door een consoliderend ADR:** dubbele tekst; herzien ter plekke toont het verschil in `git diff`.
- **Een vrijstelling voor leescommando's in Bash:** te veel aanvalsvlak; de tools Read, Grep en Glob doen hetzelfde veilig.
- **Een deny op `src/core` in plaats van het mandaat:** breekt het gouden pad en `new:resource`.

## Gevolgen

- **Grens:** de eigenaarmerge en de ruleset met verplichte checks, waaronder de RLS-, secdef- en securitychecks; met de GitHub
  App ook goedkeuring door een niet-auteur en een verplichte diff-guard. **Vangnet:** rolhek, hooks, sandbox, isolatie van tester
  en reviewer, `pr:verify` en de diff-guard in `overgang`. Het label weghalen verandert de grens niet.
