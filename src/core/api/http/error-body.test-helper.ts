import { z } from 'zod';

// Naar buiten gaat een fout alleen als `{ code, requestId }` (framework §6): strikt, dus geen extra velden zoals stack.
const errorBody = z.object({ code: z.string().min(1), requestId: z.string().min(1) }).strict();

export function parseErrorBody(value: unknown): z.infer<typeof errorBody> {
  return errorBody.parse(value);
}
