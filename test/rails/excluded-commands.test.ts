import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Sandbox-uitzonderingen kloppen met package.json (WS-03): elk patroon noemt een bestaand script, en elk script dat
// Docker start (runner.sh of docker, direct of via een ander script) staat in excludedCommands en in ask.
type Json = Record<string, unknown>;
interface Config {
  excluded: string[];
  ask: string[];
  scripts: Record<string, string>;
}

function readJson(file: string): Json {
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function section(value: unknown): Json {
  return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};
}

function load(settingsFile: string, packageFile: string): Config {
  const settings = readJson(settingsFile);
  const scripts = Object.fromEntries(
    Object.entries(section(readJson(packageFile)['scripts'])).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  return {
    excluded: strings(section(settings['sandbox'])['excludedCommands']),
    ask: strings(section(settings['permissions'])['ask']),
    scripts,
  };
}

function startsDocker(line: string, base: string): boolean {
  if (/\brunner\.sh\b|\bdocker\b/.test(line)) return true;
  const file = /(?:^|\s)(scripts\/[\w./-]+\.sh)\b/.exec(line)?.[1];
  if (file === undefined) return false;
  try {
    return /\brunner\.sh\b|\bdocker\b/.test(readFileSync(path.join(base, path.basename(file)), 'utf8'));
  } catch {
    return false;
  }
}

function references(line: string): string[] {
  return [...line.matchAll(/\bpnpm (?:run )?([\w:-]+)/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function dockerScripts(scripts: Record<string, string>, shellDir: string): string[] {
  const memo = new Map<string, boolean>();
  const visit = (name: string, seen: string[]): boolean => {
    const cached = memo.get(name);
    if (cached !== undefined) return cached;
    const line = scripts[name] ?? '';
    const result =
      startsDocker(line, shellDir) ||
      references(line).some((other) => !seen.includes(other) && visit(other, [...seen, name]));
    memo.set(name, result);
    return result;
  };
  return Object.keys(scripts).filter((name) => visit(name, [name]));
}

function problems(config: Config, shellDir: string): string[] {
  const missing = config.excluded.flatMap((pattern) => {
    const name = /^pnpm ([\w:-]+) \*$/.exec(pattern)?.[1];
    return name !== undefined && name in config.scripts
      ? []
      : [`excludedCommands "${pattern}": script bestaat niet in package.json`];
  });
  const uncovered = dockerScripts(config.scripts, shellDir).flatMap((name) => [
    ...(config.excluded.includes(`pnpm ${name} *`) ? [] : [`${name}: start Docker maar ontbreekt in excludedCommands`]),
    ...(config.ask.includes(`Bash(pnpm ${name} *)`) ? [] : [`${name}: start Docker maar ontbreekt in permissions.ask`]),
  ]);
  return [...missing, ...uncovered];
}

describe('excludedCommands: de checker zelf (fixture)', () => {
  const dir = path.resolve('test/rails/fixtures/excluded-commands');
  const config = load(path.join(dir, 'settings.json'), path.join(dir, 'package.json'));

  test('meldt een runner-script en een bestaand-script-gat dat ontbreekt', () => {
    expect(problems(config, dir)).toStrictEqual([
      'excludedCommands "pnpm db:reset *": script bestaat niet in package.json',
      'gate:slow: start Docker maar ontbreekt in excludedCommands',
      'gate:slow: start Docker maar ontbreekt in permissions.ask',
      'check:snapshot: start Docker maar ontbreekt in excludedCommands',
      'check:snapshot: start Docker maar ontbreekt in permissions.ask',
    ]);
  });
});

describe('excludedCommands: .claude/settings.json tegen package.json', () => {
  const config = load('.claude/settings.json', 'package.json');

  test('elk patroon noemt een script dat bestaat', () => {
    expect(problems(config, 'scripts').filter((line) => line.includes('bestaat niet'))).toStrictEqual([]);
  });

  test('elk script dat Docker start staat in excludedCommands en in ask', () => {
    expect(problems(config, 'scripts').filter((line) => line.includes('start Docker'))).toStrictEqual([]);
  });
});
