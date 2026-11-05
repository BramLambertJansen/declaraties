export interface ComponentMetadata {
  readonly naam: string;
  readonly bron: string;
  readonly publiek: boolean;
  readonly importnamen: readonly string[];
  readonly varianten: Readonly<Record<string, readonly string[]>>;
}

function requireCatalogueBuild(): readonly ComponentMetadata[] {
  throw new Error('De UI-index moet door de catalogusIndex-buildplugin worden opgebouwd.');
}

// De Vite-plugin vult deze bestaande module in het geheugen vanuit de bron-AST. Geen handmatige of gecommitte kopie.
export const components = requireCatalogueBuild();
