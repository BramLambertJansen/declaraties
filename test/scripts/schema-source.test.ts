import { describe, expect, test } from 'vitest';
import { renderSchema } from '../../scripts/db/schema-source.mjs';

// De generator van src/api/db/schema.ts (pnpm db:generate): catalogus → Drizzle-schema met branded IDs.
type Column = Parameters<typeof renderSchema>[0]['columns'][number];

function column(table: string, name: string, udt: string, extra: Partial<Column> = {}): Column {
  return {
    schema: 'public',
    table,
    name,
    udt,
    isArray: false,
    nullable: false,
    defaultExpr: null,
    identity: null,
    generatedExpr: null,
    length: null,
    precision: null,
    scale: null,
    ...extra,
  };
}

const userRoles = {
  columns: [
    column('user_roles', 'user_id', 'text'),
    column('user_roles', 'role', 'text'),
    column('user_roles', 'created_at', 'timestamptz', { defaultExpr: 'now()' }),
  ],
  primaryKeys: { 'public.user_roles': ['user_id'] },
  foreignKeys: [{ from: 'public.user_roles.user_id', to: 'better_auth.user.id' }],
};

describe('renderSchema', () => {
  test('user_roles: UserId via de foreign key naar better_auth, tijd als ISO-string, default als sql', () => {
    expect(renderSchema(userRoles, {})).toBe(
      [
        '// GEGENEREERD door `pnpm db:generate` (scripts/db-introspect.mjs) uit de gemigreerde database. Niet bewerken.',
        "import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';",
        "import { sql } from 'drizzle-orm';",
        "import type { UserId } from '#core/shared/ids.ts';",
        '',
        "export const userRoles = pgTable('user_roles', {",
        "  userId: text('user_id').$type<UserId>().primaryKey(),",
        "  role: text('role').notNull(),",
        "  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().default(sql`now()`),",
        '});',
        '',
      ].join('\n'),
    );
  });

  test('een id-kolom zonder brand faalt met de weg naar db/ids.json', () => {
    const notes = {
      columns: [column('notes', 'id', 'uuid'), column('notes', 'owner_id', 'text')],
      primaryKeys: { 'public.notes': ['id'] },
      foreignKeys: [{ from: 'public.notes.owner_id', to: 'better_auth.user.id' }],
    };

    expect(() => renderSchema(notes, {})).toThrow(/public\.notes\.id[\s\S]*db\/ids\.json/);
    const source = renderSchema(notes, { 'public.notes.id': 'NoteId' });
    expect(source).toContain("id: uuid('id').$type<NoteId>().primaryKey(),");
    expect(source).toContain("ownerId: text('owner_id').$type<UserId>().notNull(),");
    expect(source).toContain("import type { NoteId } from '#shared/ids.ts';");
  });

  test('een brand gaat via een keten van foreign keys mee; null in db/ids.json betekent bewust geen brand', () => {
    const catalog = {
      columns: [
        column('notes', 'id', 'uuid'),
        column('comments', 'id', 'int8', { identity: 'ALWAYS' }),
        column('comments', 'note_id', 'uuid'),
        column('comments', 'external_id', 'text', { nullable: true }),
      ],
      primaryKeys: { 'public.notes': ['id'], 'public.comments': ['id'] },
      foreignKeys: [{ from: 'public.comments.note_id', to: 'public.notes.id' }],
    };
    const source = renderSchema(catalog, {
      'public.notes.id': 'NoteId',
      'public.comments.id': 'CommentId',
      'public.comments.external_id': null,
    });

    expect(source).toContain("noteId: uuid('note_id').$type<NoteId>().notNull(),");
    expect(source).toContain(
      "id: bigint('id', { mode: 'number' }).$type<CommentId>().primaryKey().generatedAlwaysAsIdentity(),",
    );
    expect(source).toContain("externalId: text('external_id'),");
  });

  test('schema app, samengestelde primary key en arrays', () => {
    const catalog = {
      columns: [
        column('memberships', 'team_id', 'text', { schema: 'app' }),
        column('memberships', 'user_id', 'text', { schema: 'app' }),
        column('memberships', 'tags', 'text', { schema: 'app', isArray: true }),
      ],
      primaryKeys: { 'app.memberships': ['team_id', 'user_id'] },
      foreignKeys: [{ from: 'app.memberships.user_id', to: 'better_auth.user.id' }],
    };
    const source = renderSchema(catalog, { 'app.memberships.team_id': 'TeamId' });

    expect(source).toContain("const appSchema = pgSchema('app');");
    expect(source).toContain("export const appMemberships = appSchema.table('memberships', {");
    expect(source).toContain("tags: text('tags').array().notNull(),");
    expect(source).toContain('(table) => [primaryKey({ columns: [table.teamId, table.userId] })]');
    expect(source).not.toContain('pgTable');
  });

  test('een view wordt een bestaande Drizzle-view (alleen-lezen), met de brand uit db/ids.json', () => {
    const catalog = {
      columns: [
        column('accounts', 'id', 'text', { schema: 'app', isView: true, nullable: true }),
        column('accounts', 'name', 'text', { schema: 'app', isView: true, nullable: true }),
      ],
      primaryKeys: {},
      foreignKeys: [],
    };

    expect(() => renderSchema(catalog, {})).toThrow('app.accounts.id');
    const source = renderSchema(catalog, { 'app.accounts.id': 'UserId' });
    expect(source).toContain("export const appAccounts = appSchema.view('accounts', {");
    expect(source).toContain("id: text('id').$type<UserId>(),");
    expect(source).toContain('}).existing();');
  });

  test('timestamp zonder tijdzone en onbekende types falen hard', () => {
    const at = (udt: string) => ({
      columns: [column('t', 'at', udt)],
      primaryKeys: {},
      foreignKeys: [],
    });

    expect(() => renderSchema(at('timestamp'), {})).toThrow('gebruik timestamptz');
    expect(() => renderSchema(at('bytea'), {})).toThrow('type bytea wordt niet ondersteund');
  });

  test('regclass wordt text (tabelnaam als tekst), ook als primary key en nullable', () => {
    const catalog = {
      columns: [
        column('r', 'table_name', 'regclass', { schema: 'app' }),
        column('r', 'other', 'regclass', { schema: 'app', nullable: true }),
        column('r', 'third', 'regclass', { schema: 'app' }),
      ],
      primaryKeys: { 'app.r': ['table_name'] },
      foreignKeys: [],
    };
    const source = renderSchema(catalog, {});

    expect(source).toContain("tableName: text('table_name').primaryKey(),");
    expect(source).toContain("other: text('other'),");
    expect(source).toContain("third: text('third').notNull(),");
    expect(source).not.toContain('regclass');
    expect(source).toMatch(/import \{[^}]*\btext\b[^}]*\} from 'drizzle-orm\/pg-core';/);
  });

  test('interval wordt interval(name) zonder opties, nullable en not null, met default als sql', () => {
    const catalog = {
      columns: [
        column('t', 'keep', 'interval', { nullable: true }),
        column('t', 'ttl', 'interval'),
        column('t', 'grace', 'interval', { defaultExpr: "'1 day'::interval" }),
      ],
      primaryKeys: {},
      foreignKeys: [],
    };
    const source = renderSchema(catalog, {});

    expect(source).toContain("keep: interval('keep'),");
    expect(source).toContain("ttl: interval('ttl').notNull(),");
    expect(source).toContain("grace: interval('grace').notNull().default(sql`'1 day'::interval`),");
  });

  test('de importregel bevat interval alleen als een interval-kolom voorkomt', () => {
    const importLine = (source: string) =>
      source.split('\n').find((line) => line.includes('drizzle-orm/pg-core')) ?? '';
    const without = renderSchema(userRoles, {});
    const withInterval = renderSchema(
      { columns: [column('t', 'keep', 'interval')], primaryKeys: {}, foreignKeys: [] },
      {},
    );

    expect(importLine(without)).not.toMatch(/\binterval\b/);
    expect(importLine(withInterval)).toMatch(/\binterval\b/);
  });

  test('onbekende types (point, regproc) falen nog steeds met "wordt niet ondersteund"', () => {
    const at = (udt: string) => ({ columns: [column('t', 'x', udt)], primaryKeys: {}, foreignKeys: [] });

    expect(() => renderSchema(at('point'), {})).toThrow('type point wordt niet ondersteund');
    expect(() => renderSchema(at('regproc'), {})).toThrow('type regproc wordt niet ondersteund');
  });

  test('app.retention wordt volledig gerenderd (regclass-PK, nullable interval)', () => {
    const catalog = {
      columns: [
        column('retention', 'table_name', 'regclass', { schema: 'app' }),
        column('retention', 'time_column', 'text', { schema: 'app', nullable: true }),
        column('retention', 'keep', 'interval', { schema: 'app', nullable: true }),
        column('retention', 'purger', 'text', { schema: 'app' }),
        column('retention', 'reason', 'text', { schema: 'app' }),
      ],
      primaryKeys: { 'app.retention': ['table_name'] },
      foreignKeys: [],
    };
    const source = renderSchema(catalog, {});

    expect(source).toBe(
      [
        '// GEGENEREERD door `pnpm db:generate` (scripts/db-introspect.mjs) uit de gemigreerde database. Niet bewerken.',
        "import { interval, pgSchema, text } from 'drizzle-orm/pg-core';",
        '',
        "const appSchema = pgSchema('app');",
        '',
        "export const appRetention = appSchema.table('retention', {",
        "  tableName: text('table_name').primaryKey(),",
        "  timeColumn: text('time_column'),",
        "  keep: interval('keep'),",
        "  purger: text('purger').notNull(),",
        "  reason: text('reason').notNull(),",
        '});',
        '',
      ].join('\n'),
    );
    expect(source).toContain("import { interval, pgSchema, text } from 'drizzle-orm/pg-core';");
  });
});
