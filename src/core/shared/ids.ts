import { z } from 'zod';
import { MAX_ID_LENGTH } from './limits.ts';

// Branded IDs (framework §4): een UserId is geen willekeurige string. Een app definieert eigen IDs in src/shared/ids.ts
// met brandedId() en zet de kolom in db/ids.json; pnpm db:generate zet $type<…>() in src/api/db/schema.ts.
export function brandedId<const Brand extends string>(brand: Brand) {
  return z.string().min(1).max(MAX_ID_LENGTH).brand(brand);
}

export const UserId = brandedId('UserId');
export type UserId = z.infer<typeof UserId>;
