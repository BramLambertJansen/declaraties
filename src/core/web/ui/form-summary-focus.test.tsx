import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../lib/api-client.ts';
import { Form, FormField, useZodForm } from './form.tsx';
import { Input } from './input.tsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const schema = z.object({ name: z.string().min(1, 'Vul een naam in.') }).strict();

function Example() {
  const form = useZodForm(schema, { name: '' });
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

test('de uitgestelde RHF-foutfocus eindigt op het overzicht, ook als timers pas na React-effects lopen', async () => {
  vi.useFakeTimers();
  render(<Example />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await Promise.resolve();
  });
  const summary = screen.getByRole('heading', { name: 'Controleer de invoer' }).parentElement;
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
  expect(document.activeElement).toBe(summary);
});

function ServerErrorExample() {
  const form = useZodForm(schema, { name: 'Ada' });
  return (
    <Form
      form={form}
      onSubmit={() => Promise.reject(new ApiError('VALIDATION', 400))}
      submitLabel="Opslaan"
      fieldForCode={{ VALIDATION: 'name' }}
      errorSummary={{ title: 'Controleer de invoer', fields: [{ name: 'name', label: 'Naam' }] }}
    >
      <FormField form={form} name="name" label="Naam">
        {(field) => <Input {...field} />}
      </FormField>
    </Form>
  );
}

test('een serverveldfout na een geldige verzending focust het overzicht', async () => {
  vi.useFakeTimers();
  render(<ServerErrorExample />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    await Promise.resolve();
  });
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
  const summary = screen.getByRole('heading', { name: 'Controleer de invoer' }).parentElement;
  expect(document.activeElement).toBe(summary);
});
