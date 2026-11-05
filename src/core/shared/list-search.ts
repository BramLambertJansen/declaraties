import { z } from 'zod';
import { assert } from './assert.ts';
import { encodeCursor, maxCursorLength } from './cursor.ts';
import { MAX_CURSOR_LENGTH, MAX_SEARCH_LENGTH } from './limits.ts';
import { unsafeCast } from './unsafe-cast.ts';

// Gedeeld zoekschema voor lijstpagina's (spec lijstpagina): één definitie, strict voor de API (ongeldig → VALIDATION) en
// met `.catch()` per veld voor `validateSearch` (ongeldig → standaardwaarde, geen foutpagina).
type Options = readonly [string, ...string[]];

// Per sortering de maximale UTF-16-lengte van elk sleuteldeel na de sorteernaam (spec lijstpagina, sleutelbudget, leerpunt #444).
type KeyLengths = readonly [number, ...number[]];

export interface ListSearchConfig {
  readonly sorts: Options;
  readonly filters: Readonly<Record<string, Options>>;
  readonly cursorKeys: Readonly<Record<string, KeyLengths>>;
}

// Precies één entry per sortering: een ontbrekende of extra sleutel is een typefout.
type CheckedConfig<Config extends ListSearchConfig> = Config & {
  readonly cursorKeys: { readonly [Sort in Config['sorts'][number]]: KeyLengths } & {
    readonly [Key in Exclude<keyof Config['cursorKeys'], Config['sorts'][number]>]: never;
  };
};

type EnumOf<Values extends Options> = z.ZodEnum<{ [Value in Values[number]]: Value }>;

// De API-input is een echt `ZodObject` (strict), zodat `defineContract` hem als input accepteert.
type ApiShape<Config extends ListSearchConfig> = {
  readonly q: z.ZodOptional<z.ZodString>;
  readonly sort: z.ZodDefault<EnumOf<Config['sorts']>>;
  readonly cursor: z.ZodOptional<z.ZodString>;
} & { readonly [Key in keyof Config['filters']]: z.ZodOptional<EnumOf<Config['filters'][Key]>> };

type FilterValues<Config extends ListSearchConfig> = {
  readonly [Key in keyof Config['filters']]?: Config['filters'][Key][number];
};

// Web: de standaardsortering staat niet in de URL.
export type ListSearchWeb<Config extends ListSearchConfig> = FilterValues<Config> & {
  readonly q?: string;
  readonly sort?: Config['sorts'][number];
};

export interface ListSearch<Config extends ListSearchConfig> {
  readonly api: z.ZodObject<ApiShape<Config>, z.core.$strict>;
  readonly web: z.ZodType<ListSearchWeb<Config>>;
  readonly defaultSort: Config['sorts'][number];
  readonly cursorKeys: Config['cursorKeys'];
  // Cursor uit de sorteersleutel; het aantal delen volgt `cursorKeys` (anders AssertionError → INTERNAL_ERROR).
  readonly encodeCursor: (sort: Config['sorts'][number], parts: readonly string[]) => string;
}

const RESERVED_KEYS = ['q', 'sort', 'cursor'];

function withoutUndefined<Values extends Record<string, unknown>>(values: Values): Values {
  return unsafeCast(
    Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
    'alleen sleutels met de waarde undefined vallen weg',
  );
}

// Getrimd, leeg = weg. Te lang is een fout; `.catch()` aan de webkant maakt er "weg" van.
const query = z
  .string()
  .trim()
  .max(MAX_SEARCH_LENGTH)
  .transform((value) => (value === '' ? undefined : value));

// TanStack Router leest `2026` als getal en `true` als boolean; gedeelde URL’s moeten hun tekstwaarden houden.
function webValue(value: unknown): unknown {
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
}

const webQuery = z.preprocess(webValue, query);

// Weigert bij het laden van het contract een sortering waarvan de cursor langer dan MAX_CURSOR_LENGTH kan worden, zodat dat
// niet pas in productie een INTERNAL_ERROR uit `encodeCursor` geeft (spec lijstpagina/AC-13, AC-14).
function checkCursorKeys(sorts: Options, cursorKeys: unknown): ReadonlyMap<string, number> {
  if (typeof cursorKeys !== 'object' || cursorKeys === null) throw new Error('defineListSearch: cursorKeys ontbreekt');
  const entries = new Map<string, unknown>(Object.entries(cursorKeys));
  const extra = [...entries.keys()].find((key) => !sorts.includes(key));
  if (extra !== undefined) throw new Error(`defineListSearch: cursorKeys.${extra} is geen sortering`);
  const parts = new Map<string, number>();
  for (const sort of sorts) {
    const lengths = entries.get(sort);
    if (!Array.isArray(lengths) || lengths.length === 0) {
      throw new Error(`defineListSearch: cursorKeys.${sort} ontbreekt of is leeg`);
    }
    if (!lengths.every((length) => Number.isInteger(length) && Number(length) >= 0)) {
      throw new Error(`defineListSearch: cursorKeys.${sort} bevat een lengte die geen geheel getal ≥ 0 is`);
    }
    const budget = maxCursorLength([sort.length, ...lengths.map(Number)]);
    if (budget > MAX_CURSOR_LENGTH) {
      throw new Error(
        `defineListSearch: de cursor van sortering '${sort}' kan ${String(budget)} tekens worden, meer dan MAX_CURSOR_LENGTH (${String(MAX_CURSOR_LENGTH)})`,
      );
    }
    parts.set(sort, lengths.length);
  }
  return parts;
}

export function defineListSearch<const Config extends ListSearchConfig>(
  config: CheckedConfig<Config>,
): ListSearch<Config> {
  const defaultSort = config.sorts[0];
  const filterEntries = Object.entries(config.filters);
  const reserved = filterEntries.find(([key]) => RESERVED_KEYS.includes(key));
  if (reserved) throw new Error(`defineListSearch: filter '${reserved[0]}' botst met een vast veld`);
  const keyParts = checkCursorKeys(config.sorts, config.cursorKeys);
  const apiShape = {
    q: query.optional(),
    ...Object.fromEntries(filterEntries.map(([key, values]) => [key, z.enum(values).optional()])),
    sort: z.enum(config.sorts).default(defaultSort),
    cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
  };
  const webShape = {
    q: webQuery.optional().catch(undefined),
    ...Object.fromEntries(
      filterEntries.map(([key, values]) => [key, z.preprocess(webValue, z.enum(values)).optional().catch(undefined)]),
    ),
    sort: z.preprocess(webValue, z.enum(config.sorts)).catch(defaultSort),
  };
  // `overwrite` houdt het een `ZodObject`; het haalt de lege `q` (undefined na de transform) uit de uitvoer.
  const api = z.object(apiShape).strict().overwrite(withoutUndefined);
  const web = z
    .object(webShape)
    .transform((values) =>
      withoutUndefined({ ...values, sort: values.sort === defaultSort ? undefined : values.sort }),
    );
  return {
    api: unsafeCast(api, 'het schema is uit de config opgebouwd; het type beschrijft hetzelfde schema'),
    web: unsafeCast(web, 'het schema is uit de config opgebouwd; de types volgen die config'),
    defaultSort,
    cursorKeys: config.cursorKeys,
    encodeCursor: (sort, parts) => {
      const expected = keyParts.get(sort);
      assert(
        parts.length === expected,
        `cursor voor sortering '${sort}' heeft ${String(parts.length)} sleuteldelen, cursorKeys geeft er ${String(expected)}`,
      );
      return encodeCursor([sort, ...parts]);
    },
  };
}
