import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ListToolbar, type ListToolbarFilter, type ListToolbarProps } from './list-toolbar.tsx';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Spec lijstpagina, Hergebruik en UX: labels, hulptekst, "Filters wissen", focus, 300 ms debounce.
function props(overrides: Partial<ListToolbarProps> = {}): ListToolbarProps {
  return {
    searchLabel: 'Zoeken',
    searchHint: 'Zoek op naam of e-mailadres.',
    query: '',
    onQueryChange: vi.fn(),
    filters: [
      {
        id: 'rol',
        label: 'Rol',
        value: '',
        options: [
          { value: '', label: 'Alle rollen' },
          { value: 'admin', label: 'Beheerder' },
        ],
        onChange: vi.fn(),
      },
      {
        id: 'status',
        label: 'Status',
        value: '',
        options: [
          { value: '', label: 'Alle statussen' },
          { value: 'actief', label: 'Actief' },
        ],
        onChange: vi.fn(),
      },
    ],
    sortLabel: 'Sorteren',
    sort: 'nieuwste',
    sortOptions: [
      { value: 'nieuwste', label: 'Nieuwste eerst' },
      { value: 'naam-az', label: 'Naam A–Z' },
    ],
    onSortChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

function field(label: string): HTMLInputElement {
  const element = screen.getByLabelText(label);
  if (!(element instanceof HTMLInputElement)) throw new Error(`${label} is geen invoerveld`);
  return element;
}

function select(label: string): HTMLSelectElement {
  const element = screen.getByLabelText(label);
  if (!(element instanceof HTMLSelectElement)) throw new Error(`${label} is geen keuzelijst`);
  return element;
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function activeFilter(): readonly ListToolbarFilter[] {
  const base = props().filters ?? [];
  return base.map((filter) => (filter.id === 'rol' ? { ...filter, value: 'admin' } : filter));
}

describe('ListToolbar: labels en hulptekst', () => {
  test('zoekveld, filters en sorteren hebben een label; het zoekveld is type=search met de hulptekst', () => {
    render(<ListToolbar {...props()} />);

    const search = screen.getByLabelText('Zoeken');
    expect(search.getAttribute('type')).toBe('search');
    expect(search.getAttribute('maxlength')).toBe('100');
    expect(screen.getByText('Zoek op naam of e-mailadres.')).toBeTruthy();
    expect(search.getAttribute('aria-describedby')).toBe(screen.getByText('Zoek op naam of e-mailadres.').id);
    expect(screen.getByLabelText('Rol')).toBeTruthy();
    expect(screen.getByLabelText('Status')).toBeTruthy();
    expect(screen.getByLabelText('Sorteren')).toBeTruthy();
  });

  test('zonder hulptekst of filters rendert alleen wat er is', () => {
    render(<ListToolbar {...props({ searchHint: undefined, filters: [] })} />);

    expect(screen.queryByText('Zoek op naam of e-mailadres.')).toBeNull();
    expect(screen.queryByLabelText('Rol')).toBeNull();
    expect(screen.getByLabelText('Sorteren')).toBeTruthy();
  });
});

describe('ListToolbar: Filters wissen', () => {
  test('niet zichtbaar zonder q of filter', () => {
    render(<ListToolbar {...props()} />);

    expect(screen.queryByRole('button', { name: 'Filters wissen' })).toBeNull();
  });

  test('zichtbaar bij een actieve q', () => {
    render(<ListToolbar {...props({ query: 'ada' })} />);

    expect(screen.getByRole('button', { name: 'Filters wissen' })).toBeTruthy();
  });

  test('zichtbaar bij een actief filter', () => {
    render(<ListToolbar {...props({ filters: activeFilter() })} />);

    expect(screen.getByRole('button', { name: 'Filters wissen' })).toBeTruthy();
  });

  test('een andere sortering alleen telt niet als actief filter', () => {
    render(<ListToolbar {...props({ sort: 'naam-az' })} />);

    expect(screen.queryByRole('button', { name: 'Filters wissen' })).toBeNull();
  });

  test('klikken roept onClear aan, laat de sortering staan en zet de focus op het zoekveld', () => {
    const onClear = vi.fn();
    const onSortChange = vi.fn();
    render(<ListToolbar {...props({ query: 'ada', sort: 'naam-az', onClear, onSortChange })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Filters wissen' }));

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSortChange).not.toHaveBeenCalled();
    expect(select('Sorteren').value).toBe('naam-az');
    expect(document.activeElement).toBe(screen.getByLabelText('Zoeken'));
  });
});

describe('ListToolbar: zoeken met debounce', () => {
  test('onQueryChange komt pas na 300 ms stilte, één keer, met de laatste waarde', async () => {
    const onQueryChange = vi.fn();
    render(<ListToolbar {...props({ onQueryChange })} />);
    const search = screen.getByLabelText('Zoeken');

    fireEvent.change(search, { target: { value: 'a' } });
    await wait(299);
    expect(onQueryChange).not.toHaveBeenCalled();

    fireEvent.change(search, { target: { value: 'ad' } });
    await wait(299);
    expect(onQueryChange).not.toHaveBeenCalled();

    await wait(1);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith('ad');
  });

  test('typen verplaatst de focus niet', async () => {
    render(<ListToolbar {...props()} />);
    const search = screen.getByLabelText('Zoeken');
    search.focus();

    fireEvent.change(search, { target: { value: 'ada' } });
    await wait(300);

    expect(document.activeElement).toBe(search);
  });

  test('het veld toont wat de gebruiker typt, ook voor de debounce afloopt', () => {
    render(<ListToolbar {...props()} />);
    const search = screen.getByLabelText('Zoeken');

    fireEvent.change(search, { target: { value: 'ada' } });

    expect(field('Zoeken').value).toBe('ada');
  });

  test('de startwaarde komt uit query', () => {
    render(<ListToolbar {...props({ query: 'ada' })} />);

    expect(field('Zoeken').value).toBe('ada');
  });

  test('na "Filters wissen" met een nieuwe query-prop is het veld leeg', () => {
    const { rerender } = render(<ListToolbar {...props({ query: 'ada' })} />);

    rerender(<ListToolbar {...props({ query: '' })} />);

    expect(field('Zoeken').value).toBe('');
  });
});

describe('ListToolbar: filters en sorteren', () => {
  test('een filter meldt zijn nieuwe waarde direct, zonder debounce', () => {
    const onChange = vi.fn();
    const filters = (props().filters ?? []).map((filter) => (filter.id === 'rol' ? { ...filter, onChange } : filter));
    render(<ListToolbar {...props({ filters })} />);

    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'admin' } });

    expect(onChange).toHaveBeenCalledWith('admin');
  });

  test('sorteren meldt de nieuwe sortering direct', () => {
    const onSortChange = vi.fn();
    render(<ListToolbar {...props({ onSortChange })} />);

    fireEvent.change(screen.getByLabelText('Sorteren'), { target: { value: 'naam-az' } });

    expect(onSortChange).toHaveBeenCalledWith('naam-az');
  });
});

describe('ListToolbar: toetsenvolgorde', () => {
  test('DOM-volgorde van de focusbare elementen: zoekveld, filters, sorteren, wissen', () => {
    render(<ListToolbar {...props({ query: 'ada' })} />);

    const focusable = Array.from(document.querySelectorAll('input, select, button'));
    const positions = [
      screen.getByLabelText('Zoeken'),
      screen.getByLabelText('Rol'),
      screen.getByLabelText('Status'),
      screen.getByLabelText('Sorteren'),
      screen.getByRole('button', { name: 'Filters wissen' }),
    ].map((element) => focusable.indexOf(element));

    expect(positions).toStrictEqual([0, 1, 2, 3, 4]);
    expect(focusable.every((element) => element.getAttribute('tabindex') === null)).toBe(true);
  });
});

describe('ListToolbar: review PR 1', () => {
  test('B2: de getrimde terugkoppeling van de parent laat "ada " staan; verder typen klopt', async () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(<ListToolbar {...props({ onQueryChange })} />);
    fireEvent.change(screen.getByLabelText('Zoeken'), { target: { value: 'ada ' } });
    await wait(300);
    expect(onQueryChange).toHaveBeenCalledWith('ada ');

    rerender(<ListToolbar {...props({ onQueryChange, query: 'ada' })} />);

    expect(field('Zoeken').value).toBe('ada ');
    fireEvent.change(field('Zoeken'), { target: { value: 'ada l' } });
    expect(field('Zoeken').value).toBe('ada l');
  });

  test('"Filters wissen" binnen 300 ms annuleert de debounce en leegt het veld', async () => {
    const onQueryChange = vi.fn();
    render(<ListToolbar {...props({ onQueryChange })} />);
    fireEvent.change(screen.getByLabelText('Zoeken'), { target: { value: 'ada' } });

    fireEvent.click(screen.getByRole('button', { name: 'Filters wissen' }));
    await wait(1000);

    expect(onQueryChange).not.toHaveBeenCalled();
    expect(field('Zoeken').value).toBe('');
  });

  test('twee toolbars hebben unieke ids en elk label hoort bij zijn eigen veld', () => {
    render(
      <div>
        <ListToolbar {...props()} />
        <ListToolbar {...props()} />
      </div>,
    );

    const fields = screen.getAllByLabelText('Zoeken');
    expect(fields).toHaveLength(2);
    expect(fields[0]?.id).not.toBe(fields[1]?.id);
    const labels = Array.from(document.querySelectorAll('label')).filter((label) => label.textContent === 'Zoeken');
    expect(labels.map((label) => label.htmlFor)).toStrictEqual(fields.map((element) => element.id));
    const ids = Array.from(document.querySelectorAll('[id]')).map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
