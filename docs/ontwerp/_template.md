# Ontwerp: <bron>

Mappingdocument van de skill `ontwerp-overnemen` (spec [ontwerp-overnemen](../specs/ontwerp-overnemen.md)). Kopieer dit
sjabloon naar `docs/ontwerp/<bron>.md` en verwijs ernaar vanuit de spec van de PR die de stijl overneemt. Screenshots en
meetuitvoer komen niet in de repo (OV-1); noem hier alleen herkomst, datum en het pad.

## Bron

- Soort: HTML-bestand / URL / afbeelding / geen (bestaande stijl)
- Herkomst: <van wie, waar vandaan; wie de rechten heeft>
- Datum: <JJJJ-MM-DD>
- Gemeten: ja (`node scripts/kit/ontwerp-meten.mjs`) / nee (statisch gelezen of geschat uit een afbeelding)
- Uitvoer: `.runner-output/ontwerp/<naam>/` (375.png, 1280.png, stijlen.json; niet gecommit)
- Modus: geen invoer / bestaande stijl plus referentie / stylingrefactor (alleen als de opdracht dat letterlijk vraagt)

## Tokens

Alleen semantische tokens uit `node scripts/kit/feiten.mjs tokens`. Een gewijzigde bestaande waarde noemt ook de oude
waarde.

| Referentie | Token | Waarde licht | Waarde donker | Contrast |
|---|---|---|---|---|
| <bijv. merkblauw van de knoppen> | `--primary` | `oklch(…)` | `oklch(…)` | <bijv. 5,1:1 op `--primary-foreground`> |

## Componenten

| Element | Component | Variant |
|---|---|---|
| <bijv. primaire knop in de kop> | `Button` | `default` |

## Voorgestelde varianten

Elementen zonder passend component of variant, met het voorstel via de skill `nieuw-component`. Geen: "Geen".

## Lettertypen

| Familie | Versie | Licentie | Herkomst |
|---|---|---|---|
| <bijv. Inter> | <bijv. 4.1> | OFL 1.1 / Apache 2.0 | <eigenaar of Fontsource-tarball uit `registry.npmjs.org`> |

## Bewust buiten

Wat niet is overgenomen en waarom (bijv. een kleur die geen 4,5:1 haalt, een maat buiten de schaal, een effect zonder
token).
