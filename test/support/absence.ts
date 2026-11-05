// Afwezigheidstest die eerst zijn patroon bewijst (leerpunt #402). `expect(tekst).not.toMatch(/mandat/i)` bleef groen
// terwijl de bron "taakmandaat" noemde: een negatieve assertie met een patroon dat de vormen in de bron niet herkent,
// bewijst niets. Daarom eerst: elk voorbeeld in `recognizes` matcht (te smal faalt), geen voorbeeld in `allows` matcht
// (te breed faalt). Pas daarna de afwezigheid. De rail `rails/afwezigheid` (eslint.config.js) laat alleen deze route toe.

export interface AbsenceExamples {
  /** Elke vorm die in de gecontroleerde bron kan staan, per taalvariant ("mandaat" én "mandate"). */
  readonly recognizes: readonly [string, ...string[]];
  /** Vormen die wel mogen staan; het patroon mag ze niet raken. */
  readonly allows?: readonly string[];
}

export function expectAbsent(text: string, pattern: RegExp, examples: AbsenceExamples): void {
  // Zonder g en y: `test()` en `exec()` hangen dan niet af van `lastIndex` van een eerdere aanroep.
  const plain = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
  if (examples.recognizes.length === 0) {
    throw new Error(`expectAbsent: geef minstens één voorbeeld dat ${String(pattern)} moet herkennen`);
  }
  for (const example of examples.recognizes) {
    if (!plain.test(example)) {
      throw new Error(`expectAbsent: ${String(pattern)} herkent "${example}" niet; het patroon is te smal`);
    }
  }
  for (const example of examples.allows ?? []) {
    if (plain.test(example)) {
      throw new Error(`expectAbsent: ${String(pattern)} raakt het toegestane "${example}"; het patroon is te breed`);
    }
  }
  const found = plain.exec(text);
  if (found !== null) {
    throw new Error(
      `expectAbsent: ${String(pattern)} vindt "${found[0]}" op positie ${String(found.index)} in de tekst`,
    );
  }
}
