// Zet de catalogus van de database om in src/api/db/schema.ts (Drizzle, met branded IDs). Puur: de introspectie
// staat in scripts/db-introspect.mjs, de tests in test/scripts/schema-source.test.ts. Alleen kolomtypes: foreign keys,
// checks en policies bewaakt de database zelf (pgTAP), niet het TypeScript-schema.

/**
 * @typedef {object} Column
 * @property {string} schema
 * @property {string} table
 * @property {string} name
 * @property {string} udt        udt_name uit information_schema (bij een array zonder de `_`)
 * @property {boolean} isArray
 * @property {boolean} nullable
 * @property {string | null} defaultExpr
 * @property {'ALWAYS' | 'BY DEFAULT' | null} identity
 * @property {string | null} generatedExpr
 * @property {number | null} length
 * @property {number | null} precision
 * @property {number | null} scale
 * @property {boolean} [isView]  kolom van een view: alleen-lezen, zonder primary key of default
 */

/**
 * @typedef {object} ForeignKey
 * @property {string} from  `schema.tabel.kolom`
 * @property {string} to    `schema.tabel.kolom`
 */

/**
 * @typedef {object} Catalog
 * @property {Column[]} columns
 * @property {Record<string, string[]>} primaryKeys  `schema.tabel` → kolommen
 * @property {ForeignKey[]} foreignKeys
 */

// IDs die core definieert (src/core/shared/ids.ts); de rest komt uit src/shared/ids.ts van de app.
const CORE_BRANDS = new Set(['UserId']);
// Better Auth is van core: zijn gebruikers-id is altijd een UserId. Een kolom die ernaar verwijst, erft dat.
const BUILT_IN = { 'better_auth.user.id': 'UserId' };

/** @param {string} name */
function camel(name) {
  return name.replace(/_([a-z0-9])/g, (_, letter) => String(letter).toUpperCase());
}

/** @param {string} value */
function quote(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/** @param {string} expr */
function sqlLiteral(expr) {
  if (expr.includes('`') || expr.includes('${')) throw new Error(`expressie niet in sql\`\` te zetten: ${expr}`);
  return `sql\`${expr}\``;
}

/** @param {Column} column  @returns {[builder: string, call: string]} */
function baseType(column) {
  const name = quote(column.name);
  switch (column.udt) {
    case 'text':
      return ['text', `text(${name})`];
    case 'varchar':
      return [
        'varchar',
        column.length === null ? `varchar(${name})` : `varchar(${name}, { length: ${String(column.length)} })`,
      ];
    case 'int2':
      return ['smallint', `smallint(${name})`];
    case 'int4':
      return ['integer', `integer(${name})`];
    // Centen en tellers passen in een JS-number tot 2^53 (framework §6: geld als gehele centen).
    case 'int8':
      return ['bigint', `bigint(${name}, { mode: 'number' })`];
    case 'numeric':
      return column.precision === null
        ? ['numeric', `numeric(${name})`]
        : [
            'numeric',
            `numeric(${name}, { precision: ${String(column.precision)}, scale: ${String(column.scale ?? 0)} })`,
          ];
    case 'float8':
      return ['doublePrecision', `doublePrecision(${name})`];
    case 'bool':
      return ['boolean', `boolean(${name})`];
    case 'uuid':
      return ['uuid', `uuid(${name})`];
    case 'jsonb':
      return ['jsonb', `jsonb(${name})`];
    // Tijd als ISO-string (framework §6), alleen timestamptz.
    case 'timestamptz':
      return ['timestamp', `timestamp(${name}, { withTimezone: true, mode: 'string' })`];
    case 'date':
      return ['date', `date(${name}, { mode: 'string' })`];
    // regclass (bijv. app.retention.table_name) is een tabelverwijzing; Drizzle kent het niet, tekst volstaat.
    // De tekstvorm volgt de search_path ('app.retention' of 'retention'): vergelijk in SQL, niet in TypeScript.
    case 'regclass':
      return ['text', `text(${name})`];
    case 'interval':
      return ['interval', `interval(${name})`];
    default:
      throw new Error(
        `${column.schema}.${column.table}.${column.name}: type ${column.udt} wordt niet ondersteund` +
          (column.udt === 'timestamp' ? ' (gebruik timestamptz, framework §6)' : '') +
          '; breid scripts/db/schema-source.mjs uit.',
      );
  }
}

/**
 * Brands per kolom: uit db/ids.json, plus alles wat via een foreign key naar een gebrande kolom verwijst. Een kolom `id`
 * of `*_id` zonder brand en zonder expliciete `null` in db/ids.json is een fout: een nieuwe tabel dwingt die keuze af.
 * @param {Catalog} catalog
 * @param {Record<string, string | null>} declared
 */
export function resolveBrands(catalog, declared) {
  /** @type {Map<string, string | null>} */
  const brands = new Map([...Object.entries(BUILT_IN), ...Object.entries(declared)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { from, to } of catalog.foreignKeys) {
      const brand = brands.get(to);
      if (brand !== undefined && brand !== null && !brands.has(from)) {
        brands.set(from, brand);
        changed = true;
      }
    }
  }
  const missing = catalog.columns
    .map((column) => `${column.schema}.${column.table}.${column.name}`)
    .filter((key) => /^(id|.+_id)$/.test(key.split('.')[2] ?? '') && !brands.has(key));
  if (missing.length > 0) {
    throw new Error(
      `Kolommen zonder branded ID: ${missing.join(', ')}.\n` +
        '  → zet ze in db/ids.json ("schema.tabel.kolom": "NaamId", of null met reden in de PR) en definieer het ID met\n' +
        '    brandedId() in src/shared/ids.ts.',
    );
  }
  return brands;
}

/**
 * @param {Column} column
 * @param {Map<string, string | null>} brands
 * @param {string[]} primaryKey
 * @param {Set<string>} imports
 */
function renderColumn(column, brands, primaryKey, imports) {
  const [builder, call] = baseType(column);
  imports.add(builder);
  let out = call;
  if (column.isArray) out += '.array()';
  const brand = brands.get(`${column.schema}.${column.table}.${column.name}`);
  if (brand !== undefined && brand !== null) out += `.$type<${brand}${column.isArray ? '[]' : ''}>()`;
  if (primaryKey.length === 1 && primaryKey[0] === column.name) out += '.primaryKey()';
  else if (!column.nullable) out += '.notNull()';
  if (column.identity === 'ALWAYS') out += '.generatedAlwaysAsIdentity()';
  else if (column.identity === 'BY DEFAULT') out += '.generatedByDefaultAsIdentity()';
  else if (column.generatedExpr !== null) out += `.generatedAlwaysAs(${sqlLiteral(column.generatedExpr)})`;
  else if (column.defaultExpr !== null) out += `.default(${sqlLiteral(column.defaultExpr)})`;
  return `  ${camel(column.name)}: ${out},`;
}

/** @param {string} schema @param {string} table */
function exportName(schema, table) {
  return camel(schema === 'public' ? table : `${schema}_${table}`);
}

/**
 * @param {Catalog} catalog
 * @param {Record<string, string | null>} declared  inhoud van db/ids.json (`brands`)
 * @returns {string}
 */
export function renderSchema(catalog, declared) {
  const brands = resolveBrands(catalog, declared);
  /** @type {Map<string, Column[]>} */
  const tables = new Map();
  for (const column of catalog.columns) {
    const key = `${column.schema}.${column.table}`;
    tables.set(key, [...(tables.get(key) ?? []), column]);
  }
  /** @type {Set<string>} */
  const imports = new Set();
  const schemas = new Set();
  const names = new Set();
  const blocks = [...tables.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, columns]) => {
      const [schema = '', table = ''] = key.split('.');
      const name = exportName(schema, table);
      if (names.has(name)) throw new Error(`twee tabellen geven dezelfde exportnaam ${name}`);
      names.add(name);
      const primaryKey = catalog.primaryKeys[key] ?? [];
      const body = columns.map((column) => renderColumn(column, brands, primaryKey, imports)).join('\n');
      const composite =
        primaryKey.length > 1
          ? `, (table) => [primaryKey({ columns: [${primaryKey.map((c) => `table.${camel(c)}`).join(', ')}] })]`
          : '';
      if (composite !== '') imports.add('primaryKey');
      // Een view (bijv. app.accounts) wordt een bestaande Drizzle-view: alleen-lezen, de database levert de definitie.
      const isView = columns[0]?.isView === true;
      const kind = isView ? 'view' : 'table';
      const factory = schema === 'public' ? (isView ? 'pgView' : 'pgTable') : `${camel(schema)}Schema.${kind}`;
      if (schema === 'public') imports.add(isView ? 'pgView' : 'pgTable');
      else schemas.add(schema);
      return `export const ${name} = ${factory}(${quote(table)}, {\n${body}\n}${composite})${isView ? '.existing()' : ''};`;
    });
  if (schemas.size > 0) imports.add('pgSchema');

  const used = new Set(
    [...brands.values()].flatMap((brand) =>
      brand !== null && blocks.some((b) => b.includes(`<${brand}`)) ? [brand] : [],
    ),
  );
  const core = [...used].filter((brand) => CORE_BRANDS.has(brand)).sort();
  const app = [...used].filter((brand) => !CORE_BRANDS.has(brand)).sort();
  const needsSql = blocks.some((block) => block.includes('sql`'));
  return [
    '// GEGENEREERD door `pnpm db:generate` (scripts/db-introspect.mjs) uit de gemigreerde database. Niet bewerken.',
    `import { ${[...imports].sort().join(', ')} } from 'drizzle-orm/pg-core';`,
    ...(needsSql ? ["import { sql } from 'drizzle-orm';"] : []),
    ...(core.length > 0 ? [`import type { ${core.join(', ')} } from '#core/shared/ids.ts';`] : []),
    ...(app.length > 0 ? [`import type { ${app.join(', ')} } from '#shared/ids.ts';`] : []),
    '',
    ...[...schemas].sort().map((schema) => `const ${camel(schema)}Schema = pgSchema(${quote(schema)});\n`),
    blocks.join('\n\n'),
    '',
  ].join('\n');
}
