import { twMerge } from 'tailwind-merge';

// Klassen samenvoegen; bij een conflict wint de laatste (een className van de app boven de basis van het recept).
export function cn(...classes: readonly (string | false | null | undefined)[]): string {
  return twMerge(classes.filter((value) => typeof value === 'string' && value !== '').join(' '));
}
