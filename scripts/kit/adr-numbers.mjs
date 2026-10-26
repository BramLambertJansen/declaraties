// Eén nummering voor actieve en gearchiveerde ADR's; geen apart historisch register.

/** @param {string} file */
export function adrNumber(file) {
  return /^docs\/adr\/(?:archief\/)?(\d{4})-[^/]+\.md$/.exec(file)?.[1];
}

/**
 * Elk `.md`-bestand in docs/adr/ (en archief/) heet `NNNN-slug.md`, anders valt het buiten de nummering (`0040_x.md`,
 * `00400-x.md`). Uitgezonderd: README.md en sjablonen (naam begint met `_`).
 * @param {readonly string[]} files @returns {{ key: string, message: string }[]}
 */
export function invalidAdrNames(files) {
  return files
    .filter(
      (file) => /^docs\/adr\/(?:archief\/)?(?!README\.md$|_)[^/]+\.md$/.test(file) && adrNumber(file) === undefined,
    )
    .map((file) => ({
      key: `docs:${file}:adr-naam`,
      message: `${file}: een ADR heet NNNN-slug.md (vier cijfers, een streepje, een slug); README.md en _sjablonen uitgezonderd`,
    }));
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
