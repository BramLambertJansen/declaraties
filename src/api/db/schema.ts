// GEGENEREERD door `pnpm db:generate` (scripts/db-introspect.mjs) uit de gemigreerde database. Niet bewerken.
import { integer, pgSchema, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { UserId } from '#core/shared/ids.ts';

const appSchema = pgSchema('app');

export const appAccounts = appSchema
  .view('accounts', {
    id: text('id').$type<UserId>(),
    name: text('name'),
    email: text('email'),
    role: text('role'),
    status: text('status'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }),
  })
  .existing();

export const appRateLimits = appSchema.table('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'string' }).notNull(),
  hits: integer('hits').notNull(),
});

export const userRoles = pgTable('user_roles', {
  userId: text('user_id').$type<UserId>().primaryKey(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .default(sql`now()`),
});
