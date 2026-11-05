import { useEffect, useState } from 'react';
import { copy } from '#web/copy/ui.ts';
import { useListSearch } from '#core/web/lib/list-search.ts';
import { PageHeader, Tabs, Text } from '#web/ui/index.ts';
import { ComponentIndex } from './component-index.tsx';
import { showExample, type ExampleTarget } from './example-targets.ts';
import { vakPanels } from './vak-panels.tsx';
import { vakFrom, vakken } from './vakken.ts';

// Catalogus van de basiskit als toolbox voor de beheerder (framework §7, specs design-system en designsystem-toolbox), ook
// in productie achter guard('design-system:read'). Elke component met elke variant, verdeeld over tabbladen; het open
// tabblad staat in de zoekparameter `vak`. De teksten zijn voorbeelden, geen app-teksten. Alleen voorbeelddata en geen
// API-aanroepen: de chunk is statisch en voor iedereen te downloaden (design-system/AC-10). Layout en providers worden via
// de echte app-compositie gedemonstreerd (ADR 0048); schermcomponenten hebben previews.

// Toon opent eerst het tabblad; pas als dat zichtbaar is, kan de sectie de focus krijgen.
function useCatalogueNavigation() {
  const { search, setQuery, setFilter } = useListSearch();
  const vak = vakFrom(search['vak']);
  const [pending, setPending] = useState<ExampleTarget | null>(null);
  useEffect(() => {
    if (pending?.vak !== vak) return;
    showExample(pending.id);
    setPending(null);
  }, [pending, vak]);
  return {
    vak,
    query: search['q'] ?? '',
    setQuery,
    setVak: (id: string) => {
      setFilter('vak', vakFrom(id));
    },
    show: (target: ExampleTarget) => {
      // Ook zonder `vak` in de URL komt het tabblad erin, zodat Terug na Toon altijd een stap is (AC-3).
      if (search['vak'] !== target.vak) setFilter('vak', target.vak);
      setPending(target);
    },
  };
}

export function DesignSystemPage() {
  const nav = useCatalogueNavigation();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={copy.designSystem.title} />
      <Text tone="muted">
        De gereedschapskist van deze app: alle onderdelen en stijlen waarmee schermen worden gebouwd, met live
        voorbeelden in het echte thema. Alles hier is voorbeelddata; niets wijzigt echte gegevens.
      </Text>
      <ComponentIndex search={nav.query} onSearchChange={nav.setQuery} onShow={nav.show} />
      <Tabs
        label="Onderdelen per soort"
        value={nav.vak}
        onValueChange={nav.setVak}
        items={vakken.map((vak) => ({ id: vak.id, label: vak.label, content: vakPanels[vak.id] }))}
      />
    </div>
  );
}
