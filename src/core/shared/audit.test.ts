import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { defineAuditActions } from './audit.ts';

// defineAuditActions (spec audit-log AC-28, ADR 0021 punt 5): het registratiepatroon van defineErrorCodes. Een app registreert
// eigen acties zonder core te wijzigen; een fout in de registratie gooit bij het aanmaken, dus bij het opstarten.
const details = z.object({ reason: z.string() });

describe('defineAuditActions (uitbreidingsplek, ADR 0008)', () => {
  test('een app registreert acties met een doeltype en een details-schema', () => {
    const actions = defineAuditActions({
      'note.archive': { target: 'note', details },
      'note.sub_item.restore': { target: 'note_item', details },
    });

    expect(Object.keys(actions)).toStrictEqual(['note.archive', 'note.sub_item.restore']);
    expect(actions['note.archive'].target).toBe('note');
  });

  test('een lege registratie is geldig (de template registreert geen app-acties)', () => {
    expect(Object.keys(defineAuditActions({}))).toStrictEqual([]);
  });

  test.each(['core.x.y', 'core.account.invite', 'core.note.archive'])(
    'weigert de sleutel %j: het voorvoegsel core. is van core',
    (key) => {
      expect(() => defineAuditActions({ [key]: { target: 'note', details } })).toThrow();
    },
  );

  test.each([
    'note',
    'Note.archive',
    'note.Archive',
    'note.archive2',
    'note..archive',
    'note.archive.',
    '.note.archive',
    'note-x.archive',
    'note.archive-all',
    '',
  ])('weigert de sleutel %j: buiten het patroon ^[a-z]+(\\.[a-z_]+)+$', (key) => {
    expect(() => defineAuditActions({ [key]: { target: 'note', details } })).toThrow();
  });

  test.each(['account', 'Note', 'note-item', 'note item', 'note1', ''])(
    'weigert het doeltype %j: account is van core, de rest valt buiten ^[a-z_]+$',
    (target) => {
      expect(() => defineAuditActions({ 'note.archive': { target, details } })).toThrow();
    },
  );

  test('details wordt strict geparsed: een onbekende sleutel faalt', () => {
    const actions = defineAuditActions({ 'note.archive': { target: 'note', details } });

    expect(actions['note.archive'].details.parse({ reason: 'dubbel' })).toStrictEqual({ reason: 'dubbel' });
    expect(() => actions['note.archive'].details.parse({ reason: 'dubbel', extra: 1 })).toThrow();
  });
});
