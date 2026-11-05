// Framework §7: ontdek UI uit broncode, indexeer voor hergebruik, eis bereikbare voorbeelden en alle eindige varianten.
// Geen uitzonderingenlijst. Dezelfde AST-index voedt feiten.mjs en de zichtbare componentenindex (Vite-plugin).
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { coverage } from './catalogus-graph.ts';
import { barrelExports, isUiFile, relativeFile, uiSource } from './catalogus-source.ts';

/** @param {string} [root] */
export function componenten(root = '.', source = uiSource(root)) {
  const exports = barrelExports(source);
  return source.components.map(({ naam, bron, publiek, varianten, symbol }) => ({
    naam,
    bron,
    publiek,
    varianten,
    importnamen: exports.get(symbol) ?? [],
  }));
}

/** @param {string} [root] @returns {string[]} */
export function catalogusFouten(root = '.', source = uiSource(root)) {
  const shown = coverage(source);
  const exports = barrelExports(source);
  const errors = source.components.flatMap((component) => {
    const missing = [];
    if (component.publiek && !exports.has(component.symbol))
      missing.push(`${component.naam}: ontbreekt in src/web/ui/index.ts (${component.bron})`);
    if (!shown.rendered.has(component.symbol))
      missing.push(`${component.naam}: geen bereikbaar voorbeeld op /design-system (${component.bron})`);
    for (const [property, values] of Object.entries(component.varianten)) {
      for (const value of values) {
        if (!shown.variants.get(component.symbol)?.get(property)?.has(value))
          missing.push(`${component.naam}: voorbeeld voor ${property}="${value}" ontbreekt`);
      }
    }
    return missing;
  });
  return [...source.errors, ...errors, ...hookErrors(source, shown)];
}

/** @param {import('./catalogus-source.ts').UiSource} source @param {import('./catalogus-graph.ts').Coverage} shown */
function hookErrors(source, shown) {
  const hooks = source.files
    .filter((file) => isUiFile(relativeFile(source.root, file.fileName)))
    .flatMap((file) => file.statements.filter(ts.isFunctionDeclaration))
    .filter(
      (node) =>
        node.name !== undefined &&
        /^use[A-Z]/.test(node.name.text) &&
        node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    );
  return hooks.flatMap((node) => {
    const signature = source.checker.getSignatureFromDeclaration(node);
    if (signature === undefined) return [];
    return signature
      .getReturnType()
      .getProperties()
      .flatMap((method) => {
        const own = method.declarations?.some((declaration) =>
          isUiFile(relativeFile(source.root, declaration.getSourceFile().fileName)),
        );
        const callable = source.checker.getTypeOfSymbolAtLocation(method, node).getCallSignatures().length > 0;
        return own && callable && !shown.called.has(method)
          ? [`${node.name?.text ?? ''}: bereikbaar voorbeeld voor .${method.name}() ontbreekt`]
          : [];
      });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const source = uiSource();
  const fouten = catalogusFouten('.', source);
  if (fouten.length > 0) {
    console.error(`✗ check:catalogus\n${fouten.map((fout) => `  - ${fout}`).join('\n')}`);
    process.exit(1);
  }
  console.info(
    `✓ check:catalogus: ${String(componenten('.', source).length)} UI-componenten met bereikbare voorbeelden en varianten`,
  );
}
