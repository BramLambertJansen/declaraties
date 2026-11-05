import ts from 'typescript';
import { canonical, isUiFile, relativeFile, type UiComponent, type UiSource } from './catalogus-source.ts';

export interface Coverage {
  readonly rendered: Set<ts.Symbol>;
  readonly variants: Map<ts.Symbol, Map<string, Set<string>>>;
  readonly called: Set<ts.Symbol>;
}

function localDeclaration(source: UiSource, symbol: ts.Symbol | undefined): ts.Declaration | undefined {
  return symbol?.declarations?.find((node) =>
    isCatalogusFile(relativeFile(source.root, node.getSourceFile().fileName)),
  );
}

function isCatalogusFile(file: string): boolean {
  return (
    isUiFile(file) ||
    file.startsWith('src/web/features/design-system/') ||
    file === 'src/web/features/layout/app-layout.tsx' ||
    file === 'src/web/main.tsx'
  );
}

// Alleen deze compositie-roots horen bij /design-system. Geen andere pagina kan de ontbrekende demo maskeren.
export function coverage(source: UiSource): Coverage {
  const result: Coverage = { rendered: new Set(), variants: new Map(), called: new Set() };
  const queue: ts.Node[] = [];
  for (const file of source.files) {
    const name = relativeFile(source.root, file.fileName);
    if (name === 'src/web/main.tsx') queue.push(...file.statements.filter(ts.isExpressionStatement));
    if (
      name === 'src/web/features/design-system/design-system-page.tsx' ||
      name === 'src/web/features/layout/app-layout.tsx'
    ) {
      queue.push(
        ...file.statements.filter(
          (node) =>
            ts.isFunctionDeclaration(node) &&
            (node.name?.text === 'DesignSystemPage' || node.name?.text === 'AppLayout'),
        ),
      );
    }
  }
  const visited = new Set<ts.Node>();
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined || visited.has(node)) continue;
    visited.add(node);
    reachableWalk(node, (child) => {
      follow(source, child, { result, queue });
    });
  }
  return result;
}

// Declaraties bewijzen geen render. Loop ze pas in wanneer teruggegeven JSX of een callback ernaar verwijst.
function reachableWalk(root: ts.Node, visit: (node: ts.Node) => void): void {
  const scan = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name.getText() === 'render') scan(member);
      }
      return;
    }
    if (node !== root && (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node))) return;
    if (ts.isConditionalExpression(node) && node.condition.kind === ts.SyntaxKind.FalseKeyword) {
      scan(node.whenFalse);
      return;
    }
    if (ts.isConditionalExpression(node) && node.condition.kind === ts.SyntaxKind.TrueKeyword) {
      scan(node.whenTrue);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      node.left.kind === ts.SyntaxKind.FalseKeyword
    )
      return;
    visit(node);
    ts.forEachChild(node, scan);
  };
  scan(root);
}

function follow(source: UiSource, node: ts.Node, state: { result: Coverage; queue: ts.Node[] }): void {
  if (ts.isIdentifier(node)) {
    const target = canonical(source.checker, source.checker.getSymbolAtLocation(node));
    const declaration = localDeclaration(source, target);
    if (declaration !== undefined && (ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration))) {
      state.queue.push(ts.isBindingElement(declaration) ? declaration.parent.parent : declaration);
    }
  }
  // Router-configuratie bindt de rootcomponent als waarde, in plaats van met een JSX-tag.
  if (ts.isPropertyAssignment(node) && node.name.getText() === 'component') {
    const target = canonical(source.checker, source.checker.getSymbolAtLocation(node.initializer));
    const declaration = localDeclaration(source, target);
    if (declaration !== undefined) state.queue.push(declaration);
  }
  const jsx = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node);
  if (!jsx && !ts.isCallExpression(node)) return;
  const expression = jsx ? node.tagName : node.expression;
  const symbol = canonical(source.checker, source.checker.getSymbolAtLocation(expression));
  if (symbol === undefined) return;
  const declaration = localDeclaration(source, symbol);
  if (jsx) {
    state.result.rendered.add(symbol);
    const component = source.components.find((item) => item.symbol === symbol);
    if (component !== undefined) recordVariants(component, node, state.result);
  } else state.result.called.add(symbol);
  if (declaration !== undefined) state.queue.push(declaration);
}

function defaultValue(component: UiComponent, name: string): string | undefined {
  const declaration = component.declaration;
  const fn = ts.isFunctionDeclaration(declaration)
    ? declaration
    : (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration)) &&
        declaration.initializer !== undefined &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ? declaration.initializer
      : undefined;
  const binding = fn?.parameters[0]?.name;
  if (binding === undefined || !ts.isObjectBindingPattern(binding)) return undefined;
  const entry = binding.elements.find((element) => (element.propertyName ?? element.name).getText() === name);
  return entry?.initializer !== undefined && ts.isStringLiteral(entry.initializer) ? entry.initializer.text : undefined;
}

function recordVariants(
  component: UiComponent,
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  result: Coverage,
) {
  const found = result.variants.get(component.symbol) ?? new Map<string, Set<string>>();
  for (const name of Object.keys(component.varianten)) {
    const attribute = node.attributes.properties.find(
      (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === name,
    );
    let value: string | undefined;
    if (attribute === undefined && !node.attributes.properties.some(ts.isJsxSpreadAttribute))
      value = defaultValue(component, name);
    if (attribute !== undefined && ts.isJsxAttribute(attribute)) {
      const init = attribute.initializer;
      if (init !== undefined && ts.isStringLiteral(init)) value = init.text;
      if (
        init !== undefined &&
        ts.isJsxExpression(init) &&
        init.expression !== undefined &&
        ts.isStringLiteral(init.expression)
      )
        value = init.expression.text;
    }
    if (value === undefined) continue;
    const values = found.get(name) ?? new Set<string>();
    values.add(value);
    found.set(name, values);
  }
  result.variants.set(component.symbol, found);
}
