import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
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
