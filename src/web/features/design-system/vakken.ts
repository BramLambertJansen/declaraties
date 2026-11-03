// De tabbladen van de catalogus, in deze volgorde (spec designsystem-toolbox). Het id staat in de zoekparameter `vak`.
export const vakken = [
  { id: 'basis', label: 'Basis' },
  { id: 'acties', label: 'Acties' },
  { id: 'formulieren', label: 'Formulieren' },
  { id: 'meldingen', label: 'Meldingen en status' },
  { id: 'gegevens', label: 'Gegevens tonen' },
  { id: 'layout', label: 'Navigatie en layout' },
  { id: 'patronen', label: 'Patronen' },
] as const;

export type VakId = (typeof vakken)[number]['id'];

const FIRST: VakId = 'basis';

// Een onbekende of ontbrekende waarde opent het eerste tabblad.
export function vakFrom(value: string | undefined): VakId {
  return vakken.find((vak) => vak.id === value)?.id ?? FIRST;
}

export function vakLabel(id: VakId): string {
  return vakken.find((vak) => vak.id === id)?.label ?? id;
}
