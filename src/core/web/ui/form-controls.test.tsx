import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../lib/api-client.ts';
import { Button } from './button.tsx';
import { Checkbox } from './checkbox.tsx';
import { ErrorTextsProvider } from './error-texts.tsx';
import { FormCheckboxField } from './form-checkbox-field.tsx';
import { FormRadioGroupField } from './form-radio-group-field.tsx';
import { Form, FormField, useZodForm } from './form.tsx';
import { Input } from './input.tsx';
import { Select } from './select.tsx';
import { Textarea } from './textarea.tsx';

afterEach(cleanup);
const schema = z
  .object({ name: z.string().min(1, 'Vul een naam in.'), notifications: z.boolean(), role: z.enum(['user', 'admin']) })
  .strict();
type Values = z.output<typeof schema>;
const options = [
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
];

function Example({ submit, target = 'name' }: { submit: (values: Values) => Promise<unknown>; target?: keyof Values }) {
  const form = useZodForm(schema, { name: '', notifications: false, role: 'user' });
  return (
    <Form
      form={form}
      onSubmit={submit}
      submitLabel="Versturen"
      fieldForCode={{ VALIDATION: target }}
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
      <FormField form={form} name="name" label="Naam" description="Uitleg">
        {(field) => <Textarea {...field} />}
      </FormField>
      <FormCheckboxField form={form} name="notifications" label="Meldingen" description="Boolean" />
      <FormRadioGroupField form={form} name="role" label="Rol" options={options} description="Keuze" />
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

// ui-kit-basics/AC-2, ui-kit-basics/AC-3, ui-kit-basics/AC-4
test('AC-2/3/4: tekst, boolean en radio behouden hun waarde in payload en reset', async () => {
  const sent: Values[] = [];
  show({
    submit: (values) => {
      sent.push(values);
      return Promise.resolve();
    },
  });
  fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Ada\nLovelace' } });
  fireEvent.click(screen.getByText('Meldingen'));
  fireEvent.click(screen.getByLabelText('Beheerder'));
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  await waitFor(() => {
    expect(sent).toStrictEqual([{ name: 'Ada\nLovelace', notifications: true, role: 'admin' }]);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByLabelText('Naam').getAttribute('aria-invalid')).toBe('false');
  expect(screen.getByLabelText('Naam').textContent).toBe('');
  expect(screen.getByRole('checkbox', { checked: false })).toBeDefined();
  expect(screen.getByRole('radio', { name: 'Gebruiker', checked: true })).toBeDefined();
  expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
});

// ui-kit-basics/AC-2
test('AC-2: touched-validatie koppelt hulp en fout aan de textarea', async () => {
  show({ submit: () => Promise.resolve() });
  const input = screen.getByLabelText('Naam');
  fireEvent.blur(input);
  const error = await screen.findByText('Vul een naam in.');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')?.split(' ')).toStrictEqual([screen.getByText('Uitleg').id, error.id]);
});

// ui-kit-basics/AC-2, ui-kit-basics/AC-3
test.each<keyof Values>(['name', 'notifications', 'role'])(
  'serverfout focust %s en blijft gekoppeld na herstel',
  async (target) => {
    show({ target, submit: () => Promise.reject(new ApiError('VALIDATION', 400)) });
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
    const error = await screen.findByText('Ongeldig.');
    const anchor = screen.getByLabelText(
      target === 'name' ? 'Naam' : target === 'notifications' ? 'Meldingen' : 'Gebruiker',
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(anchor);
    });
    expect(anchor.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(anchor.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('button', { name: 'Versturen' }).hasAttribute('disabled')).toBe(false);
  },
);

// ui-kit-basics/AC-3
test('AC-3: native disabled checkbox bewaart zijn waarde', () => {
  render(<Checkbox label="Meldingen" disabled defaultChecked />);
  const checkbox = screen.getByRole('checkbox', { checked: true });
  expect(checkbox.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByText('Meldingen'));
  expect(screen.getByRole('checkbox', { checked: true })).toBe(checkbox);
});

// ui-kit-basics/AC-5
test('AC-5: namen volgen het echte veldtype, inclusief enum-string', () => {
  type StringNames = ComponentProps<typeof FormField<Values, Values>>['name'];
  type BooleanNames = ComponentProps<typeof FormCheckboxField<Values, Values>>['name'];
  type RadioNames = ComponentProps<typeof FormRadioGroupField<Values, Values>>['name'];
  expectTypeOf<StringNames>().toEqualTypeOf<'name' | 'role'>();
  expectTypeOf<BooleanNames>().toEqualTypeOf<'notifications'>();
  expectTypeOf<RadioNames>().toEqualTypeOf<'name' | 'role'>();
});

const requiredSchema = z.object({
  notifications: z.boolean().refine(Boolean, 'Kies meldingen.'),
  role: z.string().refine((role) => role === 'user' || role === 'admin', 'Kies een rol.'),
});

function RequiredExample({ submit }: { submit: () => Promise<unknown> }) {
  const form = useZodForm(requiredSchema, { notifications: false, role: '' });
  return (
    <Form form={form} onSubmit={submit} submitLabel="Versturen">
      <FormCheckboxField form={form} name="notifications" label="Meldingen" />
      <FormRadioGroupField form={form} name="role" label="Rol" options={options} />
    </Form>
  );
}

// ui-kit-basics/AC-3, ui-kit-basics/AC-4
test('AC-3/4: schemafouten blokkeren submit; radio kiest niet impliciet een eerste optie', async () => {
  let calls = 0;
  render(
    <ErrorTextsProvider texts={{}}>
      <RequiredExample
        submit={() => {
          calls += 1;
          return Promise.resolve();
        }}
      />
    </ErrorTextsProvider>,
  );
  expect(screen.queryByRole('radio', { checked: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  const error = await screen.findByText('Kies een rol.');
  expect(await screen.findByText('Kies meldingen.')).toBeDefined();
  expect(calls).toBe(0);
  expect(screen.getByRole('radio', { name: 'Gebruiker' }).getAttribute('aria-describedby')).toBe(error.id);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('radio', { name: 'Gebruiker' }));
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  await waitFor(() => {
    expect(calls).toBe(1);
  });
});

function MissingDefault() {
  const form = useZodForm(schema, { notifications: false, role: 'user' });
  return (
    <FormField form={form} name="name" label="Naam">
      {(field) => <Textarea {...field} />}
    </FormField>
  );
}

// ui-kit-basics/AC-5
test('AC-5: ontbrekende stringdefault veroorzaakt een assertion in plaats van een stille lege waarde', () => {
  expect(() => render(<MissingDefault />)).toThrow('FormField requires a string default value');
});

function Legacy({ submit }: { submit: (values: Values) => Promise<unknown> }) {
  const form = useZodForm(schema, { name: 'Ada', role: 'user', notifications: false });
  return (
    <Form
      form={form}
      onSubmit={submit}
      submitLabel="Versturen"
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
      <FormField form={form} name="name" label="Naam">
        {(field) => <Input {...field} />}
      </FormField>
      <FormField form={form} name="role" label="Rol">
        {(field) => <Select {...field} options={options} />}
      </FormField>
    </Form>
  );
}

// ui-kit-basics/AC-1
test('AC-1: bestaande Input/Select-binding blijft submit en reset ondersteunen', async () => {
  const sent: Values[] = [];
  render(
    <ErrorTextsProvider texts={{}}>
      <Legacy
        submit={(values) => {
          sent.push(values);
          return Promise.resolve();
        }}
      />
    </ErrorTextsProvider>,
  );
  fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Grace' } });
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'admin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  await waitFor(() => {
    expect(sent).toStrictEqual([{ name: 'Grace', role: 'admin', notifications: false }]);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByDisplayValue('Ada')).toBeDefined();
  expect(screen.getByDisplayValue('Gebruiker')).toBeDefined();
});
