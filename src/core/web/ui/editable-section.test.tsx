import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { EditableSection } from './editable-section.tsx';
import { Button } from './button.tsx';

afterEach(cleanup);
function Example() {
  const [editing, setEditing] = useState(false);
  return (
    <EditableSection
      title="Gegevens"
      editing={editing}
      editLabel="Bewerken"
      onEdit={() => {
        setEditing(true);
      }}
      summary={<p>Samenvatting</p>}
    >
      <Button
        onClick={() => {
          setEditing(false);
        }}
      >
        Annuleren
      </Button>
    </EditableSection>
  );
}
test('wisselt tussen bekijken en bewerken met focus op kop en daarna de bewerkknop', () => {
  render(<Example />);
  expect(screen.queryByRole('button', { name: 'Annuleren' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }));
  expect(screen.queryByText('Samenvatting')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Gegevens' }));
  fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }));
  expect(screen.getByText('Samenvatting')).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bewerken' }));
});
test('controlled: zonder ouderwijziging blijft de samenvatting staan', () => {
  const onEdit = vi.fn();
  render(
    <EditableSection title="Gegevens" editing={false} editLabel="Bewerken" onEdit={onEdit} summary="Samenvatting">
      Editor
    </EditableSection>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bewerken' }));
  expect(onEdit).toHaveBeenCalledOnce();
  expect(screen.queryByText('Editor')).toBeNull();
});
