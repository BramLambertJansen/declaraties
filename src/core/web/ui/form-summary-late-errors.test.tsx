import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { Form, FormField, useZodForm } from './form.tsx';
import { Input } from './input.tsx';

const schema = z.object({ name: z.string().min(1, 'Vul een naam in.') }).strict();
type Values = z.output<typeof schema>;
type State = UseFormReturn<Values, unknown, Values>;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Example({ ready }: { readonly ready: (form: State) => void }) {
  const form = useZodForm(schema, { name: 'Ada' });
  useEffect(() => {
    ready(form);
  }, [form, ready]);
  return (
    <Form
      form={form}
      onSubmit={() => Promise.resolve()}
      submitLabel="Opslaan"
      errorSummary={{ title: 'Controleer de invoer', fields: [{ name: 'name', label: 'Naam' }] }}
    >
      <FormField form={form} name="name" label="Naam">
        {(field) => <Input {...field} />}
      </FormField>
    </Form>
  );
}

test.each([
  { criterion: 'latere-serverveldfouten/AC-1', type: 'server', shouldFocusSummary: true },
  { criterion: 'latere-serverveldfouten/AC-2', type: 'manual', shouldFocusSummary: false },
])('$criterion: latere veldfout na geldige clientvalidatie: $type', async ({ type, shouldFocusSummary }) => {
  vi.useFakeTimers();
  let form: State | undefined;
  render(
    <Example
      ready={(value) => {
        form = value;
      }}
    />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await Promise.resolve();
  });
  expect(screen.queryByRole('heading', { name: 'Controleer de invoer' })).toBeNull();
  const input = screen.getByLabelText('Naam');
  input.focus();
  act(() => {
    if (form === undefined) throw new Error('Formulier ontbreekt');
    form.setError('name', { type, message: 'Naam is niet beschikbaar' });
  });
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
  const summary = screen.getByRole('heading', { name: 'Controleer de invoer' }).parentElement;
  expect(document.activeElement).toBe(shouldFocusSummary ? summary : input);
});
