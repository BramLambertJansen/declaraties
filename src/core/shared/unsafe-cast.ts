// De enige uitweg uit het typesysteem (framework §4: type-assertions zijn verboden). De reden is verplicht en staat in de
// code-review; CI telt het aantal aanroepen (roadmap stuk 4). Gebruik eerst een zod-schema of een type guard.
export function unsafeCast<T>(value: unknown, reason: string): T;
export function unsafeCast(value: unknown, reason: string): unknown {
  if (reason.trim().length < 10) throw new Error('unsafeCast: geef een reden van minstens 10 tekens');
  return value;
}
