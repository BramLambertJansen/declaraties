import { useState } from 'react';
import {
  Button,
  Checkbox,
  DataTable,
  Gallery,
  Input,
  ListToolbar,
  Section,
  Tabs,
  type DataTableColumn,
  type DataTableSort,
} from '#web/ui/index.ts';

const rows = [
  { id: 'anna', name: 'Anna de Vries', role: 'user', roleLabel: 'Gebruiker' },
  { id: 'bert', name: 'Bert Jansen', role: 'admin', roleLabel: 'Beheerder' },
  {
    id: 'clara',
    name: 'Clara met een lange voorbeeldnaam voor responsive tabellen',
    role: 'user',
    roleLabel: 'Gebruiker',
  },
];
const columns: readonly DataTableColumn<(typeof rows)[number]>[] = [
  { id: 'name', header: 'Naam', cell: (row) => row.name, sortable: true },
  { id: 'role', header: 'Rol', cell: (row) => row.roleLabel, sortable: true },
];
const media = [
  { id: 'landscape', src: '/gallery-landscape.svg', alt: 'Groene bergen met een gele zon', caption: 'Landschap' },
  {
    id: 'architecture',
    src: '/gallery-architecture.svg',
    alt: 'Geometrische gevel met drie verdiepingen',
    caption: 'Architectuur',
  },
  {
    id: 'detail',
    src: '/gallery-landscape.svg',
    alt: '',
    caption: 'Detail met een lange beschrijving die ook op een smal scherm binnen de kaart blijft',
  },
];
const roleOptions = [
  { value: '', label: 'Alle rollen' },
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
  { value: 'disabled', label: 'Uitgeschakeld', disabled: true },
];

function useExampleTable() {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [sort, setSort] = useState<DataTableSort>({ columnId: 'name', direction: 'asc' });
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [limit, setLimit] = useState(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const filtered = rows.filter(
    (row) =>
      row.name.toLocaleLowerCase('nl').includes(query.trim().toLocaleLowerCase('nl')) &&
      (role === '' || row.role === role),
  );
  const ordered = filtered.toSorted(
    (left, right) =>
      (sort.columnId === 'name'
        ? left.name.localeCompare(right.name, 'nl')
        : left.roleLabel.localeCompare(right.roleLabel, 'nl')) * (sort.direction === 'asc' ? 1 : -1),
  );
  const resetSelection = () => {
    setSelected([]);
    setLimit(2);
  };
  return {
    query,
    setQuery,
    role,
    setRole,
    sort,
    setSort,
    selected,
    setSelected,
    limit,
    setLimit,
    busy,
    setBusy,
    message,
    setMessage,
    filtered,
    ordered,
    resetSelection,
  };
}

function DataTableExample() {
  const model = useExampleTable();
  const {
    sort,
    setSort,
    selected,
    setSelected,
    limit,
    setLimit,
    busy,
    setBusy,
    message,
    setMessage,
    filtered,
    ordered,
  } = model;
  return (
    <>
      <Section id="example-data-table" title="DataTable">
        <p>
          Zoek, filter en sorteer de lokale voorbeeldgegevens. Selecteer rijen of laad meer; dezelfde filters veranderen
          de gallery.
        </p>
        <ExampleToolbar model={model} />
        <Checkbox
          label="Tabel bezig"
          checked={busy}
          onChange={(event) => {
            setBusy(event.target.checked);
          }}
        />
        <p role="status" aria-label="Tabelresultaat">
          {String(Math.min(limit, ordered.length))} resultaten; {String(selected.length)} geselecteerd
        </p>
        <DataTable
          label="Voorbeeldgegevens"
          rows={ordered.slice(0, limit)}
          getRowId={(row) => row.id}
          columns={columns}
          sort={sort}
          onSortChange={setSort}
          busy={busy}
          selection={{
            selectedIds: selected,
            onSelectionChange: setSelected,
            selectionLabel: (row) => `Selecteer ${row.name}`,
            selectAllLabel: 'Selecteer alle zichtbare rijen',
          }}
          rowActions={(row) => (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setMessage(row.name);
              }}
            >
              Bekijken
            </Button>
          )}
          actionsLabel="Acties"
          loadMore={{
            hasMore: limit < ordered.length,
            loading: false,
            onLoadMore: () => {
              setLimit(rows.length);
            },
            label: 'Meer laden',
            loadingLabel: 'Bezig met laden…',
          }}
        />
        <p role="status" aria-label="Rijactie">
          {message}
        </p>
        <DataTable
          label="Lege tabel"
          rows={[]}
          columns={columns}
          getRowId={(row) => row.id}
          emptyContent="Geen resultaten."
        />
        <Gallery
          label="Gefilterde afbeeldingen"
          items={media.filter((_, index) => filtered.some((row) => row.id === rows[index]?.id))}
          unavailableText="Afbeelding niet beschikbaar."
        />
      </Section>
    </>
  );
}

function TabsExamples() {
  const [value, setValue] = useState('overview');
  const items = [
    { id: 'overview', label: 'Overzicht', content: <p>Voorbeeldinhoud.</p> },
    {
      id: 'details',
      label: 'Details',
      content: <Input aria-label="Bewaarde invoer" placeholder="Typ hier en wissel van tab" />,
    },
    { id: 'disabled', label: 'Uitgeschakeld', content: <p>Niet bereikbaar.</p>, disabled: true },
  ];
  return (
    <Section id="example-tabs" title="Tabs">
      <p>Pijltjes verplaatsen focus; Enter of Spatie activeert. De invoer blijft bij wisselen bewaard.</p>
      <Tabs label="Voorbeeldtabs" items={items} />
      <Tabs label="Bestuurde tabs" items={items} value={value} onValueChange={setValue} />
      <Tabs label="Lege tabs" items={[]} />
    </Section>
  );
}

function GalleryExamples() {
  return (
    <>
      <Section id="example-gallery" title="Gallery">
        <Gallery
          label="Voorbeeldafbeeldingen"
          items={media}
          unavailableText="Afbeelding niet beschikbaar."
          preview={{ previewLabel: (item) => `Afbeelding bekijken: ${item.caption ?? item.id}`, closeLabel: 'Sluiten' }}
        />
        <Gallery
          label="Ontbrekende afbeelding"
          items={[
            { id: 'missing', src: '/gallery-missing.svg', alt: 'Ontbrekend voorbeeld', caption: 'Afbeeldingsfout' },
          ]}
          unavailableText="Afbeelding niet beschikbaar."
        />
        <Gallery
          label="Lege gallery"
          items={[]}
          unavailableText="Afbeelding niet beschikbaar."
          emptyContent="Geen resultaten."
        />
      </Section>
    </>
  );
}

export function DataDisplayExamples() {
  return (
    <>
      <DataTableExample />
      <TabsExamples />
      <GalleryExamples />
    </>
  );
}

function ExampleToolbar({ model }: { readonly model: ReturnType<typeof useExampleTable> }) {
  const { query, setQuery, role, setRole, sort, setSort, resetSelection } = model;
  return (
    <ListToolbar
      searchLabel="Zoeken"
      query={query}
      onQueryChange={(value) => {
        setQuery(value);
        resetSelection();
      }}
      showActiveFilters
      filters={[
        {
          id: 'role',
          label: 'Rol',
          value: role,
          options: roleOptions,
          searchable: true,
          onChange: (value) => {
            setRole(value);
            resetSelection();
          },
        },
      ]}
      sortLabel="Sorteren"
      sort={sort.direction}
      sortOptions={[
        { value: 'asc', label: 'Oplopend' },
        { value: 'desc', label: 'Aflopend' },
      ]}
      onSortChange={(value) => {
        setSort({ columnId: sort.columnId, direction: value === 'desc' ? 'desc' : 'asc' });
      }}
      onClear={() => {
        setQuery('');
        setRole('');
        setSort({ columnId: 'name', direction: 'asc' });
        resetSelection();
      }}
    />
  );
}
