import { z } from 'zod';
import { MAX_SEARCH_LENGTH } from './limits.ts';
import { unsafeCast } from './unsafe-cast.ts';

// Gedeeld zoekschema voor lijstpagina's (spec lijstpagina): één definitie, strict voor de API (ongeldig → VALIDATION) en
// met `.catch()` per veld voor `validateSearch` (ongeldig → standaardwaarde, geen foutpagina).
type Options = readonly [string, ...string[]];

export interface ListSearchConfig {
  readonly sorts: Options;
  readonly filters: Readonly<Record<string, Options>>;
}

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
}

const MAX_CURSOR_LENGTH = 500;
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

// TanStack Router parset `?q=2026` tot een getal; een met de hand gedeelde URL moet zijn zoekterm houden.
const webQuery = z.preprocess((value) => (typeof value === 'number' ? String(value) : value), query);

export function defineListSearch<const Config extends ListSearchConfig>(config: Config): ListSearch<Config> {
  const defaultSort = config.sorts[0];
  const filterEntries = Object.entries(config.filters);
  const reserved = filterEntries.find(([key]) => RESERVED_KEYS.includes(key));
  if (reserved) throw new Error(`defineListSearch: filter '${reserved[0]}' botst met een vast veld`);
  const apiShape = {
    q: query.optional(),
    ...Object.fromEntries(filterEntries.map(([key, values]) => [key, z.enum(values).optional()])),
    sort: z.enum(config.sorts).default(defaultSort),
    cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
  };
  const webShape = {
    q: webQuery.optional().catch(undefined),
    ...Object.fromEntries(filterEntries.map(([key, values]) => [key, z.enum(values).optional().catch(undefined)])),
    sort: z.enum(config.sorts).catch(defaultSort),
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
  };
}
