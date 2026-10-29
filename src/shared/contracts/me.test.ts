import { describe, expect, test } from 'vitest';
import { MAX_NAME_LENGTH } from '../limits.ts';
import { renameInput } from './me.ts';

// Spec eigen-account: de naam, met de grens uit limits.ts.
describe('renameInput', () => {
  test('een naam wordt getrimd', () => {
    expect(renameInput.parse({ naam: '  Ada Lovelace ' })).toStrictEqual({ naam: 'Ada Lovelace' });
  });

  test('leeg of alleen spaties: "Vul een naam in."', () => {
    expect(renameInput.safeParse({ naam: '  ' }).error?.issues[0]?.message).toBe('Vul een naam in.');
  });

  test('precies MAX_NAME_LENGTH mag; één meer: "Hooguit 100 tekens."', () => {
    expect(renameInput.safeParse({ naam: 'a'.repeat(MAX_NAME_LENGTH) }).success).toBe(true);
    expect(renameInput.safeParse({ naam: 'a'.repeat(MAX_NAME_LENGTH + 1) }).error?.issues[0]?.message).toBe(
      'Hooguit 100 tekens.',
    );
  });

  test('geen andere velden (image, id): strict', () => {
    expect(renameInput.safeParse({ naam: 'Ada', image: 'x' }).success).toBe(false);
    expect(renameInput.safeParse({ naam: 'Ada', id: 'ander' }).success).toBe(false);
  });
});
