// Korte omschrijving van het apparaat uit de user-agent, zonder dependency (spec eigen-account): "Firefox op Windows".
// Alleen vaste namen uit deze lijsten komen in de uitvoer, nooit tekst uit de user-agent zelf.
const UNKNOWN_DEVICE = 'Onbekend apparaat';
// Een user-agent van een browser is korter; langer is onzin of een aanval op de reguliere expressies.
const MAX_USER_AGENT_LENGTH = 512;

// Volgorde telt: Edge en Opera bevatten ook "Chrome" en "Safari"; Chrome bevat ook "Safari".
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\bFirefox\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

// Volgorde telt: Android bevat ook "Linux"; iPhone en iPad bevatten ook "Mac OS X".
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\bWindows\b/, 'Windows'],
  [/\bAndroid\b/, 'Android'],
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b|\bX11\b/, 'Linux'],
];

function firstMatch(table: readonly (readonly [RegExp, string])[], text: string): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(text)) return name;
  }
  return null;
}

export function describeDevice(userAgent: string | null | undefined): string {
  if (userAgent === null || userAgent === undefined) return UNKNOWN_DEVICE;
  const text = userAgent.slice(0, MAX_USER_AGENT_LENGTH);
  const browser = firstMatch(BROWSERS, text);
  const system = firstMatch(SYSTEMS, text);
  if (browser === null || system === null) return UNKNOWN_DEVICE;
  return `${browser} op ${system}`;
}
