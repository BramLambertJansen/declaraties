import { OutboundUsageError } from './errors.ts';
import type { Target } from './config.ts';

// URL-bouw (spec uitgaande-client, URL): tekenreeks origin + padprefix + sjabloon, dan `new URL`; nooit `new URL(path, base)`.
// Meldingen noemen nooit een parameterwaarde of query.

export interface UrlParts {
  readonly path: string;
  readonly params?: Readonly<Record<string, string | number>> | undefined;
  readonly query?: Readonly<Record<string, string | number | boolean>> | undefined;
}

const TEMPLATE = /^\/[A-Za-z0-9\-._~/:]*$/;
const PLACEHOLDER = /^:([A-Za-z_][A-Za-z0-9_]*)$/;

const fail = (message: string): never => {
  throw new OutboundUsageError(`client.call: ${message}`);
};

function checkTemplate(path: string): readonly string[] {
  if (!TEMPLATE.test(path)) fail('het sjabloon begint niet met / of bevat een teken buiten [A-Za-z0-9-._~/:]');
  const segments = path.split('/').slice(1);
  if (path.includes('//') || segments.includes('..')) fail('het sjabloon bevat // of een ..-segment');
  return segments;
}

function paramValue(value: string | number): string {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('een parameter is geen eindig getal');
  const text = String(value);
  if (text === '' || text === '.' || text === '..') fail('een parameter is leeg, . of ..');
  return encodeURIComponent(text);
}

function fillTemplate(segments: readonly string[], params: Readonly<Record<string, string | number>>): string {
  const used = new Set<string>();
  const filled = segments.map((segment) => {
    if (!segment.startsWith(':')) return segment;
    const name = PLACEHOLDER.exec(segment)?.[1];
    if (name === undefined) return fail('een :naam in het sjabloon is ongeldig');
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    if (value === undefined) return fail('params mist een :naam uit het sjabloon');
    used.add(name);
    return paramValue(value);
  });
  if (Object.keys(params).some((key) => !used.has(key))) fail('params bevat een naam die niet in het sjabloon staat');
  return `/${filled.join('/')}`;
}

function queryString(query: Readonly<Record<string, string | number | boolean>> | undefined): string {
  if (query === undefined) return '';
  const search = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])).toString();
  return search === '' ? '' : `?${search}`;
}

export function buildUrl(target: Target, parts: UrlParts): URL {
  const path = fillTemplate(checkTemplate(parts.path), parts.params ?? {});
  let url: URL;
  try {
    url = new URL(`${target.origin}${target.prefix}${path}${queryString(parts.query)}`);
  } catch {
    return fail('de URL is ongeldig');
  }
  const { prefix } = target;
  const onBoundary = url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
  if (url.origin !== target.origin || !onBoundary) fail('de URL valt buiten baseUrl');
  return url;
}
