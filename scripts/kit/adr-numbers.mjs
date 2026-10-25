// Eén nummering voor actieve en gearchiveerde ADR's; geen apart historisch register.

/** @param {string} file */
export function adrNumber(file) {
  return /^docs\/adr\/(?:archief\/)?(\d{4})-[^/]+\.md$/.exec(file)?.[1];
}

/** @param {readonly string[]} files @returns {{ key: string, message: string }[]} */
export function duplicateAdrNumbers(files) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const file of files) {
    const number = adrNumber(file);
    if (number !== undefined) groups.set(number, [...(groups.get(number) ?? []), file]);
  }
  return [...groups]
    .filter(([, paths]) => paths.length > 1)
    .map(([number, paths]) => {
      const names = paths.map((file) => file.replace('docs/adr/archief/', 'docs/adr/')).sort();
      const legacy =
        names.join('\n') ===
        ['docs/adr/0039-lokale-gate-hergebruik.md', 'docs/adr/0039-stack-provider-neutraal-en-toolchain.md'].join('\n');
      // De bestaande ratchet-sleutel geldt uitsluitend voor dit historische paar, nooit voor nieuw misbruik van 0039.
      const suffix = number === '0039' && !legacy ? `:${[...paths].sort().join('|')}` : '';
      return {
        key: `docs:adr:${number}:dubbel${suffix}`,
        message: `ADR-nummer ${number} is al gebruikt in meer dan één bestand: ${paths.join(', ')}`,
      };
    });
}
