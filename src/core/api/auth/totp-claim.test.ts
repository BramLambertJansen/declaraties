import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// De TOTP-claim slaat een interne aanroep (auth.api.verifyTOTP zonder HTTP-verzoek) over (ADR 0075, spec inloggat-dichten
// OV-3). Dat mag alleen omdat de enige zo'n aanroeper de lokale dev-login is. Deze test faalt zodra er buiten
// src/core/api/dev/ een aanroep van verifyTOTP bijkomt, zodat die niet ongemerkt zonder claim draait.
const ROOT = path.resolve(import.meta.dirname, '../../..');
const SCRIPTS = path.resolve(ROOT, '../scripts');
// Aanroep, aanroep via een string-index en destructuring (`{ verifyTOTP }`, `verifyTOTP:`); geen losse vermelding in commentaar.
const CALL = /\.verifyTOTP\s*\(|\[\s*['"`]verifyTOTP['"`]\s*\]|\bverifyTOTP\s*[,}:]/;
const ALLOWED = new Set(['core/api/dev/login-as.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|m?js)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('interne aanroepers van verifyTOTP', () => {
  test('alleen de dev-login roept auth.api.verifyTOTP aan', () => {
    const callers = [...sourceFiles(ROOT), ...sourceFiles(SCRIPTS)]
      .filter((file) => CALL.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'));

    expect(callers.filter((file) => !ALLOWED.has(file))).toStrictEqual([]);
    expect(callers).toContain('core/api/dev/login-as.ts');
  });
});
