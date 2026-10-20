import { useRef, useState } from 'react';
import { BulkActions, Button, DataTable, Notice, Section } from '#web/ui/index.ts';

const rows = [
  { id: 'anna', name: 'Anna de Vries' },
  { id: 'bert', name: 'Bert Jansen' },
];
const columns = [{ id: 'name', header: 'Naam', cell: (row: { name: string }) => row.name }];

export function BulkActionsExample() {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [failed, setFailed] = useState(false);
  const pending = useRef<readonly string[] | null>(null);
  const failedOnce = useRef(false);
  const finish = () => {
    const ids = pending.current;
    if (ids === null) return;
    pending.current = null;
    const failures = ids.includes('bert') && !failedOnce.current ? ['bert'] : [];
    if (failures.length > 0) failedOnce.current = true;
    setResult(`${String(ids.length - failures.length)} verwerkt; ${String(failures.length)} mislukt.`);
    setSelected(failures);
    setFailed(failures.length > 0);
    setBusy(false);
  };
  return (
    <Section id="example-bulk-actions" title="Selectie en bulkacties">
      <p>
        Selecteer rijen en kies Verwerken. Afronden beëindigt de lokale voorbeeldactie. Bert mislukt de eerste keer en
        blijft geselecteerd.
      </p>
      <DataTable
        label="Selecteer voorbeeldaccounts"
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        busy={busy}
        selection={{
          selectedIds: selected,
          onSelectionChange: setSelected,
          selectionLabel: (row) => `Selecteer ${row.name}`,
          selectAllLabel: 'Selecteer alle zichtbare voorbeeldaccounts',
        }}
      />
      <BulkActions
        label="Acties voor geselecteerde accounts"
        selectedCount={selected.length}
        summary={`${String(selected.length)} geselecteerd`}
        clearLabel="Selectie wissen"
        busy={busy}
        onClear={() => {
          setSelected([]);
        }}
      >
        <Button
          onClick={() => {
            if (pending.current !== null || selected.length === 0) return;
            pending.current = [...selected];
            setResult('');
            setBusy(true);
          }}
        >
          Verwerken
        </Button>
      </BulkActions>
      <Button variant="outline" disabled={!busy} onClick={finish}>
        Afronden
      </Button>
      {result === '' ? null : <Notice tone={failed ? 'error' : 'info'}>{result}</Notice>}
    </Section>
  );
}
