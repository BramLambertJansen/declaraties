import { z } from 'zod';

// Bedragen in gehele centen (framework §5); nooit floats. zod 4: int() accepteert alleen veilige gehele getallen. Formatteren alleen via lib/format.ts (stuk 3b).
export const Cents = z.number().int().brand('Cents');
export type Cents = z.infer<typeof Cents>;

export function cents(value: number): Cents {
  return Cents.parse(value);
}
