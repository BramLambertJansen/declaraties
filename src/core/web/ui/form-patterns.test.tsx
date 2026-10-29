import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { Form, FormField, useZodForm } from './form.tsx';
import { FormChanges } from './form-changes.tsx';
import { FormCheckboxField } from './form-checkbox-field.tsx';
import { Input } from './input.tsx';
import { Button } from './button.tsx';

afterEach(cleanup);
const schema = z
  .object({
    contact: z.object({ name: z.string().min(1, 'Vul een naam in.') }),
    accepted: z.boolean().refine((value) => value, 'Bevestig de keuze.'),
  })
  .strict();
const saved = { contact: { name: 'Anna' }, accepted: true };

function Example({ save }: { save: (values: z.output<typeof schema>) => Promise<unknown> }) {
  const form = useZodForm(schema, saved);
  return (
    <Form
      form={form}
      submitLabel="Opslaan"
      onSubmit={save}
      errorSummary={{
        title: 'Controleer invoer',
        fields: [
          { name: 'contact.name', label: 'Naam' },
          { name: 'accepted', label: 'Keuze' },
        ],
      }}
    >
      <FormField form={form} name="contact.name" label="Naam">
        {(field) => <Input {...field} />}
      </FormField>
      <FormCheckboxField form={form} name="accepted" label="Keuze" />
      <FormChanges form={form} message="Onopgeslagen wijzigingen" discardLabel="Wissen" focusOnDiscard="contact.name" />
      <Button
        onClick={() => {
          form.reset(form.getValues());
        }}
      >
        Als opgeslagen markeren
      </Button>
    </Form>
  );
}

test('samenvatting verschijnt pas na verzenden, focust overzicht en navigeert naar geneste velden en checkbox', async () => {
  const save = vi.fn(() => Promise.resolve());
  render(<Example save={save} />);
  const name = screen.getByLabelText('Naam');
  fireEvent.change(name, { target: { value: '' } });
  fireEvent.blur(name);
  await screen.findByText('Vul een naam in.');
  expect(screen.queryByText('Controleer invoer')).toBeNull();
  fireEvent.click(screen.getByLabelText('Keuze'));
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
  const heading = await screen.findByRole('heading', { name: 'Controleer invoer' });
  await waitFor(() => {
    expect(document.activeElement).toBe(heading.parentElement);
  });
  // Ook de door RHF uitgestelde foutfocus mag het overzicht niet weer verlaten.
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      }),
  );
  expect(document.activeElement).toBe(heading.parentElement);
  fireEvent.click(screen.getByRole('button', { name: 'Keuze: Bevestig de keuze.' }));
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByLabelText('Keuze'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Naam: Vul een naam in.' }));
  await waitFor(() => {
    expect(document.activeElement).toBe(name);
  });
  fireEvent.change(name, { target: { value: 'Bert' } });
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: 'Naam: Vul een naam in.' })).toBeNull();
  });
  expect(document.activeElement).toBe(name);
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Wissen' }));
  await waitFor(() => {
    expect(screen.queryByText('Controleer invoer')).toBeNull();
  });
});

test('dirty en reset volgen opgeslagen waarden; tijdens opslaan kan wissen geen invoer verwijderen', async () => {
  let finish: () => void = () => undefined;
  render(
    <Example
      save={() =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
      }
    />,
  );
  expect(screen.queryByRole('button', { name: 'Wissen' })).toBeNull();
  const name = screen.getByLabelText('Naam');
  fireEvent.change(name, { target: { value: 'Bert' } });
  await screen.findByText('Onopgeslagen wijzigingen');
  fireEvent.click(screen.getByRole('button', { name: 'Als opgeslagen markeren' }));
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: 'Wissen' })).toBeNull();
  });
  fireEvent.change(name, { target: { value: 'Carla' } });
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
  const discard = screen.getByRole('button', { name: 'Wissen' });
  await waitFor(() => {
    expect(discard.hasAttribute('disabled')).toBe(true);
  });
  fireEvent.click(discard);
  expect(screen.getByDisplayValue('Carla')).toBe(name);
  act(() => {
    finish();
  });
  await waitFor(() => {
    expect(discard.hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(discard);
  expect(screen.getByDisplayValue('Bert')).toBe(name);
  expect(screen.queryByText('Onopgeslagen wijzigingen')).toBeNull();
  await waitFor(() => {
    expect(document.activeElement).toBe(name);
  });
});
