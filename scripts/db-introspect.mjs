// Leest de catalogus van de gemigreerde test-database en schrijft het Drizzle-schema naar de uitvoermap van de runner.
// Draait alleen in de runner (scripts/runner.sh gen, via pnpm db:generate); scripts/db-generate.sh zet het daarna op zijn plek.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import prettier from 'prettier';
import { renderSchema } from './db/schema-source.mjs';

const TARGET = 'src/api/db/schema.ts';
const url = process.env['MIGRATOR_DATABASE_URL'];
const outputDir = process.env['RUNNER_OUTPUT_DIR'];
if (url === undefined || outputDir === undefined) {
  console.error('db-introspect: alleen in de runner (MIGRATOR_DATABASE_URL en RUNNER_OUTPUT_DIR ontbreken)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows: columns } = await client.query(`
    select c.table_schema as schema, c.table_name as "table", c.column_name as name,
           case when c.data_type = 'ARRAY' then substr(c.udt_name, 2) else c.udt_name end as udt,
           c.data_type = 'ARRAY' as "isArray", c.is_nullable = 'YES' as nullable,
           c.column_default as "defaultExpr",
           case when c.is_identity = 'YES' then c.identity_generation end as identity,
           case when c.is_generated = 'ALWAYS' then c.generation_expression end as "generatedExpr",
           c.character_maximum_length as length, c.numeric_precision as precision, c.numeric_scale as scale,
           t.table_type = 'VIEW' as "isView"
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema in ('public', 'app') and t.table_type in ('BASE TABLE', 'VIEW')
      and not (c.table_schema = 'public' and c.table_name = 'schema_migrations')
    order by c.table_schema, c.table_name, c.ordinal_position`);
  const { rows: keys } = await client.query(`
    select n.nspname || '.' || t.relname as "table", array_agg(a.attname::text order by k.ord) as columns
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class t on t.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    cross join lateral unnest(con.conkey) with ordinality k (attnum, ord)
    join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
    where con.contype = 'p' and n.nspname in ('public', 'app')
    group by 1`);
  const { rows: foreignKeys } = await client.query(`
    select fn.nspname || '.' || ft.relname || '.' || fa.attname as "from",
           tn.nspname || '.' || tt.relname || '.' || ta.attname as "to"
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class ft on ft.oid = con.conrelid
    join pg_catalog.pg_namespace fn on fn.oid = ft.relnamespace
    join pg_catalog.pg_class tt on tt.oid = con.confrelid
    join pg_catalog.pg_namespace tn on tn.oid = tt.relnamespace
    cross join lateral unnest(con.conkey, con.confkey) k (fattnum, tattnum)
    join pg_catalog.pg_attribute fa on fa.attrelid = ft.oid and fa.attnum = k.fattnum
    join pg_catalog.pg_attribute ta on ta.attrelid = tt.oid and ta.attnum = k.tattnum
    where con.contype = 'f' and fn.nspname in ('public', 'app')
    order by 1, 2`);

  const ids = JSON.parse(await readFile('db/ids.json', 'utf8'));
  const source = renderSchema(
    { columns, primaryKeys: Object.fromEntries(keys.map((row) => [row.table, row.columns])), foreignKeys },
    ids.brands,
  );
  const options = await prettier.resolveConfig(TARGET);
  const formatted = await prettier.format(source, { ...options, filepath: TARGET });
  await mkdir(path.join(outputDir, 'gen'), { recursive: true });
  await writeFile(path.join(outputDir, 'gen', 'schema.ts'), formatted);
  console.log(`✓ ${TARGET}: ${String(new Set(columns.map((c) => `${c.schema}.${c.table}`)).size)} tabel(len)`);
} finally {
  await client.end();
}
