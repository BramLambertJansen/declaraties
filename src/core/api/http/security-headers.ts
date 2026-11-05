// Eén bron voor de headers van de SPA (framework §6, Verharding): de Vite-dev-server en `vite preview` (vite.config.ts) en de
// productieserver (web.ts) zetten exact deze waarden. Voor /api zet secureHeaders() in createApp zijn eigen set.

export function contentSecurityPolicy(nonce?: string): string {
  const extra = nonce === undefined ? '' : ` 'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self'${extra}`,
    `style-src 'self'${extra}`,
    "connect-src 'self'",
    "img-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

// Alleen de dev-server geeft een nonce mee (Vite en de React-preamble zetten inline tags); de build gebruikt er geen.
export function securityHeaders(nonce?: string): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(nonce),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}
