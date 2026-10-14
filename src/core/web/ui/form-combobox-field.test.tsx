import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../lib/api-client.ts';
import { useZodForm } from './form.tsx';
import { Button } from './button.tsx';
import { ErrorTextsProvider } from './error-texts.tsx';
import { Form } from './form.tsx';
import { FormComboboxField } from './form-combobox-field.tsx';

const schema = z.object({ role: z.string().min(1, 'Kies een rol.'), enabled: z.boolean() });
type Values = z.infer<typeof schema>;
afterEach(cleanup);

const options = [
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
];

function Example({ submit, initial = '' }: { submit: (values: Values) => Promise<unknown>; initial?: string }) {
  const form = useZodForm(schema, { role: initial, enabled: false });
  return (
    <Form
      form={form}
      onSubmit={submit}
      submitLabel="Versturen"
      fieldForCode={{ VALIDATION: 'role' }}
      secondaryAction={
        <Button
          onClick={() => {
            form.reset();
          }}
        >
          Reset
        </Button>
      }
    >
      <FormComboboxField form={form} name="role" label="Rol" options={options} description="Kies zorgvuldig." />
    </Form>
  );
}

function show(props: ComponentProps<typeof Example>) {
  render(
    <ErrorTextsProvider texts={{ VALIDATION: 'Ongeldig.' }}>
      <Example {...props} />
    </ErrorTextsProvider>,
  );
}

test('AC-5: touched koppelt fout en hulp; validatiefout focust native combobox', async () => {
  show({ submit: () => Promise.resolve() });
  const input = screen.getByRole('combobox', { name: 'Rol' });
  fireEvent.blur(input);
  const error = await screen.findByText('Kies een rol.');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')?.split(' ')).toStrictEqual([
    screen.getByText('Kies zorgvuldig.').id,
    error.id,
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  await waitFor(() => {
    expect(document.activeElement).toBe(input);
  });
});

test('AC-5: keuze wordt stringpayload en serverveldfout bewaart keuze en focus', async () => {
  const sent: Values[] = [];
  show({
    submit: (values) => {
      sent.push(values);
      return Promise.reject(new ApiError('VALIDATION', 400));
    },
  });
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole('option', { name: 'Beheerder' }));
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  const error = await screen.findByText('Ongeldig.');
  expect(sent).toStrictEqual([{ role: 'admin', enabled: false }]);
  expect(screen.getByDisplayValue('Beheerder')).toBe(input);
  expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
  await waitFor(() => {
    expect(document.activeElement).toBe(input);
  });
});

test('AC-5: reset herstelt label en verwerpt zoeken ook als gekozen waarde niet veranderde', () => {
  show({ initial: 'user', submit: () => Promise.resolve() });
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'beheer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByDisplayValue('Gebruiker')).toBe(input);
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole('option', { name: 'Beheerder' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByDisplayValue('Gebruiker')).toBe(input);
});

test('AC-5: adapter accepteert alleen stringvelden', () => {
  type Names = ComponentProps<typeof FormComboboxField<Values, Values>>['name'];
  expectTypeOf<Names>().toEqualTypeOf<'role'>();
});

function MissingDefault() {
  const form = useZodForm(schema, { enabled: false });
  return <FormComboboxField form={form} name="role" label="Rol" options={options} />;
}

test('AC-5: ontbrekende stringdefault faalt expliciet', () => {
  expect(() => render(<MissingDefault />)).toThrow(/string default value/);
});
