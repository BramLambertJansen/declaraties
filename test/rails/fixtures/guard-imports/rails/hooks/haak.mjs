import { dynamisch } from './lib/dynamisch.mjs';
import { kaal } from './lib/kaal.mjs';
// Lost op in de repo, maar de lader pakt alleen rails/hooks uit: op runtime ontbreekt dit bestand.
import { onbekend } from '../../scripts/kit/onbekend.mjs';

export const haak = [dynamisch, kaal, onbekend];
