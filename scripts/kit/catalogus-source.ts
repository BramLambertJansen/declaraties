import path from 'node:path';
import ts from 'typescript';

export interface UiComponent {
  readonly naam: string;
  readonly bron: string;
  readonly publiek: boolean;
  readonly varianten: Readonly<Record<string, readonly string[]>>;
  readonly symbol: ts.Symbol;
  readonly declaration: ts.Declaration;
}

export interface UiSource {
  readonly root: string;
  readonly checker: ts.TypeChecker;
  readonly files: readonly ts.SourceFile[];
  readonly components: readonly UiComponent[];
  readonly errors: readonly string[];
}

export function relativeFile(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export function isUiFile(file: string): boolean {
  return /^(src\/core\/web\/ui|src\/web\/ui)\//.test(file);
}

export function canonical(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function barrelExports(source: UiSource): Map<ts.Symbol, string[]> {
  const file = source.files.find((item) => relativeFile(source.root, item.fileName) === 'src/web/ui/index.ts');
  const module = file === undefined ? undefined : source.checker.getSymbolAtLocation(file);
  const names = new Map<ts.Symbol, string[]>();
  for (const item of module === undefined ? [] : source.checker.getExportsOfModule(module)) {
    const symbol = canonical(source.checker, item);
    if (symbol !== undefined) exportedNames(symbol, item.name, { source, names });
  }
  return names;
}

export function walk(node: ts.Node, visit: (child: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

function exportedNames(
  symbol: ts.Symbol,
  name: string,
  state: { source: UiSource; names: Map<ts.Symbol, string[]>; ancestors?: ReadonlySet<ts.Symbol> },
): void {
  if (state.ancestors?.has(symbol)) return;
  const previous = state.names.get(symbol) ?? [];
  if (previous.includes(name)) return;
  state.names.set(symbol, [...previous, name]);
  const declaration = symbol.valueDeclaration;
  if (declaration === undefined) return;
  const type = state.source.checker.getTypeOfSymbolAtLocation(symbol, declaration);
  for (const property of type.getProperties()) {
    const node = property.valueDeclaration;
    if (
      node !== undefined &&
      isUiFile(relativeFile(state.source.root, node.getSourceFile().fileName)) &&
      /^[A-Z]/.test(property.name)
    ) {
      exportedNames(property, `${name}.${property.name}`, {
        ...state,
        ancestors: new Set([...(state.ancestors ?? []), symbol]),
      });
    }
  }
}

export function uiSource(directory = '.'): UiSource {
  const root = path.resolve(directory);
  const rootNames = [
    'src/core/web/ui',
    'src/web/ui',
    'src/web/features/design-system',
    'src/web/features/layout',
  ].flatMap((directory) =>
    ts.sys.readDirectory(path.join(root, directory), ['.ts', '.tsx'], ['**/*.test.*', '**/*.gen.ts']),
  );
  const main = path.join(root, 'src/web/main.tsx');
  if (ts.sys.fileExists(main)) rootNames.push(main);
  const options = compilerOptions(root);
  const program = ts.createProgram(rootNames, options);
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles().filter((file) => relativeFile(root, file.fileName).startsWith('src/'));
  const components = files
    .filter((file) => isUiFile(relativeFile(root, file.fileName)))
    .flatMap((file) => discover({ root, checker, file }));
  const errors = program
    .getSyntacticDiagnostics()
    .map(
      (diagnostic) =>
        `${relativeFile(root, diagnostic.file.fileName)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
    );
  return { root, checker, files, components, errors };
}

function compilerOptions(root: string): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    types: [],
    skipLibCheck: true,
    paths: {
      '#core/*': [path.join(root, 'src/core/*')],
      '#web/*': [path.join(root, 'src/web/*')],
      '#shared/*': [path.join(root, 'src/shared/*')],
    },
  };
}

function discover({
  root,
  checker,
  file,
}: {
  root: string;
  checker: ts.TypeChecker;
  file: ts.SourceFile;
}): UiComponent[] {
  const module = checker.getSymbolAtLocation(file);
  const exports = new Set(
    module === undefined ? [] : checker.getExportsOfModule(module).map((s) => canonical(checker, s)),
  );
  const result: UiComponent[] = [];
  for (const statement of file.statements) {
    const declarations = ts.isVariableStatement(statement) ? statement.declarationList.declarations : [statement];
    for (const declaration of declarations) {
      const candidate = componentCandidate(declaration, { checker, file });
      if (candidate === undefined) continue;
      result.push(...componentTree(candidate, { root, checker, file, publiek: exports.has(candidate.symbol) }));
    }
  }
  return result;
}

interface Candidate {
  readonly symbol: ts.Symbol;
  readonly name: string;
  readonly type: ts.Type;
  readonly node: ts.Declaration;
}

function componentTree(
  candidate: Candidate,
  context: {
    root: string;
    checker: ts.TypeChecker;
    file: ts.SourceFile;
    publiek: boolean;
    ancestors?: ReadonlySet<ts.Symbol>;
  },
): UiComponent[] {
  const { symbol, name, type, node } = candidate;
  if (!/^[A-Z]/.test(name.split('.').at(-1) ?? '')) return [];
  if (context.ancestors?.has(symbol)) return [];
  const contextType = type.getSymbol();
  if (
    contextType?.name === 'Context' &&
    contextType.declarations?.some((item) => /node_modules\/@types\/react\//.test(item.getSourceFile().fileName))
  )
    return [];
  const own = type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0;
  const current: UiComponent[] = own
    ? [
        {
          naam: name,
          bron: relativeFile(context.root, context.file.fileName),
          publiek: context.publiek,
          varianten: variants({ root: context.root, checker: context.checker, declaration: node, type }),
          symbol,
          declaration: node,
        },
      ]
    : [];
  const children = type.getProperties().flatMap((property) => {
    const declaration = property.valueDeclaration;
    if (declaration === undefined || declaration.getSourceFile() !== context.file || property === symbol) return [];
    return componentTree(
      {
        symbol: property,
        name: `${name}.${property.name}`,
        type: context.checker.getTypeOfSymbolAtLocation(property, declaration),
        node: declaration,
      },
      { ...context, ancestors: new Set([...(context.ancestors ?? []), symbol]) },
    );
  });
  return [...current, ...children];
}

function componentCandidate(node: ts.Node, { checker, file }: { checker: ts.TypeChecker; file: ts.SourceFile }) {
  if (
    !ts.isFunctionDeclaration(node) &&
    !ts.isVariableDeclaration(node) &&
    !ts.isClassDeclaration(node) &&
    !ts.isModuleDeclaration(node) &&
    !ts.isExportAssignment(node)
  )
    return undefined;
  const module = checker.getSymbolAtLocation(file);
  const name = ts.isExportAssignment(node) ? undefined : node.name;
  const symbol =
    name === undefined
      ? module === undefined
        ? undefined
        : checker.getExportsOfModule(module).find((item) => item.name === 'default')
      : checker.getSymbolAtLocation(name);
  if (symbol === undefined) return undefined;
  const label =
    name?.getText() ??
    path
      .basename(file.fileName)
      .replace(/\.[^.]+$/, '')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  const type =
    ts.isClassDeclaration(node) || ts.isModuleDeclaration(node)
      ? checker.getTypeOfSymbolAtLocation(symbol, node)
      : checker.getTypeAtLocation(ts.isExportAssignment(node) ? node.expression : node);
  return { symbol, name: label, type, node };
}

export function literals(type: ts.Type): string[] {
  const members = type.isUnion() ? type.types : [type];
  if (
    members.some(
      (member) => (member.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.Undefined | ts.TypeFlags.Null)) === 0,
    )
  )
    return [];
  return members.flatMap((member) => (member.isStringLiteral() ? [member.value] : [])).sort();
}

function variants({
  root,
  checker,
  declaration,
  type,
}: {
  root: string;
  checker: ts.TypeChecker;
  declaration: ts.Declaration;
  type: ts.Type;
}) {
  const signature = type.getCallSignatures()[0] ?? type.getConstructSignatures()[0];
  const parameter = signature?.parameters[0];
  if (parameter === undefined) return {};
  const props = checker.getTypeOfSymbolAtLocation(parameter, declaration);
  return Object.fromEntries(
    props.getProperties().flatMap((property) => {
      // Platformprops (HTML/ARIA) zijn geen componentvarianten. Volg voor eigen props ook geïmporteerde en mapped types.
      if (
        property.declarations?.every((node) =>
          /node_modules\/@types\/react\//.test(relativeFile(root, node.getSourceFile().fileName)),
        )
      )
        return [];
      const values = literals(checker.getTypeOfSymbolAtLocation(property, declaration));
      return values.length > 1 ? [[property.name, values]] : [];
    }),
  );
}
